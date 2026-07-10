import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "job-ops-shared/types/extractors";
import {
  GLINTS_SUPPORTED_COUNTRY_KEYS,
  resolveGlintsMarket,
} from "./src/country";
import { runGlints } from "./src/run";

function toProgress(event: {
  type: string;
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  pageNo?: number;
  totalCollected?: number;
  jobsFoundTerm?: number;
}): ExtractorProgressEvent {
  if (event.type === "term_start") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      currentUrl: event.searchTerm,
      detail: `Glints: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
    };
  }

  if (event.type === "page_fetched") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      listPagesProcessed: event.pageNo ?? 0,
      jobPagesEnqueued: event.totalCollected ?? 0,
      jobPagesProcessed: event.totalCollected ?? 0,
      currentUrl: `page ${event.pageNo ?? 0}`,
      detail: `Glints: term ${event.termIndex}/${event.termTotal}, page ${event.pageNo ?? 0} (${event.totalCollected ?? 0} collected)`,
    };
  }

  return {
    phase: "list",
    termsProcessed: event.termIndex,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    jobPagesEnqueued: event.jobsFoundTerm ?? 0,
    jobPagesProcessed: event.jobsFoundTerm ?? 0,
    detail: `Glints: completed ${event.termIndex}/${event.termTotal} (${event.searchTerm}) with ${event.jobsFoundTerm ?? 0} jobs`,
  };
}

export const manifest: ExtractorManifest = {
  id: "glints",
  displayName: "Glints",
  providesSources: ["glints"],
  capabilities: { locationEvidence: true },
  locationCapabilities: {
    glints: { supportedCountryKeys: [...GLINTS_SUPPORTED_COUNTRY_KEYS] },
  },
  async run(context) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    if (!resolveGlintsMarket(context.selectedCountry)) {
      return { success: true, jobs: [] };
    }

    const parsedMaxJobsPerTerm = context.settings.glintsMaxJobsPerTerm
      ? Number.parseInt(context.settings.glintsMaxJobsPerTerm, 10)
      : context.settings.jobspyResultsWanted
        ? Number.parseInt(context.settings.jobspyResultsWanted, 10)
        : Number.NaN;

    const result = await runGlints({
      selectedCountry: context.selectedCountry,
      searchTerms: context.searchTerms,
      maxJobsPerTerm: Number.isFinite(parsedMaxJobsPerTerm)
        ? parsedMaxJobsPerTerm
        : undefined,
      shouldCancel: context.shouldCancel,
      onProgress: (event) => {
        if (context.shouldCancel?.()) return;
        context.onProgress?.(toProgress(event));
      },
    });

    if (!result.success) {
      return {
        success: false,
        jobs: [],
        error: result.error,
        challengeRequired: result.challengeRequired,
      };
    }

    return {
      success: true,
      jobs: result.jobs,
    };
  },
};

export default manifest;
