import type { Feature, Geometry } from "geojson";
import type { PoiType } from "./types";

export type PoiFilters = { Park: boolean; Marina: boolean; Ferry: boolean };

export type PublicPoi = {
  type: PoiType;
  name: string;
  latitude: number;
  longitude: number;
  region?: string;
  reason?: string;
  imageUrl?: string;
  scoreBoost?: number;
  hasLiveFeed?: boolean;
  liveCameraUrl?: string;
  hasHydrophone?: boolean;
};

export type PoiDataBundle = {
  // Clean, displayable POIs used for map markers and recommendation cards.
  items: PublicPoi[];
  // Valid POIs from the source file before display-name quality filtering.
  // Used as the top-N percentage denominator so "top 5%" reflects the source file.
  sourceItems: PublicPoi[];
};

let poiDataBundlePromise: Promise<PoiDataBundle> | null = null;

export function normalizePoiType(value: unknown): PoiType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "park") return "Park";
  if (normalized === "marina") return "Marina";
  if (normalized === "ferry") return "Ferry";
  return "Other";
}

export function hasActivePoiFilter(filters?: PoiFilters | null) {
  return Boolean(filters?.Park || filters?.Marina || filters?.Ferry);
}

export function poiTypeMatchesFilters(
  type: PoiType,
  filters?: PoiFilters | null,
) {
  if (!filters) return true;
  if (type === "Park") return filters.Park;
  if (type === "Marina") return filters.Marina;
  if (type === "Ferry") return filters.Ferry;
  return false;
}

export function filterPoisByType<T extends { type: PoiType }>(
  pois: T[],
  filters?: PoiFilters | null,
) {
  if (!filters) return pois;
  return pois.filter((poi) => poiTypeMatchesFilters(poi.type, filters));
}

function flattenPositions(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number" && typeof value[1] === "number")
    return [value as number[]];
  return value.flatMap((item) => flattenPositions(item));
}

function geometryCenter(
  geometry: Geometry | null | undefined,
): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates;
    return Number.isFinite(lon) && Number.isFinite(lat)
      ? [Number(lon), Number(lat)]
      : null;
  }

  const positions = flattenPositions(
    "coordinates" in geometry ? geometry.coordinates : [],
  );
  const valid = positions.filter(
    (position) => Number.isFinite(position[0]) && Number.isFinite(position[1]),
  );
  if (valid.length === 0) return null;
  const sum = valid.reduce(
    (acc, position) => ({
      lon: acc.lon + Number(position[0]),
      lat: acc.lat + Number(position[1]),
    }),
    { lon: 0, lat: 0 },
  );
  return [sum.lon / valid.length, sum.lat / valid.length];
}

function normalizePoiItem(item: Record<string, unknown>): PublicPoi {
  return {
    type: normalizePoiType(item["type"] ?? item["category"]),
    name: String(item["name"] ?? "POI"),
    latitude: Number(item["latitude"]),
    longitude: Number(item["longitude"]),
    region: typeof item["region"] === "string" ? item["region"] : undefined,
    reason:
      typeof item["reason"] === "string"
        ? item["reason"]
        : typeof item["description"] === "string"
          ? item["description"]
          : undefined,
    imageUrl:
      typeof item["imageUrl"] === "string"
        ? item["imageUrl"]
        : typeof item["image_url"] === "string"
          ? item["image_url"]
          : undefined,
    scoreBoost: Number.isFinite(Number(item["scoreBoost"]))
      ? Number(item["scoreBoost"])
      : undefined,
    liveCameraUrl:
      typeof item["liveCameraUrl"] === "string"
        ? item["liveCameraUrl"]
        : typeof item["live_camera_url"] === "string"
          ? item["live_camera_url"]
          : undefined,
    hasLiveFeed: Boolean(
      item["hasLiveFeed"] ?? item["liveCameraUrl"] ?? item["live_feed_url"],
    ),
    hasHydrophone: Boolean(
      item["hasHydrophone"] ?? item["hydrophoneUrl"] ?? item["hydrophone_url"],
    ),
  };
}

function normalizeFeature(feature: Feature): Record<string, unknown> {
  const props = feature.properties ?? {};
  const coordinates =
    feature.geometry?.type === "Point"
      ? feature.geometry.coordinates
      : geometryCenter(feature.geometry);
  return {
    ...props,
    type: props["type"] ?? props["category"],
    name: props["name"] ?? "POI",
    latitude: coordinates ? Number(coordinates[1]) : Number.NaN,
    longitude: coordinates ? Number(coordinates[0]) : Number.NaN,
  };
}

function normalizePayload(payload: unknown): PoiDataBundle {
  const items = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === "object" &&
        "items" in payload &&
        Array.isArray((payload as { items?: unknown[] }).items)
      ? (payload as { items: unknown[] }).items
      : payload &&
          typeof payload === "object" &&
          "features" in payload &&
          Array.isArray((payload as { features?: Feature[] }).features)
        ? (payload as { features: Feature[] }).features.map(normalizeFeature)
        : [];

  const sourceItems = (items as Array<Record<string, unknown>>)
    .map(normalizePoiItem)
    .filter(
      (poi) =>
        poi.type !== "Other" &&
        poi.name.trim().length > 0 &&
        Number.isFinite(poi.latitude) &&
        Number.isFinite(poi.longitude),
    );

  return {
    sourceItems,
    // Keep generic inventory-style marina entries available to the UI for now.
    items: sourceItems,
  };
}

async function fetchPoiDataBundle(): Promise<PoiDataBundle> {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const candidates = Array.from(
    new Set([
      `${normalizedBase}data/places_of_interest.json`,
      "/data/places_of_interest.json",
      "data/places_of_interest.json",
    ]),
  );

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      return normalizePayload(await response.json());
    } catch {
      // Try next candidate URL.
    }
  }

  throw new Error("Failed to load POI data from places_of_interest.json");
}

export function loadPoiDataBundle() {
  poiDataBundlePromise ??= fetchPoiDataBundle();
  return poiDataBundlePromise;
}

export async function loadPoiData() {
  return (await loadPoiDataBundle()).items;
}

export function resetPoiDataCacheForTests() {
  poiDataBundlePromise = null;
}
