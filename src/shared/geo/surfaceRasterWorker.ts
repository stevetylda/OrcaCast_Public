import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import {
  buildBucketIndex,
  buildColorStops,
  canvasYToLat,
  clamp,
  estimateMaxDistance,
  getFeatureCenter,
  getFeatureProbability,
  interpolateSurfaceValue,
  latToCanvasY,
  lngToCanvasX,
  mercatorY,
  sampleColor,
  surfaceAlphaForValue,
  type SurfaceBounds,
  type SurfaceRasterWorkerRequest,
  type SurfaceRasterWorkerResponse,
} from "./surfaceRasterMath";

function drawGeometryPath(
  ctx: OffscreenCanvasRenderingContext2D,
  geometry: Polygon | MultiPolygon,
  bounds: SurfaceBounds,
  width: number,
  height: number,
) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
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
  canvas: OffscreenCanvas,
  fc: FeatureCollection,
  bounds: SurfaceBounds,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  (fc.features ?? []).forEach((feature) => {
    if (!Number.isFinite(getFeatureProbability(feature.properties))) return;
    const geometry = feature.geometry;
    if (
      !geometry ||
      (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
    )
      return;
    drawGeometryPath(ctx, geometry, bounds, canvas.width, canvas.height);
  });
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function buildSurfaceSamples(fc: FeatureCollection) {
  const rawSamples: Array<{ lng: number; lat: number; prob: number }> = [];
  (fc.features ?? []).forEach((feature) => {
    const center = getFeatureCenter(feature);
    const prob = getFeatureProbability(feature.properties);
    if (!center || !Number.isFinite(prob)) return;
    const [lng, lat] = center;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    rawSamples.push({ lng, lat, prob });
  });
  return rawSamples.map((sample) => ({
    ...sample,
    projX: sample.lng,
    projY: mercatorY(sample.lat),
  }));
}

async function buildSurfaceRasterBlob(request: SurfaceRasterWorkerRequest) {
  const { fc, bounds, width, height, paletteColors, scale } = request;
  const samples = buildSurfaceSamples(fc);
  const maxDistance = estimateMaxDistance(samples);
  const bucketSize = Math.max(maxDistance, 1e-6);
  const buckets = buildBucketIndex(samples, bucketSize);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context unavailable");

  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 1e-6);
  const { stopValues, stopColors, zeroColor } = buildColorStops(
    samples,
    paletteColors,
    scale,
  );

  for (let y = 0; y < height; y += 1) {
    const lat = canvasYToLat(y, bounds, height);
    const projY = mercatorY(lat);
    for (let x = 0; x < width; x += 1) {
      const lng = bounds.minLng + (x / Math.max(width - 1, 1)) * lngSpan;
      const value = interpolateSurfaceValue(
        buckets,
        lng,
        projY,
        bucketSize,
        maxDistance,
      );
      const pixelIndex = (y * width + x) * 4;
      if (value === null || !Number.isFinite(value)) {
        pixels[pixelIndex + 3] = 0;
        continue;
      }
      const [r, g, b, a] = sampleColor(
        value,
        stopValues,
        stopColors,
        zeroColor,
      );
      const alpha = surfaceAlphaForValue(value, stopValues, a);
      if (alpha <= 0) {
        pixels[pixelIndex + 3] = 0;
        continue;
      }
      pixels[pixelIndex] = Math.round(clamp(r, 0, 255));
      pixels[pixelIndex + 1] = Math.round(clamp(g, 0, 255));
      pixels[pixelIndex + 2] = Math.round(clamp(b, 0, 255));
      pixels[pixelIndex + 3] = Math.round(alpha * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  maskSurfaceToFootprint(canvas, fc, bounds);

  return {
    blob: await canvas.convertToBlob({ type: "image/png" }),
    coordinates: [
      [bounds.minLng, bounds.maxLat],
      [bounds.maxLng, bounds.maxLat],
      [bounds.maxLng, bounds.minLat],
      [bounds.minLng, bounds.minLat],
    ] as [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ],
  };
}

self.onmessage = async (event: MessageEvent<SurfaceRasterWorkerRequest>) => {
  const request = event.data;
  try {
    const raster = await buildSurfaceRasterBlob(request);
    const response: SurfaceRasterWorkerResponse = {
      id: request.id,
      ok: true,
      blob: raster.blob,
      bounds: request.bounds,
      coordinates: raster.coordinates,
    };
    self.postMessage(response);
  } catch (error) {
    const response: SurfaceRasterWorkerResponse = {
      id: request.id,
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown surface raster worker error",
    };
    self.postMessage(response);
  }
};

export {};
