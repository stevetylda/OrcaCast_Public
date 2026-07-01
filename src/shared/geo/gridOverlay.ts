import type { Feature, FeatureCollection, GeoJsonProperties, MultiPolygon, Polygon } from "geojson";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  ExpressionSpecification,
  DataDrivenPropertyValueSpecification,
  FillLayerSpecification,
  ImageSource,
} from "maplibre-gl";
import { H3_CELL_ID_KEYS } from "../data/h3";
import type { HeatScale } from "./colorScale";

const DEFAULT_SOURCE_ID = "grid";
const DEFAULT_FILL_ID = "grid-fill";
const DEFAULT_LINE_ID = "grid-line";
const HOT_BASE_ID = "grid-hot-outline-base";
const HOT_SPARKLE_ID = "grid-hot-outline-sparkle";
const PEAK_BASE_ID = "grid-peak-outline";
const PEAK_GLOW_ID = "grid-peak-glow";
const HOT_FILL_SOFT_ID = "grid-hot-fill-soft";
const HOT_FILL_HALO_ID = "grid-hot-fill-halo";
const HALO_ID = "grid-halo";
const SHIMMER_ID = "grid-shimmer-fill";
const PEAK_SHINE_ID = "grid-peak-shine";
const BIO_GLOW_FILL_ID = "grid-bio-glow-fill";
const BIO_CORE_FILL_ID = "grid-bio-core-fill";
const BIO_EDGE_ID = "grid-bio-edge";
const HOVER_FILL_ID = "grid-hover-fill";
const HOVER_GLOW_ID = "grid-hover-glow";
const HOVER_CORE_ID = "grid-hover-core";
const SURFACE_SOURCE_ID = "grid-surface";
const SURFACE_LAYER_ID = "grid-surface-raster";
const GRID_SUBTLE_BORDER = "rgba(8,18,44,0.22)";
const SURFACE_MAX_SIDE = 1280;
const SURFACE_MIN_SIDE = 512;
const SURFACE_MAX_PIXELS = 1_400_000;
const IDW_POWER = 2;
const IDW_NEIGHBORS = 16;
const IDW_EPSILON = 1e-7;
const MAX_MERCATOR_LAT = 85.05112878;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const HOTSPOT_SPARKLE_COLOR = "rgba(255,45,170,0.90)";
const HOTSPOT_GLOW_COLOR = "rgba(255,45,170,0.52)";

/**
 * MapLibre expects "fill-color" to be a DataDrivenPropertyValueSpecification<string>
 * (which includes expressions). Our expressions are valid but were typed as unknown[].
 */
type FillColorSpec = DataDrivenPropertyValueSpecification<string>;

function extractGeometryCoordinates(geometry: Feature["geometry"]): number[][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

type SurfaceSample = {
  lng: number;
  lat: number;
  prob: number;
  projX: number;
  projY: number;
};

type SurfaceBounds = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

type SurfaceRaster = {
  dataUrl: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
};

type RGBA = [number, number, number, number];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampMercatorLat(lat: number) {
  return clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);
}

function mercatorY(lat: number) {
  const rad = clampMercatorLat(lat) * DEG_TO_RAD;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2)) * RAD_TO_DEG;
}

function inverseMercatorY(y: number) {
  return (2 * Math.atan(Math.exp(y * DEG_TO_RAD)) - Math.PI / 2) * RAD_TO_DEG;
}

function lngToCanvasX(lng: number, bounds: SurfaceBounds, width: number) {
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 1e-9);
  return ((lng - bounds.minLng) / lngSpan) * (width - 1);
}

function latToCanvasY(lat: number, bounds: SurfaceBounds, height: number) {
  const maxY = mercatorY(bounds.maxLat);
  const minY = mercatorY(bounds.minLat);
  const ySpan = Math.max(maxY - minY, 1e-9);
  return ((maxY - mercatorY(lat)) / ySpan) * (height - 1);
}

function canvasYToLat(y: number, bounds: SurfaceBounds, height: number) {
  const maxY = mercatorY(bounds.maxLat);
  const minY = mercatorY(bounds.minLat);
  const t = y / Math.max(height - 1, 1);
  return inverseMercatorY(maxY - t * (maxY - minY));
}

function getFeatureProbability(properties: GeoJsonProperties | null | undefined) {
  return Number((properties as Record<string, unknown> | null)?.prob ?? 0);
}

function getFeatureCenter(feature: Feature): [number, number] | null {
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
    [0, 0]
  );
  return [sumLng / coords.length, sumLat / coords.length];
}

