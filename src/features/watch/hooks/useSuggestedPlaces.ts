import { useEffect, useState } from "react";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { H3Resolution } from "../../../shared/config/dataPaths";
import { loadForecast, loadGrid } from "../../../shared/data/forecastIO";
import { getH3CellId } from "../../../shared/data/h3";
import type { PoiType, SuggestedPlace, ViewingPotential } from "../../locations/types";

type RawPoi = {
  type: PoiType;
  name: string;
  latitude: number;
  longitude: number;
  region?: string;
  hasLiveFeed?: boolean;
  hasHydrophone?: boolean;
};

type TopForecastCell = {
  value: number;
  center: [number, number];
  geometry: Geometry;
};

type UseSuggestedPlacesArgs = {
  resolution: H3Resolution;
  modelId: string;
  forecastPath?: string;
  fallbackForecastPath?: string;
  enabled?: boolean;
  limit?: number;
};

type UseSuggestedPlacesResult = {
  places: SuggestedPlace[];
  isLoading: boolean;
  error: string | null;
};

const TOP_FORECAST_FRACTION = 0.1;
const MAX_TOP_CELLS = 350;
const NEARBY_RADIUS_KM = 22;
const DEFAULT_LIMIT = 10;

function normalizePoiType(value: unknown): PoiType {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "park") return "Park";
  if (normalized === "marina") return "Marina";
  if (normalized === "ferry") return "Ferry";
  return "Other";
}

function normalizeId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "place";
}

function toPlaceId(poi: RawPoi) {
  return `${normalizeId(poi.name)}-${poi.latitude.toFixed(4)}-${poi.longitude.toFixed(4)}`;
}

function flattenPositions(value: unknown): Position[] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number" && typeof value[1] === "number") return [value as Position];
  return value.flatMap((item) => flattenPositions(item));
}

function geometryCenter(geometry: Geometry | null | undefined): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates;
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
  }
  const positions = flattenPositions("coordinates" in geometry ? geometry.coordinates : []);
  const valid = positions.filter((position) => Number.isFinite(position[0]) && Number.isFinite(position[1]));
  if (valid.length === 0) return null;
  const sum = valid.reduce(
    (acc, position) => ({ lon: acc.lon + Number(position[0]), lat: acc.lat + Number(position[1]) }),
    { lon: 0, lat: 0 }
  );
  return [sum.lon / valid.length, sum.lat / valid.length];
}

function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371.0088;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pointInRing(point: [number, number], ring: Position[]) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygonGeometry(point: [number, number], geometry: Geometry) {
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates;
    if (!outer || !pointInRing(point, outer)) return false;
    return !holes.some((hole) => pointInRing(point, hole));
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some(([outer, ...holes]) => {
      if (!outer || !pointInRing(point, outer)) return false;
      return !holes.some((hole) => pointInRing(point, hole));
    });
  }
  return false;
}

function formatDistanceKm(value: number) {
  if (!Number.isFinite(value)) return "nearby";
  if (value < 1) return "less than 1 km";
  return `${Math.round(value)} km`;
}

function toViewingPotential(score: number): ViewingPotential {
  if (score >= 0.66) return "high";
  if (score >= 0.34) return "medium";
  return "low";
}

async function loadPoiData(): Promise<RawPoi[]> {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const candidates = Array.from(
    new Set([
      `${normalizedBase}data/places_of_interest.json`,
      "/data/places_of_interest.json",
      "data/places_of_interest.json",
    ])
  );

  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const payload = (await response.json()) as
        | { items?: Array<Record<string, unknown>> }
        | Array<Record<string, unknown>>
        | { features?: Array<Feature> };

      const items = Array.isArray(payload)
        ? payload
        : "items" in payload && Array.isArray(payload.items)
          ? payload.items
          : "features" in payload && Array.isArray(payload.features)
            ? payload.features.map((feature) => {
                const props = feature.properties ?? {};
                const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : geometryCenter(feature.geometry);
                return {
                  type: props["type"] ?? props["category"],
                  name: props["name"] ?? "POI",
                  latitude: coordinates ? Number(coordinates[1]) : Number.NaN,
                  longitude: coordinates ? Number(coordinates[0]) : Number.NaN,
                  region: props["region"],
                  hasLiveFeed: props["hasLiveFeed"] ?? props["liveCameraUrl"] ?? props["live_feed_url"],
                  hasHydrophone: props["hasHydrophone"] ?? props["hydrophoneUrl"] ?? props["hydrophone_url"],
                };
              })
            : [];

      const rawItems = items as Array<Record<string, unknown>>;

      return rawItems
        .map((item) => ({
          type: normalizePoiType(item["type"] ?? item["category"]),
          name: String(item["name"] ?? "POI"),
          latitude: Number(item["latitude"]),
          longitude: Number(item["longitude"]),
          region: typeof item["region"] === "string" ? item["region"] : undefined,
          hasLiveFeed: Boolean(item["hasLiveFeed"] ?? item["liveCameraUrl"] ?? item["live_feed_url"]),
          hasHydrophone: Boolean(item["hasHydrophone"] ?? item["hydrophoneUrl"] ?? item["hydrophone_url"]),
        }))
        .filter((poi) =>
          poi.type !== "Other" &&
          poi.name.trim().length > 0 &&
          Number.isFinite(poi.latitude) &&
          Number.isFinite(poi.longitude)
        );
    } catch {
      // Try next candidate URL.
    }
  }

  return [];
}

