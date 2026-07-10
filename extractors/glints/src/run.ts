import type { CreateJobInput } from "job-ops-shared/types/jobs";
import { fetchGlintsSearchPageBrowser } from "./browser-fetcher";
import { resolveGlintsMarket } from "./country";
import { fetchGlintsSearchPageHttp, GlintsHttpBlockedError } from "./fetcher";
import { parseGlintsJobs } from "./parser";
import type {
  GlintsMarket,
  GlintsPageResult,
  GlintsResult,
  RunGlintsOptions,
} from "./types";

const DEFAULT_MAX_JOBS_PER_TERM = 50;
const DEFAULT_PAGE_SIZE = 30;
const PAGE_DELAY_MS = 300;

function toPositiveIntOrFallback(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value as number));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSearchPage(args: {
  market: GlintsMarket;
  searchTerm: string;
  page: number;
  pageSize: number;
  fetchImpl?: typeof fetch;
  disableBrowserFallback?: boolean;
  preferBrowser?: boolean;
}): Promise<GlintsPageResult> {
  if (args.preferBrowser && !args.disableBrowserFallback) {
    return await fetchGlintsSearchPageBrowser({
      market: args.market,
      searchTerm: args.searchTerm,
      page: args.page,
      pageSize: args.pageSize,
    });
  }

  try {
    return await fetchGlintsSearchPageHttp({
      market: args.market,
      searchTerm: args.searchTerm,
      page: args.page,
      pageSize: args.pageSize,
      fetchImpl: args.fetchImpl,
    });
  } catch (error) {
    if (
      error instanceof GlintsHttpBlockedError &&
      !args.disableBrowserFallback
    ) {
      return await fetchGlintsSearchPageBrowser({
        market: args.market,
        searchTerm: args.searchTerm,
        page: args.page,
        pageSize: args.pageSize,
      });
    }
    throw error;
  }
}

export async function runGlints(
  options: RunGlintsOptions,
): Promise<GlintsResult> {
  const market = resolveGlintsMarket(options.selectedCountry);
  if (!market) {
    return { success: true, jobs: [] };
  }

  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = toPositiveIntOrFallback(
    options.maxJobsPerTerm,
    DEFAULT_MAX_JOBS_PER_TERM,
  );
  const pageSize = Math.min(
    toPositiveIntOrFallback(options.pageSize, DEFAULT_PAGE_SIZE),
    maxJobsPerTerm,
  );

  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();
  let preferBrowser = false;

  try {
    for (const [index, searchTerm] of searchTerms.entries()) {
      if (options.shouldCancel?.()) {
        return { success: true, jobs };
      }

      options.onProgress?.({
        type: "term_start",
        termIndex: index + 1,
        termTotal: searchTerms.length,
        searchTerm,
      });

      let jobsFoundTerm = 0;
      let page = 1;
      let hasMore = true;

      while (hasMore && jobsFoundTerm < maxJobsPerTerm) {
        if (options.shouldCancel?.()) {
          return { success: true, jobs };
        }

        const remaining = maxJobsPerTerm - jobsFoundTerm;
        const requestPageSize = Math.min(pageSize, remaining);
        const pageResult = await fetchSearchPage({
          market,
          searchTerm,
          page,
          pageSize: requestPageSize,
          fetchImpl: options.fetchImpl,
          disableBrowserFallback: options.disableBrowserFallback,
          preferBrowser,
        });

        if (pageResult.challengeRequired) {
          return {
            success: false,
            jobs,
            challengeRequired: pageResult.challengeRequired,
            error: "Glints requires a browser challenge solve",
          };
        }

        if (pageResult.usedBrowser) {
          preferBrowser = true;
        }

        const mapped = parseGlintsJobs(pageResult.jobs, market);
        let resultsOnPage = 0;
        for (const job of mapped) {
          if (jobsFoundTerm >= maxJobsPerTerm) break;
          const dedupeKey = job.sourceJobId ?? job.jobUrl;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          jobs.push(job);
          jobsFoundTerm += 1;
          resultsOnPage += 1;
        }

        options.onProgress?.({
          type: "page_fetched",
          termIndex: index + 1,
          termTotal: searchTerms.length,
          searchTerm,
          pageNo: page,
          resultsOnPage,
          totalCollected: jobsFoundTerm,
        });

        hasMore =
          pageResult.hasMore &&
          pageResult.jobs.length > 0 &&
          jobsFoundTerm < maxJobsPerTerm;
        page += 1;

        if (hasMore) {
          await sleep(PAGE_DELAY_MS);
        }
      }

      options.onProgress?.({
        type: "term_complete",
        termIndex: index + 1,
        termTotal: searchTerms.length,
        searchTerm,
        jobsFoundTerm,
      });
    }

    return { success: true, jobs };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected error while running Glints extractor.";

    return { success: false, jobs: [], error: message };
  }
}