function buildSurfaceSamples(fc: FeatureCollection) {
  const rawSamples: Array<{ lng: number; lat: number; prob: number }> = [];
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  (fc.features ?? []).forEach((feature) => {
    const geometryCoords = extractGeometryCoordinates(feature.geometry);
    geometryCoords.forEach(([lng, lat]) => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    const center = getFeatureCenter(feature);
    const prob = getFeatureProbability(feature.properties);
    if (!center || !Number.isFinite(prob)) return;
    const [lng, lat] = center;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    rawSamples.push({ lng, lat, prob });
  });

  if (rawSamples.length === 0) return null;

  const samples: SurfaceSample[] = rawSamples.map((sample) => ({
    ...sample,
    projX: sample.lng,
    projY: mercatorY(sample.lat),
  }));

  return {
    samples,
    bounds: { minLng, maxLng, minLat, maxLat },
  };
}

function computeRasterDimensions(bounds: SurfaceBounds) {
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 1e-6);
  const mercatorSpan = Math.max(mercatorY(bounds.maxLat) - mercatorY(bounds.minLat), 1e-6);
  const aspect = lngSpan / mercatorSpan;
  let width = aspect >= 1 ? SURFACE_MAX_SIDE : Math.round(SURFACE_MAX_SIDE * aspect);
  let height = aspect >= 1 ? Math.round(SURFACE_MAX_SIDE / aspect) : SURFACE_MAX_SIDE;
  width = clamp(width, SURFACE_MIN_SIDE, SURFACE_MAX_SIDE);
  height = clamp(height, SURFACE_MIN_SIDE, SURFACE_MAX_SIDE);
  while (width * height > SURFACE_MAX_PIXELS) {
    width = Math.max(SURFACE_MIN_SIDE, Math.round(width * 0.92));
    height = Math.max(SURFACE_MIN_SIDE, Math.round(height * 0.92));
    if (width === SURFACE_MIN_SIDE && height === SURFACE_MIN_SIDE) break;
  }
  return { width, height };
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function estimateMaxDistance(samples: SurfaceSample[]) {
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
  const spacing = median(nearest.filter((value) => Number.isFinite(value) && value > 0));
  return spacing > 0 ? spacing * 4.5 : 0.5;
}

function parseCssColor(color: string): RGBA {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const expanded = hex.split("").map((char) => char + char).join("");
      return parseCssColor(`#${expanded}`);
    }
    if (hex.length === 6 || hex.length === 8) {
      const value = Number.parseInt(hex, 16);
      if (Number.isNaN(value)) return [255, 255, 255, 1];
      if (hex.length === 6) {
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 1];
      }
      return [(value >> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, (value & 255) / 255];
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

function buildColorStops(samples: SurfaceSample[], paletteColors: string[], scale?: HeatScale | null) {
  if (scale && scale.binColorsRgba.length > 0) {
    const minValue = scale.binRanges[0]?.probMin ?? scale.thresholds[0] ?? 0;
    const stopValues = [minValue, ...scale.thresholds];
    const stopColors = scale.binColorsRgba.map(parseCssColor);
    return { stopValues, stopColors };
  }
  const colors = paletteColors.length > 0 ? paletteColors.map(parseCssColor) : [parseCssColor("#ffffff")];
  const positive = samples.map((sample) => sample.prob).filter((value) => value > 0);
  const minValue = positive.length > 0 ? Math.min(...positive) : 0;
  const maxValue = positive.length > 0 ? Math.max(...positive) : 1;
  const steps = Math.max(1, colors.length - 1);
  const stopValues = colors.map((_, index) => minValue + ((maxValue - minValue) * index) / steps);
  return { stopValues, stopColors: colors };
}

function sampleColor(value: number, stopValues: number[], stopColors: RGBA[]): RGBA {
  if (stopColors.length === 0 || value <= 0) return [0, 0, 0, 0];
  if (stopColors.length === 1 || stopValues.length <= 1) return [...stopColors[0]] as RGBA;
  if (value <= stopValues[0]) return [...stopColors[0]] as RGBA;
  for (let index = 0; index < stopValues.length - 1; index += 1) {
    const startValue = stopValues[index];
    const endValue = stopValues[index + 1];
    if (value <= endValue) {
      const span = Math.max(endValue - startValue, 1e-9);
      return lerpColor(stopColors[index], stopColors[Math.min(index + 1, stopColors.length - 1)], (value - startValue) / span);
    }
  }
  return [...stopColors[stopColors.length - 1]] as RGBA;
}


function getBucketKey(x: number, y: number) {
  return `${x}:${y}`;
}

function buildBucketIndex(samples: SurfaceSample[], bucketSize: number) {
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
  maxDistance: number
) {
  const centerBucketX = Math.floor(projX / bucketSize);
  const centerBucketY = Math.floor(projY / bucketSize);
  const candidates: Array<{ sample: SurfaceSample; distance: number }> = [];
  for (let ring = 0; ring <= 3; ring += 1) {
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        const bucket = buckets.get(getBucketKey(centerBucketX + dx, centerBucketY + dy));
        if (!bucket) continue;
        bucket.forEach((sample) => {
          const distance = Math.hypot(sample.projX - projX, sample.projY - projY);
          if (distance <= maxDistance) candidates.push({ sample, distance });
        });
      }
    }
    if (candidates.length >= IDW_NEIGHBORS) break;
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, IDW_NEIGHBORS);
}

