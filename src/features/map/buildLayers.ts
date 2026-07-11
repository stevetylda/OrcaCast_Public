import { Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { getPerfObjectId } from "../../shared/debug/perf";

export const VOYAGER_STYLE = "https://tiles.stadiamaps.com/styles/alidade_smooth.json";
export const DARK_STYLE = "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json";
const STADIA_ATTRIBUTION =
  '<a href="https://stadiamaps.com/" target="_blank">&copy; Stadia Maps</a> <a href="https://openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap</a>';

function buildRasterStyle(styleName: "alidade_smooth" | "alidade_smooth_dark", backgroundColor: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [`https://tiles.stadiamaps.com/tiles/${styleName}/{z}/{x}/{y}@2x.png`],
        tileSize: 512,
        attribution: STADIA_ATTRIBUTION,
      },
    },
    layers: [
      { id: "basemap-background", type: "background", paint: { "background-color": backgroundColor } },
      { id: "basemap-raster", type: "raster", source: "basemap" },
    ],
  };
}

export const VOYAGER_RASTER_STYLE = buildRasterStyle("alidade_smooth", "#f2f3f0");
export const DARK_RASTER_STYLE = buildRasterStyle("alidade_smooth_dark", "#1a2634");
export const BASEMAP_TINT_SOURCE_ID = "orcacast-basemap-tint-source";
export const BASEMAP_TINT_LAYER_ID = "orcacast-basemap-tint-layer";
export const DARK_LABEL_OPACITY = 0.86;
export const DEFAULT_CENTER: [number, number] = [-123.25, 48.55];
export const DEFAULT_ZOOM = 6.5;

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
                coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]],
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
      if (firstSymbolLayerId) map.moveLayer(BASEMAP_TINT_LAYER_ID, firstSymbolLayerId);
    }
  } else {
    if (map.getLayer(BASEMAP_TINT_LAYER_ID)) map.removeLayer(BASEMAP_TINT_LAYER_ID);
    if (map.getSource(BASEMAP_TINT_SOURCE_ID)) map.removeSource(BASEMAP_TINT_SOURCE_ID);
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
