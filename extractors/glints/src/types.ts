import type { CreateJobInput } from "job-ops-shared/types/jobs";

export type GlintsLocale = "sg" | "id" | "my" | "vn";
export type GlintsCountryCode = "SG" | "ID" | "MY" | "VN";

export interface GlintsMarket {
  countryKey: string;
  locale: GlintsLocale;
  countryCode: GlintsCountryCode;
  countryLabel: string;
}

export interface GlintsSalary {
  salaryType?: unknown;
  salaryMode?: unknown;
  maxAmount?: unknown;
  minAmount?: unknown;
  CurrencyCode?: unknown;
}

export interface GlintsRawJob {
  id?: unknown;
  title?: unknown;
  company?: {
    name?: unknown;
    brandName?: unknown;
  } | null;
  city?: {
    name?: unknown;
  } | null;
  country?: {
    code?: unknown;
    name?: unknown;
  } | null;
  salaries?: GlintsSalary[] | null;
  createdAt?: unknown;
}

export interface GlintsSearchResponse {
  data?: {
    searchJobsV3?: {
      jobsInPage?: unknown;
      hasMore?: unknown;
      expInfo?: unknown;
    } | null;
  } | null;
  errors?: Array<{ message?: string }> | null;
}

export type GlintsProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "page_fetched";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      pageNo: number;
      resultsOnPage: number;
      totalCollected: number;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunGlintsOptions {
  selectedCountry: string;
  searchTerms?: string[];
  maxJobsPerTerm?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  /** When true, skip Playwright fallback (useful for unit tests). */
  disableBrowserFallback?: boolean;
  shouldCancel?: () => boolean;
  onProgress?: (event: GlintsProgressEvent) => void;
}

export interface GlintsResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
  challengeRequired?: string;
}

export interface GlintsPageResult {
  jobs: GlintsRawJob[];
  hasMore: boolean;
  challengeRequired?: string;
  usedBrowser?: boolean;
}