function interpolateSurfaceValue(
  buckets: Map<string, SurfaceSample[]>,
  projX: number,
  projY: number,
  bucketSize: number,
  maxDistance: number
) {
  const nearest = getNearestSamples(buckets, projX, projY, bucketSize, maxDistance);
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

function drawGeometryPath(
  ctx: CanvasRenderingContext2D,
  geometry: Polygon | MultiPolygon,
  bounds: SurfaceBounds,
  width: number,
  height: number
) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ring.forEach(([lng, lat], index) => {
        const x = lngToCanvasX(lng, bounds, width);
        const y = latToCanvasY(lat, bounds, height);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }
}

function maskSurfaceToFootprint(
  canvas: HTMLCanvasElement,
  fc: FeatureCollection,
  bounds: SurfaceBounds
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  (fc.features ?? []).forEach((feature) => {
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return;
    drawGeometryPath(ctx, geometry, bounds, canvas.width, canvas.height);
  });
  ctx.fillStyle = "#ffffff";
  ctx.fill("evenodd");
  ctx.globalCompositeOperation = "source-over";
}

function buildSurfaceRaster(
  fc: FeatureCollection,
  paletteColors: string[],
  scale?: HeatScale | null
): SurfaceRaster | null {
  const surface = buildSurfaceSamples(fc);
  if (!surface) return null;
  const { samples, bounds } = surface;
  const { width, height } = computeRasterDimensions(bounds);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;
  const maxDistance = estimateMaxDistance(samples);
  const bucketSize = Math.max(maxDistance, 1e-6);
  const buckets = buildBucketIndex(samples, bucketSize);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 1e-6);
  const { stopValues, stopColors } = buildColorStops(samples, paletteColors, scale);

  for (let y = 0; y < height; y += 1) {
    const lat = canvasYToLat(y, bounds, height);
    const projY = mercatorY(lat);
    for (let x = 0; x < width; x += 1) {
      const lng = bounds.minLng + (x / Math.max(width - 1, 1)) * lngSpan;
      const value = interpolateSurfaceValue(buckets, lng, projY, bucketSize, maxDistance);
      const pixelIndex = (y * width + x) * 4;
      if (value === null || !Number.isFinite(value) || value <= 0) {
        pixels[pixelIndex + 3] = 0;
        continue;
      }
      const [r, g, b, a] = sampleColor(value, stopValues, stopColors);
      pixels[pixelIndex] = Math.round(clamp(r, 0, 255));
      pixels[pixelIndex + 1] = Math.round(clamp(g, 0, 255));
      pixels[pixelIndex + 2] = Math.round(clamp(b, 0, 255));
      pixels[pixelIndex + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  maskSurfaceToFootprint(canvas, fc, bounds);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    coordinates: [
      [bounds.minLng, bounds.maxLat],
      [bounds.maxLng, bounds.maxLat],
      [bounds.maxLng, bounds.minLat],
      [bounds.minLng, bounds.minLat],
    ],
  };
}

function removeLayerIfExists(map: MapLibreMap, id: string) {
  if (map.getLayer(id)) {
    map.removeLayer(id);
  }
}

function removeSourceIfExists(map: MapLibreMap, id: string) {
  if (map.getSource(id)) {
    map.removeSource(id);
  }
}

function emptyHoverFilter(): ExpressionSpecification {
  return ["==", ["get", "__hover__"], "__none__"] as ExpressionSpecification;
}

function buildHoverFilter(cellId: string): ExpressionSpecification {
  return [
    "any",
    ...H3_CELL_ID_KEYS.map((key) => ["==", ["to-string", ["coalesce", ["get", key], ""]], cellId]),
  ] as ExpressionSpecification;
}

export function addGridOverlay(
  map: MapLibreMap,
  fc: FeatureCollection,
  fillColorExpr?: FillColorSpec,
  hotspotThreshold?: number,
  hotspotsVisible = true,
  shimmerThreshold?: number,
  borderColor = GRID_SUBTLE_BORDER,
  lineAccentColor = "rgba(96,186,200,0.34)",
  sourceId = DEFAULT_SOURCE_ID,
  fillId = DEFAULT_FILL_ID,
  lineId = DEFAULT_LINE_ID
) {
  const DEBUG_MAP =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    ((window as { __ORCACAST_DEBUG_MAP?: boolean }).__ORCACAST_DEBUG_MAP === true ||
      window.localStorage?.getItem("orcacast.debug.map") === "true");

  if (DEBUG_MAP) {
    const probs = (fc.features ?? [])
      .map((feature) => Number((feature.properties as Record<string, unknown> | null)?.prob ?? 0))
      .filter((value) => Number.isFinite(value));
    const positive = probs.filter((value) => value > 0);
    console.info("[MapDebug] addGridOverlay", {
      sourceId,
      fillId,
      lineId,
      featureCount: fc.features?.length ?? 0,
      positiveFeatureCount: positive.length,
      minPositive: positive.length ? Math.min(...positive) : null,
      maxPositive: positive.length ? Math.max(...positive) : null,
      hasSource: Boolean(map.getSource(sourceId)),
      hasFillLayer: Boolean(map.getLayer(fillId)),
      hasLineLayer: Boolean(map.getLayer(lineId)),
    });
  }

  if (map.getSource(sourceId)) {
    const source = map.getSource(sourceId) as GeoJSONSource;
    source.setData(fc);
  } else {
    map.addSource(sourceId, {
      type: "geojson",
      data: fc,
    });
  }

  // Default fill-color expression (typed)
  const defaultFillColorExpr: ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["get", "prob"],
    0.0,
    "rgba(25,240,215,0.05)",
    0.0001,
    "rgba(25,240,215,0.12)",
    0.005,
    "rgba(25,240,215,0.30)",
    0.02,
    "rgba(25,240,215,0.55)",
    0.1,
    "rgba(25,240,215,0.80)",
    0.3,
    "rgba(25,240,215,0.92)",
  ];

  // Use provided expression if given, else use default
  const fillColor: FillColorSpec = (fillColorExpr ??
    (defaultFillColorExpr as unknown as FillColorSpec)) as FillColorSpec;

  if (map.getLayer(fillId)) {
    map.setPaintProperty(fillId, "fill-color", fillColor);
    map.setPaintProperty(fillId, "fill-opacity", 0.8);
    map.setPaintProperty(fillId, "fill-outline-color", borderColor);
    map.setPaintProperty(fillId, "fill-opacity-transition", { duration: 200, delay: 0 });
  } else {
    map.addLayer({
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": fillColor,
        "fill-opacity": 0.8,
        "fill-outline-color": borderColor,
        "fill-opacity-transition": { duration: 200, delay: 0 },
      },
    });
  }

  if (map.getLayer(HALO_ID)) {
    map.setPaintProperty(HALO_ID, "line-color", "rgba(5,10,22,0.6)");
    map.setPaintProperty(HALO_ID, "line-width", [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      1.2,
      9,
      1.8,
      12,
      2.4,
    ] as ExpressionSpecification);
    map.setPaintProperty(HALO_ID, "line-opacity", 0.45);
    map.setPaintProperty(HALO_ID, "line-blur", 1.8);
  } else {
    const layer = {
      id: HALO_ID,
      type: "line" as const,
      source: sourceId,
      paint: {
        "line-color": "rgba(5,10,22,0.6)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.2, 9, 1.8, 12, 2.4] as ExpressionSpecification,
        "line-opacity": 0.45,
        "line-blur": 1.8,
      },
    };
    if (map.getLayer(lineId)) {
      map.addLayer(layer, lineId);
    } else {
      map.addLayer(layer);
    }
  }

  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, "line-color", borderColor);
    map.setPaintProperty(lineId, "line-width", 0.4);
    map.setPaintProperty(lineId, "line-opacity", 0.85);
  } else {
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": borderColor,
        "line-width": 0.4,
        "line-opacity": 0.85,
      },
    });
  }

  if (DEBUG_MAP) {
    console.info("[MapDebug] addGridOverlay:done", {
      hasSource: Boolean(map.getSource(sourceId)),
      hasFillLayer: Boolean(map.getLayer(fillId)),
      hasLineLayer: Boolean(map.getLayer(lineId)),
    });
  }

  const hoverFilter = emptyHoverFilter();
  if (map.getLayer(HOVER_FILL_ID)) {
    map.setFilter(HOVER_FILL_ID, hoverFilter);
  } else {
    map.addLayer({
      id: HOVER_FILL_ID,
      type: "fill",
      source: sourceId,
      filter: hoverFilter,
      paint: {
        "fill-color": "rgba(25,240,215,0.28)",
        "fill-opacity": 0.2,
      },
    });
  }

  if (map.getLayer(HOVER_GLOW_ID)) {
    map.setFilter(HOVER_GLOW_ID, hoverFilter);
  } else {
    map.addLayer({
      id: HOVER_GLOW_ID,
      type: "line",
      source: sourceId,
      filter: hoverFilter,
      paint: {
        "line-color": "rgba(25,240,215,0.9)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.8, 9, 3.8, 12, 5.0] as ExpressionSpecification,
        "line-opacity": 0.5,
        "line-blur": 2.4,
      },
    });
  }

  if (map.getLayer(HOVER_CORE_ID)) {
    map.setFilter(HOVER_CORE_ID, hoverFilter);
  } else {
    map.addLayer({
      id: HOVER_CORE_ID,
      type: "line",
      source: sourceId,
      filter: hoverFilter,
      paint: {
        "line-color": "rgba(225,255,255,0.95)",
        "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.0, 9, 1.4, 12, 1.8] as ExpressionSpecification,
        "line-opacity": 0.9,
      },
    });
  }

  if (shimmerThreshold !== undefined) {
    const filter = [">=", ["get", "prob"], shimmerThreshold] as ExpressionSpecification;
    if (map.getLayer(SHIMMER_ID)) {
      map.setFilter(SHIMMER_ID, filter);
      map.setPaintProperty(SHIMMER_ID, "fill-color", "rgba(140,255,245,0.35)");
      map.setPaintProperty(SHIMMER_ID, "fill-opacity", 0.2);
    } else {
      const layer = {
        id: SHIMMER_ID,
        type: "fill" as const,
        source: sourceId,
        filter,
        paint: {
          "fill-color": "rgba(140,255,245,0.35)",
          "fill-opacity": 0.2,
        },
      };
      if (map.getLayer(lineId)) {
        map.addLayer(layer, lineId);
      } else {
        map.addLayer(layer);
      }
    }

    if (map.getLayer(PEAK_SHINE_ID)) {
      map.setFilter(PEAK_SHINE_ID, filter);
      map.setPaintProperty(PEAK_SHINE_ID, "line-opacity", 0.24);
    } else {
      const layer = {
        id: PEAK_SHINE_ID,
        type: "line" as const,
        source: sourceId,
        filter,
        paint: {
          "line-color": "rgba(96,190,204,0.38)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.4, 9, 2.2, 12, 3.0] as ExpressionSpecification,
          "line-opacity": 0.24,
          "line-blur": 2.0,
        },
      };
      if (map.getLayer(lineId)) {
        map.addLayer(layer, lineId);
      } else {
        map.addLayer(layer);
      }
    }

    if (map.getLayer(BIO_GLOW_FILL_ID)) {
      map.setFilter(BIO_GLOW_FILL_ID, filter);
      map.setPaintProperty(BIO_GLOW_FILL_ID, "fill-color", "rgba(88,248,230,0.52)");
      map.setPaintProperty(BIO_GLOW_FILL_ID, "fill-opacity", 0.16);
    } else {
      const layer: FillLayerSpecification = {
        id: BIO_GLOW_FILL_ID,
        type: "fill" as const,
        source: sourceId,
        filter,
        paint: {
          "fill-color": "rgba(88,248,230,0.52)",
          "fill-opacity": 0.16,
        },
      };
      if (map.getLayer(lineId)) {
        map.addLayer(layer, lineId);
      } else {
        map.addLayer(layer);
      }
    }

    if (map.getLayer(BIO_CORE_FILL_ID)) {
      map.setFilter(BIO_CORE_FILL_ID, filter);
      map.setPaintProperty(BIO_CORE_FILL_ID, "fill-color", "rgba(190,255,247,0.55)");
      map.setPaintProperty(BIO_CORE_FILL_ID, "fill-opacity", 0.08);
    } else {
      const layer: FillLayerSpecification = {
        id: BIO_CORE_FILL_ID,
        type: "fill" as const,
        source: sourceId,
        filter,
        paint: {
          "fill-color": "rgba(190,255,247,0.55)",
          "fill-opacity": 0.08,
        },
      };
      if (map.getLayer(lineId)) {
        map.addLayer(layer, lineId);
      } else {
        map.addLayer(layer);
      }
    }

    if (map.getLayer(BIO_EDGE_ID)) {
      map.setFilter(BIO_EDGE_ID, filter);
      map.setPaintProperty(BIO_EDGE_ID, "line-opacity", 0.26);
    } else {
      const layer = {
        id: BIO_EDGE_ID,
        type: "line" as const,
        source: sourceId,
        filter,
        paint: {
          "line-color": "rgba(112,198,210,0.42)",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.9, 9, 1.25, 12, 1.8] as ExpressionSpecification,
          "line-opacity": 0.26,
          "line-blur": 0.35,
        },
      };
      if (map.getLayer(lineId)) {
        map.addLayer(layer, lineId);
      } else {
        map.addLayer(layer);
      }
    }

    map.setPaintProperty(lineId, "line-width", [
      "interpolate",
      ["linear"],
      ["zoom"],
      6,
      ["case", [">=", ["coalesce", ["get", "prob"], 0], shimmerThreshold], 0.72, 0.38],
      9,
      ["case", [">=", ["coalesce", ["get", "prob"], 0], shimmerThreshold], 0.96, 0.44],
      12,
      ["case", [">=", ["coalesce", ["get", "prob"], 0], shimmerThreshold], 1.24, 0.56],
    ] as ExpressionSpecification);
    map.setPaintProperty(lineId, "line-color", [
      "case",
      [">=", ["coalesce", ["get", "prob"], 0], shimmerThreshold],
      lineAccentColor,
      borderColor,
    ] as ExpressionSpecification);
  } else {
    removeLayerIfExists(map, SHIMMER_ID);
    removeLayerIfExists(map, PEAK_SHINE_ID);
    removeLayerIfExists(map, BIO_GLOW_FILL_ID);
    removeLayerIfExists(map, BIO_CORE_FILL_ID);
    removeLayerIfExists(map, BIO_EDGE_ID);
    map.setPaintProperty(lineId, "line-color", borderColor);
    map.setPaintProperty(lineId, "line-width", 0.4);
  }

  if (hotspotThreshold !== undefined) {
    const visibility = hotspotsVisible ? ("visible" as const) : ("none" as const);
    const filter = [">=", ["get", "prob"], hotspotThreshold] as ExpressionSpecification;
    // Visual "dissolve": avoid per-hex hotspot linework and use soft stacked fills.
    removeLayerIfExists(map, PEAK_GLOW_ID);
    removeLayerIfExists(map, PEAK_BASE_ID);
    removeLayerIfExists(map, HOT_SPARKLE_ID);
    removeLayerIfExists(map, HOT_BASE_ID);

    if (map.getLayer(HOT_FILL_SOFT_ID)) {
      map.setFilter(HOT_FILL_SOFT_ID, filter);
      map.setLayoutProperty(HOT_FILL_SOFT_ID, "visibility", visibility);
      map.setPaintProperty(HOT_FILL_SOFT_ID, "fill-color", HOTSPOT_GLOW_COLOR);
      map.setPaintProperty(HOT_FILL_SOFT_ID, "fill-opacity", 0.28);
    } else {
      const layer: FillLayerSpecification = {
        id: HOT_FILL_SOFT_ID,
        type: "fill" as const,
        source: sourceId,
        filter,
        layout: { visibility },
        paint: {
          "fill-color": HOTSPOT_GLOW_COLOR,
          "fill-opacity": 0.28,
        },
      };
      if (map.getLayer(fillId)) {
        map.addLayer(layer, fillId);
      } else {
        map.addLayer(layer);
      }
    }

    if (map.getLayer(HOT_FILL_HALO_ID)) {
      map.setFilter(HOT_FILL_HALO_ID, filter);
      map.setLayoutProperty(HOT_FILL_HALO_ID, "visibility", visibility);
      map.setPaintProperty(HOT_FILL_HALO_ID, "fill-color", HOTSPOT_SPARKLE_COLOR);
      map.setPaintProperty(HOT_FILL_HALO_ID, "fill-opacity", 0.22);
    } else {
      const layer: FillLayerSpecification = {
        id: HOT_FILL_HALO_ID,
        type: "fill" as const,
        source: sourceId,
        filter,
        layout: { visibility },
        paint: {
          "fill-color": HOTSPOT_SPARKLE_COLOR,
          "fill-opacity": 0.22,
        },
      };
      if (map.getLayer(fillId)) {
        map.addLayer(layer, fillId);
      } else {
        map.addLayer(layer);
      }
    }
  } else {
    removeLayerIfExists(map, HOT_FILL_HALO_ID);
    removeLayerIfExists(map, HOT_FILL_SOFT_ID);
    removeLayerIfExists(map, PEAK_GLOW_ID);
    removeLayerIfExists(map, PEAK_BASE_ID);
    removeLayerIfExists(map, HOT_SPARKLE_ID);
    removeLayerIfExists(map, HOT_BASE_ID);
  }
}

