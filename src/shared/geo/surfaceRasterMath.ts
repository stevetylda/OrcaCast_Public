import type { Feature, FeatureCollection, GeoJsonProperties } from "geojson";
import type { HeatScale } from "./colorScale";
const IDW_POWER = 2.35;

const IDW_NEIGHBORS = 8;

const IDW_EPSILON = 1e-7;

export const MAX_MERCATOR_LAT = 85.05112878;

const DEG_TO_RAD = Math.PI / 180;

export const RAD_TO_DEG = 180 / Math.PI;

export function extractGeometryCoordinates(
  geometry: Feature["geometry"],
): number[][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

export type SurfaceSample = {
  lng: number;
  lat: number;
  prob: number;
  projX: number;
  projY: number;
};

export type SurfaceBounds = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

export type SurfaceRasterWorkerRequest = {
  id: number;
  fc: FeatureCollection;
  bounds: SurfaceBounds;
  width: number;
  height: number;
  paletteColors: string[];
  scale?: HeatScale | null;
};

export type SurfaceRasterWorkerResponse =
  | {
      id: number;
      ok: true;
      blob: Blob;
      bounds: SurfaceBounds;
      coordinates: [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
      ];
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

type RGBA = [number, number, number, number];

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getFeatureProbability(
  properties: GeoJsonProperties | null | undefined,
) {
  const record = properties as Record<string, unknown> | null;
  if (record?.prob_status !== "modeled") return Number.NaN;
  const raw = record?.prob;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : Number.NaN;
}

export function getFeatureCenter(feature: Feature): [number, number] | null {
  const coords = extractGeometryCoordinates(feature.geometry);
  if (coords.length === 0) return null;
  let areaSum = 0;
  let centroidLng = 0;
  let centroidLat = 0;
  for (let index = 0; index < coords.length; index += 1) {
    const [x1, y1] = coords[index] ?? [];
    const [x2, y2] = coords[(index + 1) % coords.length] ?? [];
    const cross = x1 * y2 - x2 * y1;
    areaSum += cross;
    centroidLng += (x1 + x2) * cross;
    centroidLat += (y1 + y2) * cross;
  }
  if (Math.abs(areaSum) > 1e-9) {
    return [centroidLng / (3 * areaSum), centroidLat / (3 * areaSum)];
  }
  const [sumLng, sumLat] = coords.reduce<[number, number]>(
    (acc, [lng, lat]) => [acc[0] + Number(lng ?? 0), acc[1] + Number(lat ?? 0)],
    [0, 0],
  );
  return [sumLng / coords.length, sumLat / coords.length];
}

export function mercatorY(lat: number) {
  const clampedLat = clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);
  const rad = clampedLat * DEG_TO_RAD;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2)) * RAD_TO_DEG;
}

export function inverseMercatorY(y: number) {
  return (2 * Math.atan(Math.exp(y * DEG_TO_RAD)) - Math.PI / 2) * RAD_TO_DEG;
}

export function lngToCanvasX(
  lng: number,
  bounds: SurfaceBounds,
  width: number,
) {
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 1e-9);
  return ((lng - bounds.minLng) / lngSpan) * (width - 1);
}

export function latToCanvasY(
  lat: number,
  bounds: SurfaceBounds,
  height: number,
) {
  const maxY = mercatorY(bounds.maxLat);
  const minY = mercatorY(bounds.minLat);
  const ySpan = Math.max(maxY - minY, 1e-9);
  return ((maxY - mercatorY(lat)) / ySpan) * (height - 1);
}

export function canvasYToLat(y: number, bounds: SurfaceBounds, height: number) {
  const maxY = mercatorY(bounds.maxLat);
  const minY = mercatorY(bounds.minLat);
  const t = y / Math.max(height - 1, 1);
  return inverseMercatorY(maxY - t * (maxY - minY));
}

export function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function estimateMaxDistance(samples: SurfaceSample[]) {
  if (samples.length < 2) return 0.5;
  const nearest: number[] = [];
  for (let index = 0; index < samples.length; index += 1) {
    let minDistance = Number.POSITIVE_INFINITY;
    for (let otherIndex = 0; otherIndex < samples.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const dx = samples[index].projX - samples[otherIndex].projX;
      const dy = samples[index].projY - samples[otherIndex].projY;
      const distance = Math.hypot(dx, dy);
      if (distance < minDistance) minDistance = distance;
    }
    if (Number.isFinite(minDistance)) nearest.push(minDistance);
  }
  const spacing = median(
    nearest.filter((value) => Number.isFinite(value) && value > 0),
  );
  return spacing > 0 ? spacing * 3.05 : 0.5;
}

export function parseCssColor(color: string): RGBA {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const expanded = hex
        .split("")
        .map((char) => char + char)
        .join("");
      return parseCssColor(`#${expanded}`);
    }
    if (hex.length === 6 || hex.length === 8) {
      const value = Number.parseInt(hex, 16);
      if (Number.isNaN(value)) return [255, 255, 255, 1];
      if (hex.length === 6) {
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 1];
      }
      return [
        (value >> 24) & 255,
        (value >> 16) & 255,
        (value >> 8) & 255,
        (value & 255) / 255,
      ];
    }
  }
  const match = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1].split(",").map((part) => part.trim());
    return [
      Number(parts[0] ?? 255),
      Number(parts[1] ?? 255),
      Number(parts[2] ?? 255),
      parts[3] === undefined ? 1 : Number(parts[3]),
    ];
  }
  return [255, 255, 255, 1];
}

