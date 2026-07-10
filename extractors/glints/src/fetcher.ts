import { buildGlintsExploreUrl } from "./country";
import {
  buildGlintsRequestHeaders,
  buildSearchJobsV3Body,
  GLINTS_GRAPHQL_URL,
} from "./graphql";
import { extractJobsInPage } from "./parser";
import type { GlintsMarket, GlintsPageResult } from "./types";

export class GlintsHttpBlockedError extends Error {
  readonly status: number;
  readonly bodySnippet: string;

  constructor(status: number, bodySnippet: string) {
    super(`Glints HTTP blocked with status ${status}`);
    this.name = "GlintsHttpBlockedError";
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

export function isWafBlockedResponse(status: number, body: string): boolean {
  if (status === 403 || status === 429) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("firewall") ||
    lower.includes("access denied") ||
    lower.includes("cf-challenge") ||
    lower.includes("just a moment")
  );
}

export async function fetchGlintsSearchPageHttp(args: {
  market: GlintsMarket;
  searchTerm: string;
  page: number;
  pageSize: number;
  fetchImpl?: typeof fetch;
}): Promise<GlintsPageResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const referer = buildGlintsExploreUrl(args.market);
  const body = buildSearchJobsV3Body({
    searchTerm: args.searchTerm,
    countryCode: args.market.countryCode,
    page: args.page,
    pageSize: args.pageSize,
  });

  const response = await fetchImpl(GLINTS_GRAPHQL_URL, {
    method: "POST",
    headers: buildGlintsRequestHeaders(referer),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok || isWafBlockedResponse(response.status, text)) {
    throw new GlintsHttpBlockedError(response.status, text.slice(0, 300));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Glints GraphQL returned non-JSON response (${response.status})`,
    );
  }

  const extracted = extractJobsInPage(payload);
  if (extracted.errorMessage && extracted.jobs.length === 0) {
    throw new Error(`Glints GraphQL error: ${extracted.errorMessage}`);
  }

  return {
    jobs: extracted.jobs,
    hasMore: extracted.hasMore,
    usedBrowser: false,
  };
}
