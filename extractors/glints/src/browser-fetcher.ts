import {
  createLaunchOptions,
  getCloudflareCookieStorageDir,
  invalidateCookies,
  isChallengePage,
  isNonCfBlockPage,
  loadCookies,
  readCookieJar,
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

function isMissingDisplayError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cannot open display/i.test(message);
}

async function assertNoBlockingChallenge(
  page: Page,
  url: string,
  options: { invalidateOnBlock: boolean },
): Promise<string | null> {
  if (await isChallengePage(page)) {
    const challenge = await waitForChallengeResolution(page, 30_000);
    if (challenge.status === "passed") {
      await saveCookies(page.context(), EXTRACTOR_ID, COOKIE_STORAGE_DIR, {
        persistAll: true,
        allowEmptyWithUserAgent: true,
      });
      return null;
    }

    if (options.invalidateOnBlock) {
      await invalidateCookies(EXTRACTOR_ID, COOKIE_STORAGE_DIR);
    }
    return url;
  }

  if (await isNonCfBlockPage(page)) {
    // Do not wipe a just-solved headed session when headless is still blocked.
    // The caller may retry headed while Xvfb from the challenge viewer is up.
    if (options.invalidateOnBlock) {
      await invalidateCookies(EXTRACTOR_ID, COOKIE_STORAGE_DIR);
    }
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

async function fetchWithBrowser(args: {
  market: GlintsMarket;
  searchTerm: string;
  page: number;
  pageSize: number;
  headless: boolean;
  invalidateOnBlock: boolean;
}): Promise<GlintsPageResult> {
  const exploreUrl = buildGlintsExploreUrl(args.market);
  let browser: Browser | null = null;

  try {
    const cookieJar = await readCookieJar(EXTRACTOR_ID, COOKIE_STORAGE_DIR);
    const { launchOptions } = await createLaunchOptions({
      headless: args.headless,
    });
    browser = await firefox.launch(launchOptions);
    const context = await browser.newContext({
      ...(cookieJar.userAgent ? { userAgent: cookieJar.userAgent } : {}),
    });
    await loadCookies(context, EXTRACTOR_ID, COOKIE_STORAGE_DIR);
    const page = await context.newPage();
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

    await page.goto(exploreUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    const challengeUrl = await assertNoBlockingChallenge(page, exploreUrl, {
      invalidateOnBlock: args.invalidateOnBlock,
    });
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

    await saveCookies(context, EXTRACTOR_ID, COOKIE_STORAGE_DIR, {
      persistAll: true,
      allowEmptyWithUserAgent: true,
    });

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
    if (isMissingDisplayError(error)) {
      throw error;
    }

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

/**
 * Fetch Glints search results via Camoufox.
 *
 * Strategy:
 * 1. Headless first (safe when Xvfb is not running).
 * 2. If blocked and a headed solve already persisted a session, retry headed.
 *    After Solve, `ensureChallengeViewer` leaves Xvfb on DISPLAY=:99, so headed
 *    works for the pipeline retry without asking the user again.
 */
export async function fetchGlintsSearchPageBrowser(args: {
  market: GlintsMarket;
  searchTerm: string;
  page: number;
  pageSize: number;
}): Promise<GlintsPageResult> {
  const headlessResult = await fetchWithBrowser({
    ...args,
    headless: true,
    // Keep any previously solved session for a headed retry.
    invalidateOnBlock: false,
  });

  if (!headlessResult.challengeRequired) {
    return headlessResult;
  }

  const cookieJar = await readCookieJar(EXTRACTOR_ID, COOKIE_STORAGE_DIR);
  // Linux containers need DISPLAY (Xvfb). macOS/Windows headed Camoufox works
  // without DISPLAY when running outside Docker.
  const displayAvailable =
    process.platform !== "linux" || Boolean(process.env.DISPLAY?.trim());
  const canRetryHeaded =
    displayAvailable &&
    (cookieJar.hasCookies || Boolean(cookieJar.userAgent));

  if (!canRetryHeaded) {
    return headlessResult;
  }

  try {
    return await fetchWithBrowser({
      ...args,
      headless: false,
      invalidateOnBlock: true,
    });
  } catch (error) {
    if (isMissingDisplayError(error)) {
      // Xvfb is not up yet — fall back to the original challenge pause.
      return headlessResult;
    }
    throw error;
  }
}
