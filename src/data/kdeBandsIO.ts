import type { Feature, FeatureCollection } from "geojson";
import { fetchJson } from "./fetchClient";
import { getDataVersionToken } from "./meta";

type KdeBandsFeature = Feature & {
  properties?: {
    band_index?: number;
    bin?: number;
    color?: string;
    fill?: string;
    [key: string]: unknown;
  };
};

const kdeBandsCache = new Map<string, FeatureCollection>();

function getBandIndex(feature: Feature): number {
  const props = (feature as KdeBandsFeature).properties;
  const raw = props?.band_index ?? props?.bin;
  return Number(raw);
}

function sortBands(features: Feature[]): Feature[] {
  return [...features].sort((a, b) => {
    const ai = getBandIndex(a);
    const bi = getBandIndex(b);
    if (Number.isNaN(ai) && Number.isNaN(bi)) return 0;
    if (Number.isNaN(ai)) return 1;
    if (Number.isNaN(bi)) return -1;
    return ai - bi;
  });
}

export function buildKdeBandsCacheKey(params: {
  runId: string;
  resolution: string;
  year: number;
  statWeek: number;
  areaMinKm2: number;
  holeMinKm2: number | null;
  folder?: string;
}): string {
  return [
    params.runId,
    params.folder ?? "forecast_geojson/kde_bands",
    params.resolution,
    params.year,
    params.statWeek,
    "kde_geojson",
    `area:${params.areaMinKm2}`,
    `hole:${params.holeMinKm2 ?? "none"}`,
  ].join("|");
}

export async function loadKdeBandsGeojson(
  path: string,
  cacheKey: string
): Promise<FeatureCollection> {
  const cached = kdeBandsCache.get(cacheKey);
  if (cached) return cached;
  const { data } = await fetchJson<FeatureCollection>(path, {
    cache: "no-store",
    cacheToken: getDataVersionToken(),
  });
  const sorted: FeatureCollection = {
    ...data,
    features: Array.isArray(data.features) ? sortBands(data.features) : [],
  };
  kdeBandsCache.set(cacheKey, sorted);
  return sorted;
}
