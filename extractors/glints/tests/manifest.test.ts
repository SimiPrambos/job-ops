import { beforeEach, describe, expect, it, vi } from "vitest";
import { runGlints } from "../src/run";

vi.mock("../src/run", () => ({
  runGlints: vi.fn(),
}));

describe("glints manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runGlints).mockResolvedValue({ success: true, jobs: [] });
  });

  it("registers the glints source", async () => {
    const { manifest } = await import("../manifest");

    expect(manifest.id).toBe("glints");
    expect(manifest.displayName).toBe("Glints");
    expect(manifest.providesSources).toEqual(["glints"]);
    expect(manifest.locationCapabilities?.glints?.supportedCountryKeys).toEqual(
      ["singapore", "indonesia", "malaysia", "vietnam"],
    );
  });

  it("skips unsupported countries without calling runGlints", async () => {
    const { manifest } = await import("../manifest");

    const result = await manifest.run({
      source: "glints",
      selectedSources: ["glints"],
      selectedCountry: "united kingdom",
      searchTerms: ["engineer"],
      settings: {},
    });

    expect(result).toEqual({ success: true, jobs: [] });
    expect(runGlints).not.toHaveBeenCalled();
  });

  it("passes runtime controls into runGlints", async () => {
    const { manifest } = await import("../manifest");
    const onProgress = vi.fn();
    const shouldCancel = vi.fn(() => false);

    await manifest.run({
      source: "glints",
      selectedSources: ["glints"],
      selectedCountry: "indonesia",
      searchTerms: ["backend engineer"],
      settings: {
        glintsMaxJobsPerTerm: "12",
      },
      shouldCancel,
      onProgress,
    });

    expect(runGlints).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCountry: "indonesia",
        searchTerms: ["backend engineer"],
        maxJobsPerTerm: 12,
        shouldCancel,
      }),
    );
  });

  it("surfaces challenge-required failures", async () => {
    vi.mocked(runGlints).mockResolvedValueOnce({
      success: false,
      jobs: [],
      challengeRequired: "https://glints.com/sg/opportunities/jobs/explore",
      error: "Glints requires a browser challenge solve",
    });

    const { manifest } = await import("../manifest");
    const result = await manifest.run({
      source: "glints",
      selectedSources: ["glints"],
      selectedCountry: "singapore",
      searchTerms: ["software engineer"],
      settings: {},
    });

    expect(result).toEqual({
      success: false,
      jobs: [],
      error: "Glints requires a browser challenge solve",
      challengeRequired: "https://glints.com/sg/opportunities/jobs/explore",
    });
  });
});
