import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { LAST_WEEK_LAYER_CONFIG } from "../../config/mapLayers";
import { getPerfObjectId } from "../../debug/perf";
import type { LastWeekMode } from "./types";

export const VOYAGER_STYLE = "https://tiles.stadiamaps.com/styles/alidade_smooth.json";
export const DARK_STYLE = "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json";
export const BASEMAP_TINT_SOURCE_ID = "orcacast-basemap-tint-source";
export const BASEMAP_TINT_LAYER_ID = "orcacast-basemap-tint-layer";
export const DARK_LABEL_OPACITY = 0.86;
export const DEFAULT_CENTER: [number, number] = [-123.25, 48.55];
export const DEFAULT_ZOOM = 6.5;
export const LAST_WEEK_SOURCE_ID = "last-week-sightings";
export const LAST_WEEK_VECTOR_SOURCE_ID = "last-week-sightings-vector";
export const LAST_WEEK_LAYER_ID = "last-week-sightings-circle";
export const LAST_WEEK_HALO_ID = "last-week-sightings-halo";
export const LAST_WEEK_RING_ID = "last-week-sightings-ring";
export const LAST_WEEK_WHITE_ID = "last-week-sightings-white";

export function createGridLayerBuildSignature(inputs: {
  data: FeatureCollection | null;
  fillColorExpr?: unknown;
  hotspotThreshold?: number;
  hotspotsVisible: boolean;
  shimmerThreshold?: number;
  borderColor: string;
}): string {
  return [
    `data:${getPerfObjectId(inputs.data)}`,
    `fill:${getPerfObjectId(inputs.fillColorExpr ?? null)}`,
    `threshold:${inputs.hotspotThreshold ?? "none"}`,
    `hotspots:${inputs.hotspotsVisible ? 1 : 0}`,
    `shimmer:${inputs.shimmerThreshold ?? "none"}`,
    `border:${inputs.borderColor}`,
  ].join("|");
}

export function applyBasemapVisualTuning(map: MapLibreMap, isDarkBasemap: boolean) {
  const style = map.getStyle();
  const layers = style?.layers ?? [];
  if (layers.length === 0) return;

  if (isDarkBasemap) {
    const firstSymbolLayerId = layers.find((layer) => layer.type === "symbol")?.id;
    if (!map.getSource(BASEMAP_TINT_SOURCE_ID)) {
      map.addSource(BASEMAP_TINT_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [[[-180, -85],[180, -85],[180, 85],[-180, 85],[-180, -85]]],
              },
            },
          ],
        },
      });
    }
    if (!map.getLayer(BASEMAP_TINT_LAYER_ID)) {
      map.addLayer(
        {
          id: BASEMAP_TINT_LAYER_ID,
          type: "fill",
          source: BASEMAP_TINT_SOURCE_ID,
          paint: { "fill-color": "#3a4148", "fill-opacity": 0.14 },
        },
        firstSymbolLayerId
      );
    } else {
      map.setPaintProperty(BASEMAP_TINT_LAYER_ID, "fill-color", "#3a4148");
      map.setPaintProperty(BASEMAP_TINT_LAYER_ID, "fill-opacity", 0.14);
      if (firstSymbolLayerId) {
        map.moveLayer(BASEMAP_TINT_LAYER_ID, firstSymbolLayerId);
      }
    }
  } else {
    if (map.getLayer(BASEMAP_TINT_LAYER_ID)) {
      map.removeLayer(BASEMAP_TINT_LAYER_ID);
    }
    if (map.getSource(BASEMAP_TINT_SOURCE_ID)) {
      map.removeSource(BASEMAP_TINT_SOURCE_ID);
    }
  }

  layers.forEach((layer) => {
    if (layer.type === "symbol") {
      const layout = (layer as { layout?: Record<string, unknown> }).layout ?? {};
      if ("text-field" in layout) {
        map.setPaintProperty(layer.id, "text-opacity", isDarkBasemap ? DARK_LABEL_OPACITY : 1);
      }
      if ("icon-image" in layout) {
        map.setPaintProperty(layer.id, "icon-opacity", isDarkBasemap ? 0.92 : 1);
      }
      return;
    }

    if (layer.type === "raster") {
      map.setPaintProperty(layer.id, "raster-saturation", isDarkBasemap ? -0.2 : 0);
      map.setPaintProperty(layer.id, "raster-brightness-min", isDarkBasemap ? 0.02 : 0);
      map.setPaintProperty(layer.id, "raster-brightness-max", isDarkBasemap ? 0.92 : 1);
      map.setPaintProperty(layer.id, "raster-contrast", isDarkBasemap ? -0.06 : 0);
    }
  });
}

