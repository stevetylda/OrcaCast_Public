import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, GeoJsonProperties, MultiPolygon, Point, Polygon, Position } from "geojson";

export type SmoothSurfaceOverlay = {
  url: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
};

export function emptyTransparentDataUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  return canvas.toDataURL("image/png");
}

export function upsertSmoothSurface(map: MapLibreMap, sourceId: string, overlay: SmoothSurfaceOverlay | null) {
  const source = map.getSource(sourceId) as maplibregl.Source | undefined;
  const imageSource = source as maplibregl.ImageSource & {
    updateImage?: (options: { url: string; coordinates: SmoothSurfaceOverlay["coordinates"] }) => void;
  };
  const next = overlay ?? {
    url: emptyTransparentDataUrl(),
    coordinates: [[-180, 85], [180, 85], [180, -85], [-180, -85]] as SmoothSurfaceOverlay["coordinates"],
  };
  imageSource?.updateImage?.(next);
}

export function buildSmoothSurfaceOverlay(
  featuresInput: Array<Feature<Polygon | MultiPolygon | Point, GeoJsonProperties>>,
  getValue: (feature: Feature<Polygon | MultiPolygon | Point, GeoJsonProperties>) => number,
  resolveColor: (value: number) => string
): SmoothSurfaceOverlay | null {
  const features = featuresInput.filter((feature) => feature.geometry);
  if (features.length === 0) return null;
  const bounds = getFeatureBounds(features);
  if (!bounds) return null;

  const { width, height, blurPx } = getRasterDimensions(bounds);
  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = width;
  baseCanvas.height = height;
  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) return null;
  baseCtx.imageSmoothingEnabled = true;
  baseCtx.imageSmoothingQuality = "high";

  baseCtx.clearRect(0, 0, width, height);
  for (const feature of features) {
    const value = getValue(feature);
    if (!Number.isFinite(value) || value <= 0) continue;
    drawFeatureBlob(baseCtx, feature, resolveColor(value), bounds, width, height);
  }

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = width;
  blurCanvas.height = height;
  const blurCtx = blurCanvas.getContext("2d");
  if (!blurCtx) return null;
  blurCtx.imageSmoothingEnabled = true;
  blurCtx.imageSmoothingQuality = "high";
  blurCtx.clearRect(0, 0, width, height);
  blurCtx.filter = `blur(${blurPx}px)`;
  blurCtx.drawImage(baseCanvas, 0, 0);
  blurCtx.globalAlpha = 0.92;
  blurCtx.drawImage(baseCanvas, 0, 0);
  blurCtx.filter = "none";
  blurCtx.globalAlpha = 1;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return null;
  maskCtx.clearRect(0, 0, width, height);
  maskCtx.fillStyle = "#ffffff";
  let hasPolygonMask = false;
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "Polygon") {
      hasPolygonMask = true;
      fillPolygonMask(maskCtx, geometry.coordinates, bounds, width, height);
    } else if (geometry.type === "MultiPolygon") {
      hasPolygonMask = true;
      for (const polygon of geometry.coordinates) {
        fillPolygonMask(maskCtx, polygon, bounds, width, height);
      }
    }
  }

  if (hasPolygonMask) {
    blurCtx.globalCompositeOperation = "destination-in";
    blurCtx.drawImage(maskCanvas, 0, 0);
    blurCtx.globalCompositeOperation = "source-over";
  }

  return {
    url: blurCanvas.toDataURL("image/png"),
    coordinates: [
      [bounds.west, bounds.north],
      [bounds.east, bounds.north],
      [bounds.east, bounds.south],
      [bounds.west, bounds.south],
    ],
  };
}

function getRasterDimensions(bounds: { west: number; east: number; south: number; north: number }) {
  const mercatorWidth = Math.max(1e-9, Math.abs(bounds.east - bounds.west));
  const mercatorHeight = Math.max(1e-9, Math.abs(mercatorY(bounds.north) - mercatorY(bounds.south)));
  const aspect = mercatorWidth / mercatorHeight;
  // Keep comfortably under common WebGL max texture limits on integrated GPUs.
  const maxSide = 4096;
  const minSide = 2400;
  const maxArea = 12_000_000;

  let width: number;
  let height: number;
  if (aspect >= 1) {
    width = maxSide;
    height = Math.round(width / aspect);
    if (height < minSide) {
      height = minSide;
      width = Math.round(height * aspect);
    }
  } else {
    height = maxSide;
    width = Math.round(height * aspect);
    if (width < minSide) {
      width = minSide;
      height = Math.round(width / aspect);
    }
  }

  const area = width * height;
  if (area > maxArea) {
    const scale = Math.sqrt(maxArea / area);
    width = Math.max(2400, Math.round(width * scale));
    height = Math.max(2400, Math.round(height * scale));
  }

  width = Math.min(width, maxSide);
  height = Math.min(height, maxSide);

  return {
    width,
    height,
    blurPx: Math.max(34, Math.round(Math.max(width, height) / 110)),
  };
}

