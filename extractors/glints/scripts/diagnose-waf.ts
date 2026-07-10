/**
 * Local diagnostic for Glints WAF / GraphQL behavior.
 * Run: DATA_DIR=./data-glints-diag npx tsx extractors/glints/scripts/diagnose-waf.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createLaunchOptions,
  getCloudflareCookieStorageDir,
  isChallengePage,
  isNonCfBlockPage,
  isSolverWaitPage,
  saveCookies,
} from "browser-utils";
import { firefox } from "playwright";
import { buildGlintsExploreUrl, resolveGlintsMarket } from "../src/country";
import {
  buildGlintsRequestHeaders,
  buildSearchJobsV3Body,
  GLINTS_GRAPHQL_URL,
} from "../src/graphql";

const market = resolveGlintsMarket("indonesia");
if (!market) throw new Error("market missing");

const exploreUrl = buildGlintsExploreUrl(market);
const outDir = join(process.cwd(), "data-glints-diag");
mkdirSync(outDir, { recursive: true });

function snippet(text: string, n = 400): string {
  return text.replace(/\s+/g, " ").trim().slice(0, n);
}

async function probeHttp(): Promise<void> {
  console.log("\n=== 1) Plain HTTP GraphQL ===");
  const body = buildSearchJobsV3Body({
    searchTerm: "software engineer",
    countryCode: market.countryCode,
    page: 1,
    pageSize: 2,
  });
  const res = await fetch(GLINTS_GRAPHQL_URL, {
    method: "POST",
    headers: buildGlintsRequestHeaders(exploreUrl),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log("status", res.status);
  console.log("body", snippet(text));
  writeFileSync(join(outDir, "http-graphql.txt"), text);
}

async function probeBrowser(headless: boolean): Promise<void> {
  const label = headless ? "headless" : "headed";
  console.log(
    `\n=== 2) Browser ${label}: open explore + GraphQL from page ===`,
  );
  const { launchOptions } = await createLaunchOptions({ headless });
  const browser = await firefox.launch(launchOptions);
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(exploreUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const html = await page.content();
    const title = await page.title();
    console.log("nav status", response?.status());
    console.log("title", title);
    console.log("url", page.url());
    console.log("isChallengePage", await isChallengePage(page));
    console.log("isNonCfBlockPage", await isNonCfBlockPage(page));
    console.log("isSolverWaitPage", await isSolverWaitPage(page));
    console.log("html snippet", snippet(html));
    writeFileSync(join(outDir, `${label}-explore.html`), html);

    const gqlBody = buildSearchJobsV3Body({
      searchTerm: "software engineer",
      countryCode: market.countryCode,
      page: 1,
      pageSize: 2,
    });
    const gql = await page.evaluate(
      async ({ url, payload }) => {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        const text = await res.text();
        return { status: res.status, text: text.slice(0, 1000) };
      },
      { url: GLINTS_GRAPHQL_URL, payload: gqlBody },
    );
    console.log("graphql from page", gql.status, snippet(gql.text));
    writeFileSync(
      join(outDir, `${label}-graphql.txt`),
      `${gql.status}\n${gql.text}`,
    );

    const storageDir = getCloudflareCookieStorageDir(join(outDir, "cookies"));
    const saved = await saveCookies(context, "glints-diag", storageDir, {
      persistAll: true,
      allowEmptyWithUserAgent: true,
    });
    console.log("cookies saved count", saved, "dir", storageDir);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("exploreUrl", exploreUrl);
  console.log("platform", process.platform, "DISPLAY", process.env.DISPLAY);
  await probeHttp();
  await probeBrowser(true);
  // Headed only if not in CI / if DISPLAY or non-linux
  if (process.platform !== "linux" || process.env.DISPLAY) {
    await probeBrowser(false);
  } else {
    console.log("\n=== skip headed (no DISPLAY on linux) ===");
  }
  console.log("\nDone. Artifacts in", outDir);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
