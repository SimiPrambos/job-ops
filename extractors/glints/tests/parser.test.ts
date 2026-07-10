import { describe, expect, it } from "vitest";
import {
  buildGlintsExploreUrl,
  buildGlintsJobUrl,
  resolveGlintsMarket,
} from "../src/country";
import {
  extractJobsInPage,
  parseGlintsJob,
  parseGlintsJobs,
} from "../src/parser";
import type { GlintsMarket } from "../src/types";

const SG_MARKET: GlintsMarket = {
  countryKey: "singapore",
  locale: "sg",
  countryCode: "SG",
  countryLabel: "Singapore",
};

const FIXTURE_JOB = {
  id: "abc-123",
  title: "Software Engineer",
  company: { name: "Acme Pte Ltd", brandName: "Acme" },
  city: { name: "Singapore" },
  country: { code: "SG", name: "Singapore" },
  salaries: [
    {
      salaryType: "MONTHLY",
      salaryMode: "RANGE",
      minAmount: 5000,
      maxAmount: 8000,
      CurrencyCode: "SGD",
    },
  ],
  createdAt: "2026-06-01T10:00:00.000Z",
};

describe("resolveGlintsMarket", () => {
  it("maps SEA country keys", () => {
    expect(resolveGlintsMarket("Singapore")?.locale).toBe("sg");
    expect(resolveGlintsMarket("indonesia")?.countryCode).toBe("ID");
    expect(resolveGlintsMarket("Malaysia")?.locale).toBe("my");
    expect(resolveGlintsMarket("vietnam")?.locale).toBe("vn");
  });

  it("returns null for unsupported countries", () => {
    expect(resolveGlintsMarket("united kingdom")).toBeNull();
    expect(resolveGlintsMarket("")).toBeNull();
  });
});

describe("parseGlintsJob", () => {
  it("maps GraphQL job fields into CreateJobInput", () => {
    const job = parseGlintsJob(FIXTURE_JOB, SG_MARKET);
    expect(job).toMatchObject({
      source: "glints",
      sourceJobId: "abc-123",
      title: "Software Engineer",
      employer: "Acme Pte Ltd",
      jobUrl: "https://glints.com/sg/opportunities/jobs/abc-123",
      location: "Singapore, Singapore",
      salaryCurrency: "SGD",
      salaryMinAmount: 5000,
      salaryMaxAmount: 8000,
      locationEvidence: {
        countryKey: "singapore",
        source: "glints",
      },
    });
  });

  it("skips jobs without title or id", () => {
    expect(parseGlintsJob({ title: "x" }, SG_MARKET)).toBeNull();
    expect(parseGlintsJob({ id: "1" }, SG_MARKET)).toBeNull();
  });

  it("falls back to brandName for employer", () => {
    const job = parseGlintsJob(
      {
        id: "1",
        title: "Backend Engineer",
        company: { brandName: "BrandCo" },
      },
      SG_MARKET,
    );
    expect(job?.employer).toBe("BrandCo");
  });
});

describe("extractJobsInPage", () => {
  it("reads jobsInPage and hasMore", () => {
    const extracted = extractJobsInPage({
      data: {
        searchJobsV3: {
          jobsInPage: [FIXTURE_JOB],
          hasMore: true,
        },
      },
    });
    expect(extracted.jobs).toHaveLength(1);
    expect(extracted.hasMore).toBe(true);
    expect(extracted.errorMessage).toBeUndefined();
  });

  it("surfaces GraphQL errors", () => {
    const extracted = extractJobsInPage({
      errors: [{ message: "rate limited" }],
    });
    expect(extracted.jobs).toHaveLength(0);
    expect(extracted.errorMessage).toContain("rate limited");
  });
});

describe("parseGlintsJobs", () => {
  it("dedupes by job id", () => {
    const jobs = parseGlintsJobs([FIXTURE_JOB, FIXTURE_JOB], SG_MARKET);
    expect(jobs).toHaveLength(1);
  });
});

describe("url helpers", () => {
  it("builds explore and job urls", () => {
    expect(buildGlintsExploreUrl(SG_MARKET)).toBe(
      "https://glints.com/sg/opportunities/jobs/explore",
    );
    expect(buildGlintsJobUrl(SG_MARKET, "xyz")).toBe(
      "https://glints.com/sg/opportunities/jobs/xyz",
    );
  });
});
