import { useEffect, useState } from "react";
import type { FeatureCollection, Geometry, Position } from "geojson";
import type { H3Resolution } from "../../../shared/config/dataPaths";
import { loadForecast, loadGrid } from "../../../shared/data/forecastIO";
import { getH3CellId } from "../../../shared/data/h3";
import type { SuggestedPlace, ViewingPotential } from "../../locations/types";
import { loadPoiDataBundle, type PoiFilters, type PublicPoi } from "../../locations/poiData";

type ForecastCellScore = {
  value: number;
  center: [number, number];
};

type UseSuggestedPlacesArgs = {
  resolution: H3Resolution;
  modelId: string;
  forecastPath?: string;
  fallbackForecastPath?: string;
  externalValues?: Record<string, number>;
  enabled?: boolean;
  limit?: number | null;
  poiFilters?: PoiFilters;
  baseLocation?: { latitude: number; longitude: number } | null;
  maxTravelDistanceMiles?: number | null;
};

type UseSuggestedPlacesResult = {
  places: SuggestedPlace[];
  isLoading: boolean;
  error: string | null;
};

type PlannerPoiMetadata = {
  reason?: string;
  scoreBoost?: number;
  photoSpotId?: string;
};

const TOP_LOCATION_FRACTION = 0.05;
const POI_SCORE_RADIUS_KM = 16.0934; // 10 miles.
const DEFAULT_RECOMMENDATION_RADIUS_MILES = 175;
const MILES_TO_KM = 1.609344;

// Optional display/ranking metadata only. These records never introduce independent coordinates.
// Coordinates always come from data/places_of_interest.json via loadPoiData().
const PLANNER_POI_METADATA: Record<string, PlannerPoiMetadata> = {
  "lime-kiln-point-state-park": {
    reason: "Classic shore-based spot with frequent sightings.",
    scoreBoost: 0.22,
  },
  "lime-kiln-point": {
    photoSpotId: "lime-kiln-point-state-park",
  },
  "fort-worden-state-park": {
    reason: "Broad views with nearby active waters.",
    scoreBoost: 0.12,
  },
  "alki-beach": {
    reason: "Accessible shoreline with wide views.",
    scoreBoost: 0.02,
  },
  "bush-point": {
    reason: "Peaceful viewpoint near active waters.",
    scoreBoost: 0.06,
  },
  "blind-island": {
    reason: "Close to strong orca corridors.",
    scoreBoost: 0.18,
  },
};

function normalizeId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "place"
  );
}

function enrichPlannerPoi(poi: PublicPoi): PublicPoi {
  const metadata = PLANNER_POI_METADATA[normalizeId(poi.name)];
  if (!metadata) return poi;
  return {
    ...poi,
    reason: poi.reason ?? metadata.reason,
    scoreBoost: poi.scoreBoost ?? metadata.scoreBoost,
  };
}

function getPlannerSpotId(poi: PublicPoi) {
  const normalizedName = normalizeId(poi.name);
  return PLANNER_POI_METADATA[normalizedName]?.photoSpotId ?? normalizedName;
}

