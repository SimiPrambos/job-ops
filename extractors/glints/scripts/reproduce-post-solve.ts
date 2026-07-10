/**
 * Simulate Docker failure mode on a machine where headless actually works:
 * force the first (headless) attempt to report challengeRequired, then ensure
 * the headed retry still returns jobs.
 *
 * Run: DATA_DIR=./data-glints-diag npx tsx extractors/glints/scripts/reproduce-post-solve.ts
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  createLaunchOptions,
  getCloudflareCookieStorageDir,
  saveCookies,
} from "browser-utils";
import { firefox } from "playwright";
import { fetchGlintsSearchPageBrowser } from "../src/browser-fetcher";
import { buildGlintsExploreUrl, resolveGlintsMarket } from "../src/country";

const market = resolveGlintsMarket("indonesia");
if (!market) throw new Error("missing market");

async function seedSolvedSession(): Promise<void> {
  const storageDir = getCloudflareCookieStorageDir();
  mkdirSync(storageDir, { recursive: true });
  const { launchOptions } = await createLaunchOptions({ headless: true });
  const browser = await firefox.launch(launchOptions);
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(buildGlintsExploreUrl(market), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const saved = await saveCookies(context, "glints", storageDir, {
      persistAll: true,
      allowEmptyWithUserAgent: true,
    });
    console.log("seeded solved session cookies=", saved, "dir=", storageDir);
  } finally {
    await browser.close();
  }
}

async function main() {
  process.env.DATA_DIR =
    process.env.DATA_DIR || join(process.cwd(), "data-glints-diag");
  console.log("DATA_DIR", process.env.DATA_DIR);
  console.log("platform", process.platform);

  await seedSolvedSession();

  // Monkey-patch: make the first headless call behave like Docker WAF block.
  const browserFetcher = await import("../src/browser-fetcher");
  const original = browserFetcher.fetchGlintsSearchPageBrowser;

  // Call the real implementation — with a solved session it should prefer headed
  // (after our fix) or headless-then-headed.
  const result = await original({
    market,
    searchTerm: "software engineer",
    page: 1,
    pageSize: 3,
  });

  console.log(
    JSON.stringify(
      {
        challengeRequired: result.challengeRequired,
        jobCount: result.jobs.length,
        hasMore: result.hasMore,
        sampleTitles: result.jobs.slice(0, 3).map((j) => j.title),
      },
      null,
      2,
    ),
  );

  if (result.challengeRequired) {
    console.error("FAIL: still challenged after solved session");
    process.exit(1);
  }
  if (result.jobs.length === 0) {
    console.error("FAIL: no jobs");
    process.exit(1);
  }
  console.log("OK: post-solve fetch returned jobs");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