function drawFeatureBlob(
  ctx: CanvasRenderingContext2D,
  feature: Feature<Polygon | MultiPolygon | Point, GeoJsonProperties>,
  color: string,
  bounds: { west: number; east: number; south: number; north: number },
  width: number,
  height: number
) {
  const center = getFeatureCentroid(feature);
  if (!center) return;
  const [x, y] = projectToCanvas(center, bounds, width, height);
  const radius = Math.max(18, estimateFeatureRadiusPx(feature, bounds, width, height) * 2.6);
  const gradient = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius);
  gradient.addColorStop(0, applyAlphaToColor(color, 0.88));
  gradient.addColorStop(0.24, applyAlphaToColor(color, 0.62));
  gradient.addColorStop(0.52, applyAlphaToColor(color, 0.34));
  gradient.addColorStop(1, applyAlphaToColor(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function fillPolygonMask(
  ctx: CanvasRenderingContext2D,
  polygon: Position[][],
  bounds: { west: number; east: number; south: number; north: number },
  width: number,
  height: number
) {
  const outerRing = polygon[0] ?? [];
  if (outerRing.length < 4) return;
  ctx.beginPath();
  for (let index = 0; index < outerRing.length; index += 1) {
    const [x, y] = projectToCanvas(outerRing[index], bounds, width, height);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function projectToCanvas(
  point: Position,
  bounds: { west: number; east: number; south: number; north: number },
  width: number,
  height: number
): [number, number] {
  const x = ((point[0] - bounds.west) / Math.max(bounds.east - bounds.west, 1e-9)) * width;
  const mercatorNorth = mercatorY(bounds.north);
  const mercatorSouth = mercatorY(bounds.south);
  const mercatorPoint = mercatorY(point[1]);
  const y = ((mercatorNorth - mercatorPoint) / Math.max(mercatorNorth - mercatorSouth, 1e-9)) * height;
  return [x, y];
}

function getFeatureCentroid(feature: Feature<Polygon | MultiPolygon | Point, GeoJsonProperties>): Position | null {
  const geometry = feature.geometry;
  if (!geometry) return null;
  if (geometry.type === "Point") return geometry.coordinates;

  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let totalX = 0;
  let totalY = 0;
  let count = 0;
  for (const polygon of polygons) {
    const ring = polygon[0] ?? [];
    for (const [lng, lat] of ring) {
      totalX += lng;
      totalY += lat;
      count += 1;
    }
  }
  if (count === 0) return null;
  return [totalX / count, totalY / count];
}

function estimateFeatureRadiusPx(
  feature: Feature<Polygon | MultiPolygon | Point, GeoJsonProperties>,
  bounds: { west: number; east: number; south: number; north: number },
  width: number,
  height: number
): number {
  const geometry = feature.geometry;
  if (!geometry) return 12;
  if (geometry.type === "Point") return 18;

  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        west = Math.min(west, lng);
        east = Math.max(east, lng);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
  }
  if (!Number.isFinite(west) || !Number.isFinite(east) || !Number.isFinite(south) || !Number.isFinite(north)) return 12;
  const [minX, maxY] = projectToCanvas([west, north], bounds, width, height);
  const [maxX, minY] = projectToCanvas([east, south], bounds, width, height);
  const dx = Math.abs(maxX - minX);
  const dy = Math.abs(maxY - minY);
  return Math.max(10, Math.sqrt(dx * dx + dy * dy) * 0.65);
}

function getFeatureBounds(
  features: Array<Feature<Polygon | MultiPolygon | Point, GeoJsonProperties>>
): { west: number; east: number; south: number; north: number } | null {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const positions =
      geometry.type === "Point"
        ? [geometry.coordinates]
        : geometry.type === "Polygon"
          ? geometry.coordinates.flat()
          : geometry.coordinates.flat(2);
    for (const [lng, lat] of positions) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  if (!Number.isFinite(west) || !Number.isFinite(east) || !Number.isFinite(south) || !Number.isFinite(north)) return null;
  return { west, east, south, north };
}

function mercatorY(lat: number) {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function applyAlphaToColor(color: string, alpha: number) {
  const sanitized = color.trim();
  if (sanitized.startsWith("rgba(")) {
    const parts = sanitized.slice(5, -1).split(",").map((part) => part.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  if (sanitized.startsWith("rgb(")) {
    const parts = sanitized.slice(4, -1).split(",").map((part) => part.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  return sanitized;
}
