import {
  createLaunchOptions,
  getCloudflareCookieStorageDir,
  invalidateCookies,
  isChallengePage,
  loadCookies,
  saveCookies,
  waitForChallengeResolution,
} from "browser-utils";
import { type Browser, firefox, type Page } from "playwright";
import { buildGlintsExploreUrl } from "./country";
import { buildSearchJobsV3Body, GLINTS_GRAPHQL_URL } from "./graphql";
import { extractJobsInPage } from "./parser";
import type { GlintsMarket, GlintsPageResult } from "./types";

const EXTRACTOR_ID = "glints";
const NAVIGATION_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 45_000;
const COOKIE_STORAGE_DIR = getCloudflareCookieStorageDir();

async function assertNoBlockingChallenge(
  page: Page,
  url: string,
): Promise<string | null> {
  if (await isChallengePage(page)) {
    const challenge = await waitForChallengeResolution(page, 30_000);
    if (challenge.status === "passed") {
      await saveCookies(page.context(), EXTRACTOR_ID, COOKIE_STORAGE_DIR);
      return null;
    }

    await invalidateCookies(EXTRACTOR_ID, COOKIE_STORAGE_DIR);
    return url;
  }

  const html = await page.content();
  if (
    html.toLowerCase().includes("firewall") ||
    html.toLowerCase().includes("access denied")
  ) {
    await invalidateCookies(EXTRACTOR_ID, COOKIE_STORAGE_DIR);
    return url;
  }

  return null;
}

async function postGraphQlFromPage(args: {
  page: Page;
  market: GlintsMarket;
  searchTerm: string;
  pageNo: number;
  pageSize: number;
}): Promise<unknown> {
  const body = buildSearchJobsV3Body({
    searchTerm: args.searchTerm,
    countryCode: args.market.countryCode,
    page: args.pageNo,
    pageSize: args.pageSize,
  });

  return await args.page.evaluate(
    async ({ url, payload, timeoutMs }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
          credentials: "include",
          signal: controller.signal,
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
        }
        return JSON.parse(text) as unknown;
      } finally {
        clearTimeout(timer);
      }
    },
    {
      url: GLINTS_GRAPHQL_URL,
      payload: body,
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
  );
}

export async function fetchGlintsSearchPageBrowser(args: {
  market: GlintsMarket;
  searchTerm: string;
  page: number;
  pageSize: number;
}): Promise<GlintsPageResult> {
  const exploreUrl = buildGlintsExploreUrl(args.market);
  let browser: Browser | null = null;

  try {
    const { launchOptions } = await createLaunchOptions({ headless: true });
    browser = await firefox.launch(launchOptions);
    const context = await browser.newContext();
    await loadCookies(context, EXTRACTOR_ID, COOKIE_STORAGE_DIR);
    const page = await context.newPage();
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

    await page.goto(exploreUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    const challengeUrl = await assertNoBlockingChallenge(page, exploreUrl);
    if (challengeUrl) {
      return {
        jobs: [],
        hasMore: false,
        challengeRequired: challengeUrl,
        usedBrowser: true,
      };
    }

    const payload = await postGraphQlFromPage({
      page,
      market: args.market,
      searchTerm: args.searchTerm,
      pageNo: args.page,
      pageSize: args.pageSize,
    });

    await saveCookies(context, EXTRACTOR_ID, COOKIE_STORAGE_DIR);

    const extracted = extractJobsInPage(payload);
    if (extracted.errorMessage && extracted.jobs.length === 0) {
      throw new Error(
        `Glints browser GraphQL error: ${extracted.errorMessage}`,
      );
    }

    return {
      jobs: extracted.jobs,
      hasMore: extracted.hasMore,
      usedBrowser: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/challenge|firewall|access denied|403/i.test(message)) {
      return {
        jobs: [],
        hasMore: false,
        challengeRequired: exploreUrl,
        usedBrowser: true,
      };
    }
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