function toPlaceId(poi: PublicPoi) {
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

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(a: [number, number], b: [number, number]) {
  const earthRadiusKm = 6371.0088;
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const deltaLat = toRadians(b[1] - a[1]);
  const deltaLon = toRadians(b[0] - a[0]);
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toViewingPotential(score: number): ViewingPotential {
  if (score >= 0.66) return "high";
  if (score >= 0.34) return "medium";
  return "low";
}

function poiLocationKey(poi: PublicPoi) {
  return `${poi.type}:${normalizeId(poi.name)}:${poi.latitude.toFixed(6)}:${poi.longitude.toFixed(6)}`;
}

function dedupePoiLocations(pois: PublicPoi[]) {
  const seen = new Set<string>();
  const deduped: PublicPoi[] = [];
  for (const poi of pois) {
    if (!Number.isFinite(poi.latitude) || !Number.isFinite(poi.longitude)) continue;
    const key = poiLocationKey(poi);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(poi);
  }
  return deduped;
}

function filterPoisByBaseRadius(
  pois: PublicPoi[],
  baseLocation?: { latitude: number; longitude: number } | null,
  maxTravelDistanceMiles?: number | null
) {
  if (!baseLocation || !Number.isFinite(baseLocation.latitude) || !Number.isFinite(baseLocation.longitude)) return pois;

  const radiusMiles =
    typeof maxTravelDistanceMiles === "number" && Number.isFinite(maxTravelDistanceMiles) && maxTravelDistanceMiles > 0
      ? maxTravelDistanceMiles
      : DEFAULT_RECOMMENDATION_RADIUS_MILES;
  const radiusKm = radiusMiles * MILES_TO_KM;
  const basePoint: [number, number] = [baseLocation.longitude, baseLocation.latitude];

  return pois.filter((poi) => haversineKm(basePoint, [poi.longitude, poi.latitude]) <= radiusKm);
}

function buildForecastCellScores(grid: FeatureCollection, values: Record<string, number>): ForecastCellScore[] {
  return (grid.features ?? [])
    .map((feature) => {
      const cellId = getH3CellId(feature.properties as Record<string, unknown> | null);
      const value = Number(values[cellId] ?? 0);
      if (!Number.isFinite(value) || value < 0 || !feature.geometry) return null;
      const center = geometryCenter(feature.geometry);
      if (!center) return null;
      return { value, center } satisfies ForecastCellScore;
    })
    .filter((cell): cell is ForecastCellScore => cell !== null);
}

type ScoredPoi = {
  poi: PublicPoi;
  meanNearbyScore: number;
  nearbyCellCount: number;
  nearestDistanceKm: number;
};

function rankPoiAgainstForecast(
  pois: PublicPoi[],
  cells: ForecastCellScore[],
  baseLocation?: { latitude: number; longitude: number } | null,
  maxTravelDistanceMiles?: number | null,
  limit?: number | null,
  sourcePoisForFraction?: PublicPoi[]
): SuggestedPlace[] {
  const candidatePois = filterPoisByBaseRadius(dedupePoiLocations(pois), baseLocation, maxTravelDistanceMiles);
  const sourceCandidatePois = filterPoisByBaseRadius(
    dedupePoiLocations(sourcePoisForFraction ?? pois),
    baseLocation,
    maxTravelDistanceMiles
  );
  if (candidatePois.length === 0 || cells.length === 0) return [];

  const scoredPois = candidatePois
    .map((poi): ScoredPoi => {
      const point: [number, number] = [poi.longitude, poi.latitude];
      let scoreSum = 0;
      let nearbyCellCount = 0;
      let nearestDistanceKm = Number.POSITIVE_INFINITY;

      for (const cell of cells) {
        const distanceKm = haversineKm(point, cell.center);
        if (distanceKm > POI_SCORE_RADIUS_KM) continue;

        // Use the literal mean the product expects: all modeled hexes within 10 miles,
        // not a distance-weighted score and not a made-up fallback coordinate.
        scoreSum += cell.value;
        nearbyCellCount += 1;
        nearestDistanceKm = Math.min(nearestDistanceKm, distanceKm);
      }

      const meanNearbyScore = nearbyCellCount > 0 ? scoreSum / nearbyCellCount : 0;

      return {
        poi,
        meanNearbyScore: Number.isFinite(meanNearbyScore) ? meanNearbyScore : 0,
        nearbyCellCount,
        nearestDistanceKm,
      };
    })
    .sort((a, b) => b.meanNearbyScore - a.meanNearbyScore || a.poi.name.localeCompare(b.poi.name));

  // A POI only qualifies as a recommendation if it actually overlaps modeled water
  // cells and has a positive nearby mean. Otherwise zero-score POIs sort alphabetically
  // and masquerade as “top” places, which is worse than showing nothing.
  const eligiblePois = scoredPois.filter((item) => item.nearbyCellCount > 0 && item.meanNearbyScore > 0);
  if (eligiblePois.length === 0) {
    if (import.meta.env.DEV) {
      console.info("[recommended POIs] no eligible POIs", {
        rawPois: pois.length,
        candidatePois: candidatePois.length,
        scoredPois: scoredPois.length,
        cells: cells.length,
        scoreRadiusMiles: POI_SCORE_RADIUS_KM / MILES_TO_KM,
        baseLatitude: baseLocation?.latitude,
        baseLongitude: baseLocation?.longitude,
        maxTravelDistanceMiles: maxTravelDistanceMiles ?? DEFAULT_RECOMMENDATION_RADIUS_MILES,
      });
    }
    return [];
  }

  // The top-N percentage should be based on the valid POI source universe, not the smaller
  // display-cleaned or positive-score subsets. The source file contains many generic marina
  // inventory records; we keep those out of cards, but they still count toward "top 5%".
  const fractionDenominator = sourceCandidatePois.length > 0 ? sourceCandidatePois.length : candidatePois.length;
  const fractionCount = Math.max(1, Math.ceil(fractionDenominator * TOP_LOCATION_FRACTION));
  const requestedLimit = typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? Math.round(limit) : null;
  const topCount = Math.min(eligiblePois.length, requestedLimit ?? fractionCount);
  const maxMeanScore = Math.max(eligiblePois[0]?.meanNearbyScore ?? Number.EPSILON, Number.EPSILON);

  if (import.meta.env.DEV) {
    console.info("[recommended POIs]", {
      rawPois: pois.length,
      sourcePois: sourcePoisForFraction?.length ?? pois.length,
      sourceCandidatePois: sourceCandidatePois.length,
      candidatePois: candidatePois.length,
      scoredPois: scoredPois.length,
      eligiblePois: eligiblePois.length,
      zeroScorePois: scoredPois.length - eligiblePois.length,
      topCount,
      fractionCount,
      fractionDenominator,
      scoreRadiusMiles: POI_SCORE_RADIUS_KM / MILES_TO_KM,
      baseLatitude: baseLocation?.latitude,
      baseLongitude: baseLocation?.longitude,
      maxTravelDistanceMiles: maxTravelDistanceMiles ?? DEFAULT_RECOMMENDATION_RADIUS_MILES,
      topNames: eligiblePois.slice(0, topCount).map((item) => ({
        name: item.poi.name,
        type: item.poi.type,
        latitude: item.poi.latitude,
        longitude: item.poi.longitude,
        meanNearbyScore: item.meanNearbyScore,
        nearbyCellCount: item.nearbyCellCount,
        nearestDistanceKm: Number.isFinite(item.nearestDistanceKm) ? item.nearestDistanceKm : null,
      })),
    });
  }

  return eligiblePois.slice(0, topCount).map(({ poi, meanNearbyScore, nearbyCellCount, nearestDistanceKm }) => {
    const normalizedScore = Math.max(0, Math.min(1, meanNearbyScore / maxMeanScore));
    const normalizedName = normalizeId(poi.name);
    const metadata = PLANNER_POI_METADATA[normalizedName];
    const reason =
      poi.reason ??
      metadata?.reason ??
      `${
        requestedLimit
          ? `One of the top ${topCount} viewing locations`
          : "Top 5% POI"
      } based on mean forecast score across ${nearbyCellCount} grid cells within 10 miles.`;

    return {
      id: toPlaceId(poi),
      spotId: getPlannerSpotId(poi),
      name: poi.name,
      region: poi.region,
      type: poi.type,
      latitude: poi.latitude,
      longitude: poi.longitude,
      viewingPotential: toViewingPotential(normalizedScore),
      score: meanNearbyScore,
      reason,
      distanceKm: Number.isFinite(nearestDistanceKm) ? nearestDistanceKm : undefined,
      imageUrl: poi.imageUrl,
      hasLiveFeed: poi.hasLiveFeed,
      hasHydrophone: poi.hasHydrophone,
    } satisfies SuggestedPlace;
  });
}

export function useSuggestedPlaces(args: UseSuggestedPlacesArgs): UseSuggestedPlacesResult {
  const {
    resolution,
    modelId,
    forecastPath,
    fallbackForecastPath,
    externalValues,
    enabled = true,
    baseLocation,
    maxTravelDistanceMiles,
    limit,
  } = args;
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
      const [poiBundle, grid] = await Promise.all([loadPoiDataBundle(), loadGrid(resolution)]);
      const pois = poiBundle.items.map(enrichPlannerPoi);
      if (pois.length === 0) return [];

      const values =
        externalValues ??
        (
          await loadForecast(resolution, {
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
          })
        ).values;
      const cells = buildForecastCellScores(grid, values);
      return rankPoiAgainstForecast(pois, cells, baseLocation, maxTravelDistanceMiles, limit, poiBundle.sourceItems);
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
  }, [baseLocation, enabled, externalValues, fallbackForecastPath, forecastPath, limit, maxTravelDistanceMiles, modelId, resolution]);

  return { places, isLoading, error };
}