function lerpColor(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

export function buildColorStops(
  samples: SurfaceSample[],
  paletteColors: string[],
  scale?: HeatScale | null,
) {
  if (scale && scale.binColorsRgba.length > 0) {
    const minValue = scale.binRanges[0]?.probMin ?? scale.thresholds[0] ?? 0;
    const stopValues = [minValue, ...scale.thresholds];
    const stopColors = scale.binColorsRgba.map(parseCssColor);
    return {
      stopValues,
      stopColors,
      zeroColor: parseCssColor(scale.zeroColor ?? "rgba(0,0,0,0)"),
    };
  }
  const colors =
    paletteColors.length > 0
      ? paletteColors.map(parseCssColor)
      : [parseCssColor("#ffffff")];
  const positive = samples
    .map((sample) => sample.prob)
    .filter((value) => value > 0);
  const minValue = positive.length > 0 ? Math.min(...positive) : 0;
  const maxValue = positive.length > 0 ? Math.max(...positive) : 1;
  const steps = Math.max(1, colors.length - 1);
  const stopValues = colors.map(
    (_, index) => minValue + ((maxValue - minValue) * index) / steps,
  );
  return { stopValues, stopColors: colors, zeroColor: [0, 0, 0, 0] as RGBA };
}

export function sampleColor(
  value: number,
  stopValues: number[],
  stopColors: RGBA[],
  zeroColor: RGBA,
): RGBA {
  if (stopColors.length === 0) return zeroColor;
  if (value <= 0) return zeroColor;
  if (stopColors.length === 1 || stopValues.length <= 1)
    return [...stopColors[0]] as RGBA;
  if (value <= stopValues[0]) return [...stopColors[0]] as RGBA;
  for (let index = 0; index < stopValues.length - 1; index += 1) {
    const startValue = stopValues[index];
    const endValue = stopValues[index + 1];
    if (value <= endValue) {
      const span = Math.max(endValue - startValue, 1e-9);
      return lerpColor(
        stopColors[index],
        stopColors[Math.min(index + 1, stopColors.length - 1)],
        (value - startValue) / span,
      );
    }
  }
  return [...stopColors[stopColors.length - 1]] as RGBA;
}

export function surfaceAlphaForValue(
  value: number,
  _stopValues: number[],
  baseAlpha: number,
) {
  if (!Number.isFinite(value)) return 0;
  return clamp(baseAlpha, 0, 1);
}

function getBucketKey(x: number, y: number) {
  return `${x}:${y}`;
}

export function buildBucketIndex(samples: SurfaceSample[], bucketSize: number) {
  const buckets = new Map<string, SurfaceSample[]>();
  samples.forEach((sample) => {
    const bucketX = Math.floor(sample.projX / bucketSize);
    const bucketY = Math.floor(sample.projY / bucketSize);
    const key = getBucketKey(bucketX, bucketY);
    const existing = buckets.get(key);
    if (existing) existing.push(sample);
    else buckets.set(key, [sample]);
  });
  return buckets;
}

function getNearestSamples(
  buckets: Map<string, SurfaceSample[]>,
  projX: number,
  projY: number,
  bucketSize: number,
  maxDistance: number,
) {
  const centerBucketX = Math.floor(projX / bucketSize);
  const centerBucketY = Math.floor(projY / bucketSize);
  const candidates: Array<{ sample: SurfaceSample; distance: number }> = [];
  for (let ring = 0; ring <= 3; ring += 1) {
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        const bucket = buckets.get(
          getBucketKey(centerBucketX + dx, centerBucketY + dy),
        );
        if (!bucket) continue;
        bucket.forEach((sample) => {
          const distance = Math.hypot(
            sample.projX - projX,
            sample.projY - projY,
          );
          if (distance <= maxDistance) candidates.push({ sample, distance });
        });
      }
    }
    if (candidates.length >= IDW_NEIGHBORS) break;
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, IDW_NEIGHBORS);
}

export function interpolateSurfaceValue(
  buckets: Map<string, SurfaceSample[]>,
  projX: number,
  projY: number,
  bucketSize: number,
  maxDistance: number,
) {
  const nearest = getNearestSamples(
    buckets,
    projX,
    projY,
    bucketSize,
    maxDistance,
  );
  if (nearest.length === 0) return null;
  if (nearest[0].distance <= IDW_EPSILON) return nearest[0].sample.prob;
  let weightedValue = 0;
  let weightSum = 0;
  for (const { sample, distance } of nearest) {
    const weight = 1 / Math.pow(Math.max(distance, IDW_EPSILON), IDW_POWER);
    weightedValue += sample.prob * weight;
    weightSum += weight;
  }
  if (weightSum <= 0) return null;
  return weightedValue / weightSum;
}