export function addSurfaceOverlay(
  map: MapLibreMap,
  fc: FeatureCollection,
  paletteColors: string[],
  darkMode: boolean,
  scale?: HeatScale | null
) {
  const raster = buildSurfaceRaster(fc, paletteColors, scale);
  if (!raster) return;

  const source = map.getSource(SURFACE_SOURCE_ID) as ImageSource | undefined;
  if (source && typeof source.updateImage === "function") {
    source.updateImage({
      url: raster.dataUrl,
      coordinates: raster.coordinates,
    });
  } else {
    removeLayerIfExists(map, SURFACE_LAYER_ID);
    removeSourceIfExists(map, SURFACE_SOURCE_ID);
    map.addSource(SURFACE_SOURCE_ID, {
      type: "image",
      url: raster.dataUrl,
      coordinates: raster.coordinates,
    });
  }

  if (map.getLayer(SURFACE_LAYER_ID)) {
    map.setPaintProperty(SURFACE_LAYER_ID, "raster-opacity", darkMode ? 0.84 : 0.76);
    map.setPaintProperty(SURFACE_LAYER_ID, "raster-fade-duration", 180);
    return;
  }

  map.addLayer(
    {
      id: SURFACE_LAYER_ID,
      type: "raster",
      source: SURFACE_SOURCE_ID,
      paint: {
        "raster-opacity": darkMode ? 0.84 : 0.76,
        "raster-fade-duration": 180,
        "raster-resampling": "linear",
      },
      layout: {
        visibility: "none",
      },
    },
    DEFAULT_FILL_ID
  );
}

