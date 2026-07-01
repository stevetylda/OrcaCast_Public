import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { getH3CellId } from "../../../../shared/data/h3";
import { applyBasemapVisualTuning } from "../../../map/buildLayers";
import type { NeighborhoodSeedEntry, NeighborhoodSeries } from "../types";

type GridPayload = Awaited<ReturnType<typeof import("../../../../shared/data/forecastIO").loadGrid>>;

export function extractFeaturePolygons(
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
    | { type: string }
    | null
    | undefined
): number[][][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon" && "coordinates" in geometry) return [geometry.coordinates];
  if (geometry.type === "MultiPolygon" && "coordinates" in geometry) return geometry.coordinates;
  return [];
}

export function computeFeatureCentroid(
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
    | { type: string }
    | null
    | undefined
): [number, number] | null {
  if (!geometry) return null;
  const coords: number[][] = [];
  if (geometry.type === "Polygon" && "coordinates" in geometry) {
    for (const ring of geometry.coordinates) coords.push(...ring);
  } else if (geometry.type === "MultiPolygon" && "coordinates" in geometry) {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) coords.push(...ring);
    }
  } else {
    return null;
  }
  if (coords.length === 0) return null;
  const sum = coords.reduce<[number, number]>(
    (acc, pair) => [acc[0] + Number(pair[0] ?? 0), acc[1] + Number(pair[1] ?? 0)],
    [0, 0]
  );
  return [sum[0] / coords.length, sum[1] / coords.length];
}

export function squaredDistance(a: [number, number], b: [number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

export function getSeedBounds(neighborhoodSeed: Array<{ polygons: number[][][][] }>) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  neighborhoodSeed.forEach((entry) => {
    entry.polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach(([x, y]) => {
          minX = Math.min(minX, Number(x));
          maxX = Math.max(maxX, Number(x));
          minY = Math.min(minY, Number(y));
          maxY = Math.max(maxY, Number(y));
        });
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  return { minX, maxX, minY, maxY };
}

export function buildNeighborhoodContextPolygons(
  neighborhoodSeed: NeighborhoodSeedEntry[],
  grid: GridPayload | null
): number[][][][] {
  if (!grid || neighborhoodSeed.length === 0) return [];
  const neighborhoodIds = new Set(neighborhoodSeed.map((entry) => entry.cellId));
  const bounds = getSeedBounds(neighborhoodSeed);
  const padX = Math.max((bounds.maxX - bounds.minX) * 0.55, 1e-6);
  const padY = Math.max((bounds.maxY - bounds.minY) * 0.55, 1e-6);
  const minX = bounds.minX - padX;
  const maxX = bounds.maxX + padX;
  const minY = bounds.minY - padY;
  const maxY = bounds.maxY + padY;
  return (grid.features ?? [])
    .map((feature) => {
      const props = (feature.properties as Record<string, unknown> | null) ?? null;
      const featureCellId = getH3CellId(props);
      if (!featureCellId || neighborhoodIds.has(featureCellId)) return null;
      const centroid = computeFeatureCentroid(feature.geometry);
      const polygons = extractFeaturePolygons(feature.geometry);
      if (!centroid || polygons.length === 0) return null;
      if (centroid[0] < minX || centroid[0] > maxX || centroid[1] < minY || centroid[1] > maxY) return null;
      return polygons;
    })
    .filter((entry): entry is number[][][][] => entry !== null)
    .flat();
}

export function getNeighborhoodBounds(
  series: NeighborhoodSeries[],
  contextPolygons: number[][][][],
  expandRatio = 0
) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  contextPolygons.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(([x, y]) => {
        minX = Math.min(minX, Number(x));
        maxX = Math.max(maxX, Number(x));
        minY = Math.min(minY, Number(y));
        maxY = Math.max(maxY, Number(y));
      });
    });
  });
  series.forEach((entry) => {
    entry.polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach(([x, y]) => {
          minX = Math.min(minX, Number(x));
          maxX = Math.max(maxX, Number(x));
          minY = Math.min(minY, Number(y));
          maxY = Math.max(maxY, Number(y));
        });
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  const padX = Math.max((maxX - minX) * expandRatio, 1e-6);
  const padY = Math.max((maxY - minY) * expandRatio, 1e-6);
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

export function buildNeighborhoodMiniMapGeoJson(
  series: NeighborhoodSeries[],
  contextPolygons: number[][][][],
  activeCellId: string | null,
  getNeighborColor: (ringIndex: number) => string
): FeatureCollection {
  const contextFeatures: Array<Feature<Polygon | MultiPolygon>> = contextPolygons.map((polygon, index) => ({
    type: "Feature",
    properties: {
      kind: "context",
      cellId: `context-${index}`,
      fill: "rgba(148, 163, 184, 0.16)",
      line: "rgba(96, 124, 164, 0.22)",
      opacity: 0.28,
      lineWidth: 1,
    },
    geometry:
      polygon.length === 1
        ? ({ type: "Polygon", coordinates: polygon } as unknown as Polygon)
        : ({ type: "MultiPolygon", coordinates: polygon } as unknown as MultiPolygon),
  }));
  const neighborFeatures: Array<Feature<Polygon | MultiPolygon>> = series.map((entry) => ({
    type: "Feature",
    properties: {
      kind: "neighbor",
      cellId: entry.cellId,
      fill: getNeighborColor(entry.ringIndex),
      line: entry.isSelected ? "#f8fafc" : "rgba(255,255,255,0.85)",
      opacity: activeCellId ? (activeCellId === entry.cellId ? 0.92 : 0.5) : 0.76,
      lineWidth: activeCellId === entry.cellId ? 3.2 : 1.8,
    },
    geometry:
      entry.polygons.length === 1
        ? ({ type: "Polygon", coordinates: entry.polygons[0] } as unknown as Polygon)
        : ({ type: "MultiPolygon", coordinates: entry.polygons } as unknown as MultiPolygon),
  }));
  return { type: "FeatureCollection", features: [...contextFeatures, ...neighborFeatures] };
}

export function syncNeighborhoodMiniMap(
  map: MapLibreMap,
  data: FeatureCollection,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
) {
  const sourceId = "neighbor-mini-map";
  const fillId = "neighbor-focus-fill";
  const lineId = "neighbor-focus-line";
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(sourceId, { type: "geojson", data });
  }
  if (!map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": ["coalesce", ["get", "fill"], "rgba(0,0,0,0)"],
        "fill-opacity": ["coalesce", ["get", "opacity"], 0.5],
      },
    });
  } else {
    map.setPaintProperty(fillId, "fill-color", ["coalesce", ["get", "fill"], "rgba(0,0,0,0)"]);
    map.setPaintProperty(fillId, "fill-opacity", ["coalesce", ["get", "opacity"], 0.5]);
  }
  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": ["coalesce", ["get", "line"], "rgba(255,255,255,0.5)"],
        "line-width": ["coalesce", ["get", "lineWidth"], 1],
        "line-opacity": 0.96,
      },
    });
  } else {
    map.setPaintProperty(lineId, "line-color", ["coalesce", ["get", "line"], "rgba(255,255,255,0.5)"]);
    map.setPaintProperty(lineId, "line-width", ["coalesce", ["get", "lineWidth"], 1]);
  }
  map.fitBounds(
    [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.maxY],
    ],
    { padding: 12, duration: 0, maxZoom: 14 }
  );
}

export function initNeighborhoodMiniMap(map: MapLibreMap, darkMode: boolean) {
  applyBasemapVisualTuning(map, darkMode);
}
