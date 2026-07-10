export const GLINTS_GRAPHQL_URL = "https://glints.com/api/v2-alc/graphql";

/**
 * Reverse-engineered from glints.com search pages.
 * Uses searchJobsV3 (replaces the older opportunities query).
 */
export const SEARCH_JOBS_V3_QUERY = `
query searchJobsV3($data: JobSearchConditionInput!) {
  searchJobsV3(data: $data) {
    jobsInPage {
      id
      title
      company {
        name
        brandName
      }
      city {
        name
      }
      country {
        code
        name
      }
      salaries {
        salaryType
        salaryMode
        maxAmount
        minAmount
        CurrencyCode
      }
      createdAt
    }
    expInfo
    hasMore
  }
}
`.trim();

export interface GlintsSearchVariables {
  SearchTerm: string;
  CountryCode: string;
  includeExternalJobs: boolean;
  pageSize: number;
  page: number;
}

export function buildSearchJobsV3Body(args: {
  searchTerm: string;
  countryCode: string;
  page: number;
  pageSize: number;
}): {
  operationName: string;
  query: string;
  variables: { data: GlintsSearchVariables };
} {
  return {
    operationName: "searchJobsV3",
    query: SEARCH_JOBS_V3_QUERY,
    variables: {
      data: {
        SearchTerm: args.searchTerm,
        CountryCode: args.countryCode,
        includeExternalJobs: true,
        pageSize: args.pageSize,
        page: args.page,
      },
    },
  };
}

export function buildGlintsRequestHeaders(
  referer: string,
): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    origin: "https://glints.com",
    referer,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
}