export function setGridBaseVisibility(
  map: MapLibreMap,
  visible: boolean,
  fillId = DEFAULT_FILL_ID,
  lineId = DEFAULT_LINE_ID
) {
  setGridCoreLayerVisibility(map, visible, fillId, lineId);
  if (map.getLayer(fillId)) {
    map.setPaintProperty(fillId, "fill-opacity", visible ? 0.8 : 0);
  }
  if (map.getLayer(SHIMMER_ID)) {
    map.setPaintProperty(SHIMMER_ID, "fill-opacity", visible ? 0.2 : 0);
  }
  if (map.getLayer(PEAK_SHINE_ID)) {
    map.setPaintProperty(PEAK_SHINE_ID, "line-opacity", visible ? 0.24 : 0);
  }
  if (map.getLayer(BIO_GLOW_FILL_ID)) {
    map.setPaintProperty(BIO_GLOW_FILL_ID, "fill-opacity", visible ? 0.16 : 0);
  }
  if (map.getLayer(BIO_CORE_FILL_ID)) {
    map.setPaintProperty(BIO_CORE_FILL_ID, "fill-opacity", visible ? 0.08 : 0);
  }
  if (map.getLayer(BIO_EDGE_ID)) {
    map.setPaintProperty(BIO_EDGE_ID, "line-opacity", visible ? 0.26 : 0);
  }
  if (map.getLayer(HOVER_FILL_ID)) {
    map.setPaintProperty(HOVER_FILL_ID, "fill-opacity", visible ? 0.2 : 0);
  }
  if (map.getLayer(HOVER_GLOW_ID)) {
    map.setPaintProperty(HOVER_GLOW_ID, "line-opacity", visible ? 0.5 : 0);
  }
  if (map.getLayer(HOVER_CORE_ID)) {
    map.setPaintProperty(HOVER_CORE_ID, "line-opacity", visible ? 0.9 : 0);
  }
  if (map.getLayer(HALO_ID)) {
    map.setPaintProperty(HALO_ID, "line-opacity", visible ? 0.45 : 0);
  }
  if (map.getLayer(lineId)) {
    map.setPaintProperty(lineId, "line-opacity", visible ? 0.35 : 0);
  }
}