export function ensureLastWeekLayer(
  map: MapLibreMap,
  data: FeatureCollection,
  sourceId = LAST_WEEK_SOURCE_ID,
  sourceLayer?: string,
  vectorTilesUrl?: string
) {
  if (map.getSource(sourceId)) {
    if (!sourceLayer) {
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
      source.setData(data);
    }
  } else if (sourceLayer) {
    const rawTilesUrl = vectorTilesUrl ?? LAST_WEEK_LAYER_CONFIG.source_url;
    const normalizedUrl =
      /^https?:\/\//i.test(rawTilesUrl) || rawTilesUrl.startsWith("//")
        ? rawTilesUrl
        : `${window.location.origin}${rawTilesUrl.startsWith("/") ? rawTilesUrl : `/${rawTilesUrl}`}`;
    const isPmtilesSource =
      rawTilesUrl.startsWith("pmtiles://") || /\.pmtiles(\?|$)/i.test(rawTilesUrl);
    if (isPmtilesSource) {
      map.addSource(sourceId, { type: "vector", url: normalizedUrl.startsWith("pmtiles://") ? normalizedUrl : `pmtiles://${normalizedUrl}` });
    } else {
      map.addSource(sourceId, {
        type: "vector",
        tiles: [normalizedUrl],
        minzoom: LAST_WEEK_LAYER_CONFIG.minzoom,
        maxzoom: LAST_WEEK_LAYER_CONFIG.maxzoom,
      });
    }
  } else {
    map.addSource(sourceId, { type: "geojson", data });
  }

  const sourceLayerProps = sourceLayer ? { "source-layer": sourceLayer } : {};

  if (!map.getLayer(LAST_WEEK_HALO_ID)) {
    map.addLayer({
      id: LAST_WEEK_HALO_ID,
      type: "circle",
      source: sourceId,
      ...sourceLayerProps,
      paint: {
        "circle-color": "rgba(0,255,240,0.18)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.8, 8, 4, 11, 5],
        "circle-blur": 0.9,
        "circle-opacity": 0.65,
      },
    });
  }

  if (!map.getLayer(LAST_WEEK_RING_ID)) {
    map.addLayer({
      id: LAST_WEEK_RING_ID,
      type: "circle",
      source: sourceId,
      ...sourceLayerProps,
      paint: {
        "circle-color": "rgba(0,0,0,0)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.6, 8, 3.6, 11, 4.6],
        "circle-stroke-width": 2.2,
        "circle-stroke-color": "#FF3B5C",
        "circle-opacity": 0.9,
      },
    });
  }

  if (!map.getLayer(LAST_WEEK_WHITE_ID)) {
    map.addLayer({
      id: LAST_WEEK_WHITE_ID,
      type: "circle",
      source: sourceId,
      ...sourceLayerProps,
      paint: {
        "circle-color": "rgba(0,0,0,0)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 3.1, 8, 4.2, 11, 5.4],
        "circle-stroke-width": 1.2,
        "circle-stroke-color": "rgba(255,255,255,0.9)",
        "circle-opacity": 0.9,
      },
    });
  }

  if (!map.getLayer(LAST_WEEK_LAYER_ID)) {
    map.addLayer({
      id: LAST_WEEK_LAYER_ID,
      type: "circle",
      source: sourceId,
      ...sourceLayerProps,
      paint: {
        "circle-color": "rgba(255,255,255,0.98)",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 8, 1.9, 11, 2.8],
        "circle-stroke-color": "#06184a",
        "circle-stroke-width": 1.4,
        "circle-opacity": 0.95,
      },
    });
  }

  moveLastWeekToTop(map);
}

export function applyLastWeekModeFilters(
  map: MapLibreMap,
  selected: { year: number; week: number },
  previous: { year: number; week: number },
  mode: LastWeekMode,
  sourceLayer?: string
) {
  const toNumber = (property: string) => ["to-number", ["coalesce", ["get", property], 0]];
  const yearExpr = sourceLayer
    ? (["coalesce", toNumber("YEAR"), toNumber("year"), toNumber("Year")] as unknown[])
    : (["to-number", ["coalesce", ["get", "year"], ["get", "YEAR"], selected.year]] as unknown[]);
  const weekExpr = sourceLayer
    ? (["coalesce", toNumber("WEEK"), toNumber("week"), toNumber("STAT_WEEK")] as unknown[])
    : (["to-number", ["coalesce", ["get", "week"], ["get", "WEEK"], selected.week]] as unknown[]);

  const isSelected = ["all", ["==", yearExpr, selected.year], ["==", weekExpr, selected.week]];
  const isPrevious = ["all", ["==", yearExpr, previous.year], ["==", weekExpr, previous.week]];
  const modeFilter =
    mode === "selected"
      ? isSelected
      : mode === "previous"
        ? isPrevious
        : mode === "both"
          ? ["any", isSelected, isPrevious]
          : ["==", ["literal", 1], 0];

  [LAST_WEEK_LAYER_ID, LAST_WEEK_HALO_ID, LAST_WEEK_RING_ID, LAST_WEEK_WHITE_ID].forEach((id) => {
    if (map.getLayer(id)) {
      map.setFilter(id, modeFilter as maplibregl.FilterSpecification);
    }
  });

  if (map.getLayer(LAST_WEEK_RING_ID)) {
    map.setPaintProperty(LAST_WEEK_RING_ID, "circle-stroke-color", [
      "case",
      isSelected,
      "#7CFF6B",
      isPrevious,
      "#FF3B5C",
      "#FF3B5C",
    ]);
  }
}

export function moveLastWeekToTop(map: MapLibreMap) {
  if (map.getLayer(LAST_WEEK_HALO_ID)) map.moveLayer(LAST_WEEK_HALO_ID);
  if (map.getLayer(LAST_WEEK_WHITE_ID)) map.moveLayer(LAST_WEEK_WHITE_ID);
  if (map.getLayer(LAST_WEEK_RING_ID)) map.moveLayer(LAST_WEEK_RING_ID);
  if (map.getLayer(LAST_WEEK_LAYER_ID)) map.moveLayer(LAST_WEEK_LAYER_ID);
}
