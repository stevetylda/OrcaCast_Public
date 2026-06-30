import type { Feature, FeatureCollection, Point } from "geojson";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  ExpressionSpecification,
  DataDrivenPropertyValueSpecification,
  FillLayerSpecification,
} from "maplibre-gl";
import { H3_CELL_ID_KEYS } from "../data/h3";

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
const SURFACE_LAYER_ID = "grid-surface-heatmap";
const GRID_SUBTLE_BORDER = "rgba(8,18,44,0.22)";

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

function buildSurfacePointCollection(fc: FeatureCollection): FeatureCollection<Point> {
  const features: Array<Feature<Point>> = [];
  (fc.features ?? []).forEach((feature) => {
    const coords = extractGeometryCoordinates(feature.geometry);
    if (coords.length === 0) return;
    const [sumLng, sumLat] = coords.reduce<[number, number]>(
      (acc, [lng, lat]) => [acc[0] + Number(lng ?? 0), acc[1] + Number(lat ?? 0)],
      [0, 0]
    );
    const prob = Number((feature.properties as Record<string, unknown> | null)?.prob ?? 0);
    features.push({
      type: "Feature",
      properties: { prob },
      geometry: {
        type: "Point",
        coordinates: [sumLng / coords.length, sumLat / coords.length],
      },
    });
  });
  return { type: "FeatureCollection", features };
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
  darkMode: boolean
) {
  const points = buildSurfacePointCollection(fc);
  const source = map.getSource(SURFACE_SOURCE_ID) as GeoJSONSource | undefined;
  if (source) {
    source.setData(points);
  } else {
    map.addSource(SURFACE_SOURCE_ID, {
      type: "geojson",
      data: points,
    });
  }

  const heatmapColor: ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0,
    "rgba(0,0,0,0)",
    0.08,
    paletteColors[0] ?? "rgba(255,255,255,0.12)",
    0.18,
    paletteColors[1] ?? paletteColors[0] ?? "#ffffff",
    0.32,
    paletteColors[2] ?? paletteColors[1] ?? "#ffffff",
    0.46,
    paletteColors[3] ?? paletteColors[2] ?? "#ffffff",
    0.62,
    paletteColors[4] ?? paletteColors[3] ?? "#ffffff",
    0.76,
    paletteColors[5] ?? paletteColors[4] ?? "#ffffff",
    0.9,
    paletteColors[6] ?? paletteColors[5] ?? "#ffffff",
    1,
    paletteColors[7] ?? paletteColors[6] ?? "#ffffff",
  ];

  const opacityExpr = darkMode
    ? (["interpolate", ["linear"], ["zoom"], 5, 0.62, 8, 0.78, 11, 0.88] as ExpressionSpecification)
    : (["interpolate", ["linear"], ["zoom"], 5, 0.5, 8, 0.66, 11, 0.76] as ExpressionSpecification);

  if (map.getLayer(SURFACE_LAYER_ID)) {
    map.setPaintProperty(SURFACE_LAYER_ID, "heatmap-color", heatmapColor);
    map.setPaintProperty(SURFACE_LAYER_ID, "heatmap-opacity", opacityExpr);
    return;
  }

  map.addLayer({
    id: SURFACE_LAYER_ID,
    type: "heatmap",
    source: SURFACE_SOURCE_ID,
    paint: {
      "heatmap-weight": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "prob"], 0],
        0,
        0,
        0.01,
        0.08,
        0.05,
        0.22,
        0.1,
        0.44,
        0.25,
        0.72,
        0.5,
        1,
      ] as ExpressionSpecification,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.9, 7, 1.35, 10, 1.8] as ExpressionSpecification,
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 18, 7, 36, 10, 64, 12, 96] as ExpressionSpecification,
      "heatmap-color": heatmapColor,
      "heatmap-opacity": opacityExpr,
    },
    layout: {
      visibility: "none",
    },
  });
}

export function setGridBaseVisibility(
  map: MapLibreMap,
  visible: boolean,
  fillId = DEFAULT_FILL_ID,
  lineId = DEFAULT_LINE_ID
) {
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
