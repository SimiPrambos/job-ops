import { describe, expect, it, vi } from "vitest";
import {
  fetchGlintsSearchPageHttp,
  GlintsHttpBlockedError,
  isWafBlockedResponse,
} from "../src/fetcher";
import { runGlints } from "../src/run";
import type { GlintsMarket } from "../src/types";

const SG_MARKET: GlintsMarket = {
  countryKey: "singapore",
  locale: "sg",
  countryCode: "SG",
  countryLabel: "Singapore",
};

const SUCCESS_BODY = JSON.stringify({
  data: {
    searchJobsV3: {
      jobsInPage: [
        {
          id: "job-1",
          title: "Platform Engineer",
          company: { name: "Glints Co" },
          city: { name: "Singapore" },
          country: { code: "SG", name: "Singapore" },
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      hasMore: false,
    },
  },
});

describe("isWafBlockedResponse", () => {
  it("detects firewall pages", () => {
    expect(isWafBlockedResponse(403, "<title>Glints - Firewall</title>")).toBe(
      true,
    );
    expect(isWafBlockedResponse(200, '{"data":{}}')).toBe(false);
  });
});

describe("fetchGlintsSearchPageHttp", () => {
  it("parses a successful GraphQL response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SUCCESS_BODY,
    });

    const result = await fetchGlintsSearchPageHttp({
      market: SG_MARKET,
      searchTerm: "platform engineer",
      page: 1,
      pageSize: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("throws GlintsHttpBlockedError on WAF 403", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "<title>Glints - Firewall</title>",
    });

    await expect(
      fetchGlintsSearchPageHttp({
        market: SG_MARKET,
        searchTerm: "engineer",
        page: 1,
        pageSize: 10,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(GlintsHttpBlockedError);
  });
});

describe("runGlints", () => {
  it("returns empty jobs for unsupported countries", async () => {
    const result = await runGlints({
      selectedCountry: "united kingdom",
      searchTerms: ["engineer"],
      disableBrowserFallback: true,
    });
    expect(result).toEqual({ success: true, jobs: [] });
  });

  it("maps HTTP results into CreateJobInput", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => SUCCESS_BODY,
    });

    const result = await runGlints({
      selectedCountry: "singapore",
      searchTerms: ["platform engineer"],
      maxJobsPerTerm: 5,
      disableBrowserFallback: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      source: "glints",
      title: "Platform Engineer",
      employer: "Glints Co",
      sourceJobId: "job-1",
    });
  });

  it("honors maxJobsPerTerm across pages", async () => {
    const pageBodies = [
      JSON.stringify({
        data: {
          searchJobsV3: {
            jobsInPage: [
              { id: "a", title: "A", company: { name: "Co" } },
              { id: "b", title: "B", company: { name: "Co" } },
            ],
            hasMore: true,
          },
        },
      }),
      JSON.stringify({
        data: {
          searchJobsV3: {
            jobsInPage: [{ id: "c", title: "C", company: { name: "Co" } }],
            hasMore: false,
          },
        },
      }),
    ];
    let call = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      const body = pageBodies[call] ?? pageBodies[pageBodies.length - 1];
      call += 1;
      return {
        ok: true,
        status: 200,
        text: async () => body,
      };
    });

    const result = await runGlints({
      selectedCountry: "singapore",
      searchTerms: ["engineer"],
      maxJobsPerTerm: 2,
      pageSize: 2,
      disableBrowserFallback: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.map((job) => job.sourceJobId)).toEqual(["a", "b"]);
  });
});