function buildTopForecastCells(grid: FeatureCollection, values: Record<string, number>): TopForecastCell[] {
  const positiveValues = Object.values(values)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);

  if (positiveValues.length === 0) return [];

  const topCount = Math.max(1, Math.min(MAX_TOP_CELLS, Math.ceil(positiveValues.length * TOP_FORECAST_FRACTION)));
  const threshold = positiveValues[topCount - 1] ?? positiveValues[0];

  return (grid.features ?? [])
    .map((feature) => {
      const cellId = getH3CellId(feature.properties as Record<string, unknown> | null);
      const value = Number(values[cellId] ?? 0);
      if (!Number.isFinite(value) || value < threshold || !feature.geometry) return null;
      const center = geometryCenter(feature.geometry);
      if (!center) return null;
      return { value, center, geometry: feature.geometry } satisfies TopForecastCell;
    })
    .filter((cell): cell is TopForecastCell => cell !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_TOP_CELLS);
}

function rankPoiAgainstForecast(pois: RawPoi[], topCells: TopForecastCell[], limit: number): SuggestedPlace[] {
  if (pois.length === 0 || topCells.length === 0) return [];
  const maxValue = Math.max(...topCells.map((cell) => cell.value), Number.EPSILON);

  return pois
    .map((poi) => {
      const point: [number, number] = [poi.longitude, poi.latitude];
      let bestDistanceKm = Number.POSITIVE_INFINITY;
      let bestValue = 0;
      let intersects = false;

      for (const cell of topCells) {
        const pointInside = pointInPolygonGeometry(point, cell.geometry);
        const distanceKm = pointInside ? 0 : haversineKm(point, cell.center);
        const better = pointInside || distanceKm < bestDistanceKm || (distanceKm === bestDistanceKm && cell.value > bestValue);
        if (better) {
          bestDistanceKm = distanceKm;
          bestValue = cell.value;
          intersects = pointInside;
        }
      }

      if (!intersects && bestDistanceKm > NEARBY_RADIUS_KM) return null;

      const distanceFactor = intersects ? 1 : Math.max(0.12, 1 - bestDistanceKm / NEARBY_RADIUS_KM);
      const baseScore = Math.max(0, Math.min(1, bestValue / maxValue));
      const liveBonus = poi.hasLiveFeed ? 0.05 : 0;
      const hydrophoneBonus = poi.hasHydrophone ? 0.04 : 0;
      const score = Math.max(0, Math.min(1, baseScore * distanceFactor + liveBonus + hydrophoneBonus));
      const potential = toViewingPotential(score);
      const reason = intersects
        ? "Inside one of this week’s high-activity forecast areas."
        : `Near high-activity forecast water, about ${formatDistanceKm(bestDistanceKm)} away.`;

      const place: SuggestedPlace = {
        id: toPlaceId(poi),
        name: poi.name,
        region: poi.region,
        type: poi.type,
        latitude: poi.latitude,
        longitude: poi.longitude,
        viewingPotential: potential,
        score,
        reason,
        distanceKm: Number.isFinite(bestDistanceKm) ? bestDistanceKm : undefined,
        hasLiveFeed: poi.hasLiveFeed,
        hasHydrophone: poi.hasHydrophone,
      };
      return place;
    })
    .filter((place): place is SuggestedPlace => place !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function useSuggestedPlaces({
  resolution,
  modelId,
  forecastPath,
  fallbackForecastPath,
  enabled = true,
  limit = DEFAULT_LIMIT,
}: UseSuggestedPlacesArgs): UseSuggestedPlacesResult {
  const [places, setPlaces] = useState<SuggestedPlace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPlaces([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      const [pois, grid] = await Promise.all([loadPoiData(), loadGrid(resolution)]);
      const forecast = await loadForecast(resolution, {
        kind: forecastPath ? "explicit" : "latest",
        explicitPath: forecastPath,
        modelId,
      }).catch(async (primaryError) => {
        if (!fallbackForecastPath || fallbackForecastPath === forecastPath) throw primaryError;
        return loadForecast(resolution, {
          kind: "explicit",
          explicitPath: fallbackForecastPath,
          modelId,
        });
      });
      const topCells = buildTopForecastCells(grid, forecast.values);
      return rankPoiAgainstForecast(pois, topCells, limit);
    };

    load()
      .then((rankedPlaces) => {
        if (cancelled) return;
        setPlaces(rankedPlaces);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPlaces([]);
        setError(err instanceof Error ? err.message : "Suggested places could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, fallbackForecastPath, forecastPath, limit, modelId, resolution]);

  return { places, isLoading, error };
}