export function setGridVisibility(
  map: MapLibreMap,
  visible: boolean,
  fillId = DEFAULT_FILL_ID,
  lineId = DEFAULT_LINE_ID
) {
  setGridBaseVisibility(map, visible, fillId, lineId);
  if (!visible) {
    setHotspotVisibility(map, false);
  }
}

export function setGridCoreLayerVisibility(
  map: MapLibreMap,
  visible: boolean,
  fillId = DEFAULT_FILL_ID,
  lineId = DEFAULT_LINE_ID
) {
  const visibility = visible ? "visible" : "none";
  [
    fillId,
    lineId,
    HALO_ID,
    SHIMMER_ID,
    PEAK_SHINE_ID,
    BIO_GLOW_FILL_ID,
    BIO_CORE_FILL_ID,
    BIO_EDGE_ID,
    HOVER_FILL_ID,
    HOVER_GLOW_ID,
    HOVER_CORE_ID,
  ].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  });
}

export function setSurfaceVisibility(map: MapLibreMap, visible: boolean) {
  if (map.getLayer(SURFACE_LAYER_ID)) {
    map.setLayoutProperty(SURFACE_LAYER_ID, "visibility", visible ? "visible" : "none");
  }
}

export function removeGridOverlay(
  map: MapLibreMap,
  sourceId = DEFAULT_SOURCE_ID,
  fillId = DEFAULT_FILL_ID,
  lineId = DEFAULT_LINE_ID
) {
  removeLayerIfExists(map, PEAK_SHINE_ID);
  removeLayerIfExists(map, SHIMMER_ID);
  removeLayerIfExists(map, BIO_EDGE_ID);
  removeLayerIfExists(map, BIO_CORE_FILL_ID);
  removeLayerIfExists(map, BIO_GLOW_FILL_ID);
  removeLayerIfExists(map, HOVER_CORE_ID);
  removeLayerIfExists(map, HOVER_GLOW_ID);
  removeLayerIfExists(map, HOVER_FILL_ID);
  removeLayerIfExists(map, HALO_ID);
  removeLayerIfExists(map, HOT_FILL_HALO_ID);
  removeLayerIfExists(map, HOT_FILL_SOFT_ID);
  removeLayerIfExists(map, PEAK_GLOW_ID);
  removeLayerIfExists(map, PEAK_BASE_ID);
  removeLayerIfExists(map, HOT_SPARKLE_ID);
  removeLayerIfExists(map, HOT_BASE_ID);
  removeLayerIfExists(map, SURFACE_LAYER_ID);
  removeLayerIfExists(map, lineId);
  removeLayerIfExists(map, fillId);
  removeSourceIfExists(map, SURFACE_SOURCE_ID);
  removeSourceIfExists(map, sourceId);
}

