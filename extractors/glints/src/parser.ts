import type {
  CreateJobInput,
  JobLocationEvidence,
} from "job-ops-shared/types/jobs";
import { buildGlintsJobUrl } from "./country";
import type { GlintsMarket, GlintsRawJob, GlintsSalary } from "./types";

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDate(value: unknown): string | undefined {
  const raw = toStringOrNull(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function formatSalary(salaries: GlintsSalary[] | null | undefined): {
  salary?: string;
  salaryMinAmount?: number;
  salaryMaxAmount?: number;
  salaryCurrency?: string;
  salaryInterval?: string;
} {
  if (!Array.isArray(salaries) || salaries.length === 0) return {};

  const first = salaries[0];
  if (!first || typeof first !== "object") return {};

  const minAmount = toNumberOrNull(first.minAmount);
  const maxAmount = toNumberOrNull(first.maxAmount);
  const currency = toStringOrNull(first.CurrencyCode) ?? undefined;
  const interval = toStringOrNull(first.salaryType) ?? undefined;

  const parts: string[] = [];
  if (minAmount != null && maxAmount != null) {
    parts.push(`${minAmount.toLocaleString()} - ${maxAmount.toLocaleString()}`);
  } else if (minAmount != null) {
    parts.push(`from ${minAmount.toLocaleString()}`);
  } else if (maxAmount != null) {
    parts.push(`up to ${maxAmount.toLocaleString()}`);
  }
  if (currency) parts.push(currency);
  if (interval) parts.push(interval.toLowerCase());

  return {
    salary: parts.length > 0 ? parts.join(" ") : undefined,
    salaryMinAmount: minAmount ?? undefined,
    salaryMaxAmount: maxAmount ?? undefined,
    salaryCurrency: currency,
    salaryInterval: interval,
  };
}

export function parseGlintsJob(
  item: GlintsRawJob,
  market: GlintsMarket,
): CreateJobInput | null {
  if (!item || typeof item !== "object") return null;

  const title = toStringOrNull(item.title);
  const jobId = toStringOrNull(item.id);
  if (!title || !jobId) return null;

  const employer =
    toStringOrNull(item.company?.name) ??
    toStringOrNull(item.company?.brandName) ??
    "Unknown Employer";
  const city = toStringOrNull(item.city?.name);
  const countryName = toStringOrNull(item.country?.name) ?? market.countryLabel;
  const location = city ? `${city}, ${countryName}` : countryName;

  const locationEvidence: JobLocationEvidence = {
    rawLocation: city,
    location,
    city,
    countryKey: market.countryKey,
    country: market.countryKey,
    evidenceQuality: city ? "approximate" : "weak",
    source: "glints",
    sourceNotes: [`Glints locale ${market.locale} (${market.countryCode}).`],
  };

  const salaryFields = formatSalary(item.salaries);
  const jobUrl = buildGlintsJobUrl(market, jobId);

  return {
    source: "glints",
    sourceJobId: jobId,
    title,
    employer,
    jobUrl,
    applicationLink: jobUrl,
    location,
    locationEvidence,
    datePosted: normalizeDate(item.createdAt),
    ...salaryFields,
  };
}

export function parseGlintsJobs(
  items: unknown,
  market: GlintsMarket,
): CreateJobInput[] {
  if (!Array.isArray(items)) return [];

  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const job = parseGlintsJob(item as GlintsRawJob, market);
    if (!job) continue;
    const dedupeKey = job.sourceJobId ?? job.jobUrl;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    jobs.push(job);
  }

  return jobs;
}

export function extractJobsInPage(payload: unknown): {
  jobs: GlintsRawJob[];
  hasMore: boolean;
  errorMessage?: string;
} {
  if (!payload || typeof payload !== "object") {
    return { jobs: [], hasMore: false, errorMessage: "empty GraphQL response" };
  }

  const response = payload as {
    data?: {
      searchJobsV3?: {
        jobsInPage?: unknown;
        hasMore?: unknown;
      } | null;
    } | null;
    errors?: Array<{ message?: string }> | null;
  };

  if (Array.isArray(response.errors) && response.errors.length > 0) {
    const message =
      response.errors
        .map((error) => toStringOrNull(error?.message))
        .filter(Boolean)
        .join("; ") || "GraphQL errors";
    return { jobs: [], hasMore: false, errorMessage: message };
  }

  const jobsInPage = response.data?.searchJobsV3?.jobsInPage;
  if (!Array.isArray(jobsInPage)) {
    return {
      jobs: [],
      hasMore: false,
      errorMessage: "unexpected GraphQL response shape",
    };
  }

  return {
    jobs: jobsInPage as GlintsRawJob[],
    hasMore: response.data?.searchJobsV3?.hasMore === true,
  };
}
