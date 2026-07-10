import { normalizeCountryKey } from "job-ops-shared/location-support";
import type { GlintsMarket } from "./types";

const GLINTS_MARKETS: readonly GlintsMarket[] = [
  {
    countryKey: "singapore",
    locale: "sg",
    countryCode: "SG",
    countryLabel: "Singapore",
  },
  {
    countryKey: "indonesia",
    locale: "id",
    countryCode: "ID",
    countryLabel: "Indonesia",
  },
  {
    countryKey: "malaysia",
    locale: "my",
    countryCode: "MY",
    countryLabel: "Malaysia",
  },
  {
    countryKey: "vietnam",
    locale: "vn",
    countryCode: "VN",
    countryLabel: "Vietnam",
  },
] as const;

const MARKET_BY_COUNTRY_KEY = new Map(
  GLINTS_MARKETS.map((market) => [market.countryKey, market]),
);

export const GLINTS_SUPPORTED_COUNTRY_KEYS = GLINTS_MARKETS.map(
  (market) => market.countryKey,
);

export function resolveGlintsMarket(
  selectedCountry: string | undefined,
): GlintsMarket | null {
  if (!selectedCountry) return null;
  const key = normalizeCountryKey(selectedCountry);
  return MARKET_BY_COUNTRY_KEY.get(key) ?? null;
}

export function buildGlintsExploreUrl(market: GlintsMarket): string {
  return `https://glints.com/${market.locale}/opportunities/jobs/explore`;
}

export function buildGlintsJobUrl(market: GlintsMarket, jobId: string): string {
  return `https://glints.com/${market.locale}/opportunities/jobs/${jobId}`;
}