export function setHotspotVisibility(map: MapLibreMap, visible: boolean) {
  const visibility = visible ? "visible" : "none";
  if (map.getLayer(HOT_FILL_SOFT_ID)) {
    map.setLayoutProperty(HOT_FILL_SOFT_ID, "visibility", visibility);
  }
  if (map.getLayer(HOT_FILL_HALO_ID)) {
    map.setLayoutProperty(HOT_FILL_HALO_ID, "visibility", visibility);
  }
  if (map.getLayer(HOT_BASE_ID)) {
    map.setLayoutProperty(HOT_BASE_ID, "visibility", visibility);
  }
  if (map.getLayer(HOT_SPARKLE_ID)) {
    map.setLayoutProperty(HOT_SPARKLE_ID, "visibility", visibility);
  }
  if (map.getLayer(PEAK_BASE_ID)) {
    map.setLayoutProperty(PEAK_BASE_ID, "visibility", visibility);
  }
  if (map.getLayer(PEAK_GLOW_ID)) {
    map.setLayoutProperty(PEAK_GLOW_ID, "visibility", visibility);
  }
}

export function updateGridFillColor(
  map: MapLibreMap,
  fillColorExpr: FillColorSpec,
  fillId = DEFAULT_FILL_ID
) {
  if (map.getLayer(fillId)) {
    map.setPaintProperty(fillId, "fill-color", fillColorExpr);
  }
}

export function setGridHoverCell(
  map: MapLibreMap,
  cellId: string | null
) {
  const filter = cellId ? buildHoverFilter(cellId) : emptyHoverFilter();
  if (map.getLayer(HOVER_FILL_ID)) {
    map.setFilter(HOVER_FILL_ID, filter);
  }
  if (map.getLayer(HOVER_GLOW_ID)) {
    map.setFilter(HOVER_GLOW_ID, filter);
  }
  if (map.getLayer(HOVER_CORE_ID)) {
    map.setFilter(HOVER_CORE_ID, filter);
  }
}
