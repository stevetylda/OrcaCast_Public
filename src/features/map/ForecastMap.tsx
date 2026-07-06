import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Period } from "../../shared/data/periods";
import {
  addGridOverlay,
  addSurfaceOverlay,
  setGridBaseVisibility,
  setGridCoreLayerVisibility,
  setGridHoverCell,
  setGridVisibility,
  setHotspotVisibility,
  setSurfaceVisibility,
} from "../../shared/geo/gridOverlay";
import { buildAutoColorExprFromValues, buildFillExprFromScale, buildHotspotOnlyExpr } from "../../shared/geo/colorScale";
import type { HeatScale } from "../../shared/geo/colorScale";
import { getPaletteOrDefault } from "../../shared/geo/palettes";
import { trackLayerRebuild, trackRender } from "../../shared/debug/perf";
import { MapControls } from "./MapControls";
import { createGridInteractionHandlers } from "./MapInteractions";
import { applyBasemapVisualTuning, createGridLayerBuildSignature, DARK_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM, VOYAGER_STYLE } from "./buildLayers";
import { useForecastData } from "./useForecastData";
import { useHotspotAnimation } from "./useHotspotAnimation";
import type { FillColorSpec, ForecastMapHandle, ForecastMapProps, LngLat, SparklineSeries } from "./types";
import { filterPoisByType, hasActivePoiFilter, loadPoiData, type PoiFilters, type PublicPoi } from "../locations/poiData";
import type { SuggestedPlace } from "../locations/types";

function waitForMapRender(map: MapLibreMap, timeoutMs = 2500) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(true);
    };
    map.once("render", () => window.requestAnimationFrame(finish));
    map.triggerRepaint();
  });
}

function safeApplyBasemapVisualTuning(map: MapLibreMap, isDarkBasemap: boolean) {
  try {
    const style = map.getStyle();
    if (!style || !Array.isArray(style.layers) || style.layers.length === 0) return false;
    applyBasemapVisualTuning(map, isDarkBasemap);
    return true;
  } catch {
    return false;
  }
}

function coerceExpectedActivityHotspotCellCount(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.max(0, Math.round(value));
}

// Whale pulse artwork is intentionally kept here for the future aggregate-bubble pass.
export const FUTURE_WHALE_TAIL_SVG = `<svg class="poiMarker__whaleTailIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" focusable="false"><path d="M29 53c2.1-5 2.6-9.1 2.1-12.3-.4-2.5-1.9-4.2-4.6-5.2-3.1-1.1-6.3-1.9-9.1-3.2-6-2.8-10-7.2-11.2-14.8 4.8 2.1 9 3.3 13 3.7 4.4.4 8.4.1 11.6 2.7 1 .8 1.8 1.8 2.3 3 .5-1.2 1.3-2.2 2.3-3 3.2-2.6 7.2-2.3 11.6-2.7 4-.4 8.2-1.6 13-3.7-1.2 7.6-5.2 12-11.2 14.8-2.8 1.3-6 2.1-9.1 3.2-2.7 1-4.2 2.7-4.6 5.2-.5 3.2 0 7.3 2.1 12.3H29Z" fill="currentColor"/></svg>`;

const PLANNER_LOCATION_SOURCE_ID = "planner-location-points";
const PLANNER_LOCATION_HALO_LAYER_ID = "planner-location-points-halo";
const PLANNER_LOCATION_CIRCLE_LAYER_ID = "planner-location-points-circle";
const PLANNER_LOCATION_SYMBOL_LAYER_ID = "planner-location-points-symbol";
const PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID = "planner-location-points-itinerary-badge";
const PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID = "planner-location-points-itinerary-text";
const PLANNER_MAX_TRAVEL_SOURCE_ID = "planner-max-travel-radius";
const PLANNER_MAX_TRAVEL_LAYER_ID = "planner-max-travel-radius-line";

type PlannerLocationKind = "base" | "suggested" | "poi";
type PlannerLocationType = SuggestedPlace["type"] | PublicPoi["type"] | "Base";

type PlannerLocationFeatureProperties = {
  id: string;
  kind: PlannerLocationKind;
  name: string;
  markerType: string;
  iconName: string;
  selected: boolean;
  selectedPulseOn?: boolean;
  itineraryOrder?: number;
  score?: number;
};

type PlannerRadiusFeatureProperties = {
  dashColor: string;
};

type PlannerPinVariant = "suggested" | "poi" | "base";

type PlannerPinSpec = {
  id: string;
  variant: PlannerPinVariant;
  type: PlannerLocationType;
};

const PLANNER_PIN_SPECS: PlannerPinSpec[] = [
  { id: "planner-pin-suggested-park", variant: "suggested", type: "Park" },
  { id: "planner-pin-suggested-marina", variant: "suggested", type: "Marina" },
  { id: "planner-pin-suggested-ferry", variant: "suggested", type: "Ferry" },
  { id: "planner-pin-poi-park", variant: "poi", type: "Park" },
  { id: "planner-pin-poi-marina", variant: "poi", type: "Marina" },
  { id: "planner-pin-poi-ferry", variant: "poi", type: "Ferry" },
  { id: "planner-pin-base", variant: "base", type: "Base" },
];

function getPointCoordinates(latitude: number, longitude: number): LngLat | null {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return [lon, lat];
}

function getPoiIconKey(type?: SuggestedPlace["type"] | PublicPoi["type"]) {
  if (type === "Park") return "park";
  if (type === "Marina") return "marina";
  if (type === "Ferry") return "ferry";
  return "marina";
}

function getPlannerLocationIconName(kind: PlannerLocationKind, type?: SuggestedPlace["type"] | PublicPoi["type"]) {
  if (kind === "base") return "planner-pin-base";
  return `planner-pin-${kind}-${getPoiIconKey(type)}`;
}

function getSuggestedPlacePopupHtml(place: SuggestedPlace) {
  return `<div class="poiPopup"><div class="poiPopup__title">${place.name}</div><div class="poiPopup__meta">Recommended ${formatSuggestedPlaceType(place.type)} · mean nearby score ${Number(place.score).toFixed(3)} · ${Number(place.latitude).toFixed(4)}, ${Number(place.longitude).toFixed(4)}</div></div>`;
}

function getPublicPoiPopupHtml(poi: PublicPoi) {
  return `<div class="poiPopup"><div class="poiPopup__title">${poi.name}</div><div class="poiPopup__meta">${formatSuggestedPlaceType(poi.type)} · ${Number(poi.latitude).toFixed(4)}, ${Number(poi.longitude).toFixed(4)}</div></div>`;
}

function getBaseLocationPopupHtml(baseLocation: { name: string; latitude: number; longitude: number }) {
  return `<div class="poiPopup"><div class="poiPopup__title">${baseLocation.name}</div><div class="poiPopup__meta">Base location · ${Number(baseLocation.latitude).toFixed(4)}, ${Number(baseLocation.longitude).toFixed(4)}</div></div>`;
}

function buildPlannerLocationCollection(args: {
  baseLocation: { name: string; latitude: number; longitude: number } | null;
  suggestedPlaces: SuggestedPlace[];
  itineraryPlaceIds: string[];
  selectedPlaceId: string | null;
  showSuggestedPlaces: boolean;
  poiItems: PublicPoi[];
  poiFilters: PoiFilters;
}): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  const baseCoords = args.baseLocation
    ? getPointCoordinates(args.baseLocation.latitude, args.baseLocation.longitude)
    : null;

  if (args.baseLocation && baseCoords) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: baseCoords,
      },
      properties: {
        id: "__planner_base_location__",
        kind: "base",
        name: args.baseLocation.name,
        markerType: "Base",
        iconName: getPlannerLocationIconName("base"),
        selected: false,
        selectedPulseOn: false,
      } satisfies PlannerLocationFeatureProperties,
    });
  }

  const visibleSuggestedPlaceKeys = new Set<string>();
  const itineraryOrderById = new Map(args.itineraryPlaceIds.map((id, index) => [id, index + 1]));

  if (args.showSuggestedPlaces) {
    for (const place of args.suggestedPlaces) {
      const coords = getPointCoordinates(place.latitude, place.longitude);
      if (!coords) continue;
      visibleSuggestedPlaceKeys.add(getLocationMarkerKey(place));
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: coords,
        },
        properties: {
          id: place.id,
          kind: "suggested",
          name: place.name,
          markerType: place.type,
          iconName: getPlannerLocationIconName("suggested", place.type),
          selected: place.id === args.selectedPlaceId,
          selectedPulseOn: place.id === args.selectedPlaceId,
          itineraryOrder: itineraryOrderById.get(place.id) ?? 0,
          score: place.score,
        } satisfies PlannerLocationFeatureProperties,
      });
    }
  }

  if (hasActivePoiFilter(args.poiFilters)) {
    const seenPoiIds = new Set<string>();
    for (const poi of filterPoisByType(args.poiItems, args.poiFilters)) {
      const coords = getPointCoordinates(poi.latitude, poi.longitude);
      if (!coords) continue;
      if (visibleSuggestedPlaceKeys.has(getLocationMarkerKey(poi))) continue;
      const id = getPublicPoiFeatureId(poi);
      if (seenPoiIds.has(id)) continue;
      seenPoiIds.add(id);
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: coords,
        },
        properties: {
          id,
          kind: "poi",
          name: poi.name,
          markerType: poi.type,
          iconName: getPlannerLocationIconName("poi", poi.type),
          selected: false,
          selectedPulseOn: false,
        } satisfies PlannerLocationFeatureProperties,
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function getGeoJsonSource(map: MapLibreMap, sourceId: string) {
  return map.getSource(sourceId) as { setData: (data: FeatureCollection) => void } | undefined;
}

function upsertGeoJsonSource(map: MapLibreMap, sourceId: string, data: FeatureCollection) {
  const source = getGeoJsonSource(map, sourceId);
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(sourceId, { type: "geojson", data });
}

function buildMaxTravelRadiusCollection(baseLocation: { latitude: number; longitude: number } | null, miles: number | null): FeatureCollection {
  if (!baseLocation || !miles || !Number.isFinite(miles) || miles <= 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const center = getPointCoordinates(baseLocation.latitude, baseLocation.longitude);
  if (!center) return { type: "FeatureCollection", features: [] };

  const [longitude, latitude] = center;
  const kilometers = miles * 1.60934;
  const latRadians = (latitude * Math.PI) / 180;
  const kmPerDegreeLat = 110.574;
  const kmPerDegreeLon = 111.32 * Math.cos(latRadians);
  if (!Number.isFinite(kmPerDegreeLon) || Math.abs(kmPerDegreeLon) < 0.0001) {
    return { type: "FeatureCollection", features: [] };
  }

  const dashCount = 56;
  const dashSweepDegrees = 4.2;
  const gapSweepDegrees = 2.25;
  const dashSteps = 6;
  const dashColors = ["#24A38B", "#6EDAD0"];
  const features: FeatureCollection["features"] = [];

  for (let index = 0; index < dashCount; index += 1) {
    const startAngle = index * (dashSweepDegrees + gapSweepDegrees);
    const endAngle = startAngle + dashSweepDegrees;
    const coordinates: [number, number][] = [];

    for (let step = 0; step <= dashSteps; step += 1) {
      const angleDegrees = startAngle + ((endAngle - startAngle) * step) / dashSteps;
      const angle = (angleDegrees * Math.PI) / 180;
      const latitudeOffset = (kilometers * Math.sin(angle)) / kmPerDegreeLat;
      const longitudeOffset = (kilometers * Math.cos(angle)) / kmPerDegreeLon;
      coordinates.push([longitude + longitudeOffset, latitude + latitudeOffset]);
    }

    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: {
        dashColor: dashColors[index % dashColors.length],
      } satisfies PlannerRadiusFeatureProperties,
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function withPlannerLocationPulse(data: FeatureCollection, pulseOn: boolean): FeatureCollection {
  return {
    ...data,
    features: data.features.map((feature) => {
      const properties = (feature.properties ?? {}) as PlannerLocationFeatureProperties;
      if (!properties.selected) return feature;
      return {
        ...feature,
        properties: {
          ...properties,
          selectedPulseOn: pulseOn,
        },
      };
    }),
  };
}

async function buildPlannerPinImage(spec: PlannerPinSpec) {
  const pixelRatio = 2;
  const width = 64 * pixelRatio;
  const height = 78 * pixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Planner pin canvas context unavailable.");

  const palette =
    spec.variant === "suggested"
      ? {
          fill: "#baf6ee",
          center: "#c9fbf5",
          stroke: "#13d8cb",
          icon: "#07566a",
          glow: "rgba(19,216,203,0.42)",
        }
      : spec.variant === "base"
        ? {
            fill: "#ffffff",
            center: "#f3fbfd",
            stroke: "#158fa2",
            icon: "#0b718d",
            glow: "rgba(21,143,162,0.24)",
          }
        : {
            fill: "#dcedf4",
            center: "#e8f6fb",
            stroke: "#6f8d99",
            icon: "#355763",
            glow: "rgba(53,87,99,0.14)",
          };
  const symbol =
    spec.type === "Park"
      ? { text: "forest", font: "Material Symbols Rounded" }
      : spec.type === "Ferry"
        ? { text: "directions_boat", font: "Material Symbols Outlined" }
        : spec.type === "Base"
          ? { text: "home", font: "Material Symbols Outlined" }
          : { text: "anchor", font: "Material Symbols Outlined" };

  if ("fonts" in document) {
    await document.fonts.load(`24px "${symbol.font}"`);
    await document.fonts.ready;
  }

  ctx.scale(pixelRatio, pixelRatio);

  ctx.fillStyle = palette.glow;
  ctx.beginPath();
  ctx.ellipse(32, 72, 10, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(7,31,58,0.26)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = palette.fill;
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(32, 73);
  ctx.bezierCurveTo(28.5, 64, 13, 48.5, 13, 32.5);
  ctx.bezierCurveTo(13, 19, 21.3, 9, 32, 9);
  ctx.bezierCurveTo(42.7, 9, 51, 19, 51, 32.5);
  ctx.bezierCurveTo(51, 48.5, 35.5, 64, 32, 73);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = palette.center;
  ctx.beginPath();
  ctx.arc(32, 32, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(32, 32, 17.4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = palette.icon;
  ctx.font = `24px "${symbol.font}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(symbol.text, 32, 33);

  return ctx.getImageData(0, 0, width, height);
}

async function ensurePlannerLocationIconImages(map: MapLibreMap) {
  await Promise.all(
    PLANNER_PIN_SPECS.map(async (spec) => {
      if (map.hasImage(spec.id)) return;
      const image = await buildPlannerPinImage(spec);
      if (!map.hasImage(spec.id)) map.addImage(spec.id, image, { pixelRatio: 2 });
    })
  );
}

async function ensurePlannerLocationLayers(map: MapLibreMap, data: FeatureCollection) {
  upsertGeoJsonSource(map, PLANNER_LOCATION_SOURCE_ID, data);

  try {
    await ensurePlannerLocationIconImages(map);
  } catch (error) {
    console.warn("[POI] planner pin images failed to load", error);
  }

  if (!map.getLayer(PLANNER_LOCATION_HALO_LAYER_ID)) {
    map.addLayer({
      id: PLANNER_LOCATION_HALO_LAYER_ID,
      type: "circle",
      source: PLANNER_LOCATION_SOURCE_ID,
      filter: ["==", ["get", "selected"], true],
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "selectedPulseOn"], true],
          60,
          44,
        ],
        "circle-color": "rgba(110, 247, 233, 1)",
        "circle-blur": 1.15,
        "circle-opacity": [
          "case",
          ["==", ["get", "selectedPulseOn"], true],
          0.55,
          0.24,
        ],
        "circle-translate": [0, -25],
      },
    });
  }

  if (!map.getLayer(PLANNER_LOCATION_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: PLANNER_LOCATION_CIRCLE_LAYER_ID,
      type: "circle",
      source: PLANNER_LOCATION_SOURCE_ID,
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "kind"], "poi"],
          18,
          ["==", ["get", "selected"], true],
          27,
          23,
        ],
        "circle-color": "rgba(255, 255, 255, 0.01)",
        "circle-opacity": 0.01,
        "circle-translate": [0, -25],
      },
    });
  }

  if (!map.getLayer(PLANNER_LOCATION_SYMBOL_LAYER_ID)) {
    map.addLayer({
      id: PLANNER_LOCATION_SYMBOL_LAYER_ID,
      type: "symbol",
      source: PLANNER_LOCATION_SOURCE_ID,
      layout: {
        "icon-image": ["get", "iconName"],
        "icon-size": [
          "case",
          ["==", ["get", "selected"], true],
          0.7,
          ["==", ["get", "kind"], "suggested"],
          0.7,
          ["==", ["get", "kind"], "base"],
          0.7,
          0.56,
        ],
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-sort-key": [
          "case",
          ["==", ["get", "kind"], "base"],
          4,
          ["==", ["get", "kind"], "suggested"],
          3,
          1,
        ],
      },
      paint: {
        "icon-opacity": [
          "case",
          ["==", ["get", "selected"], true],
          1,
          1,
        ],
      },
    });
  }

  if (!map.getLayer(PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID)) {
    map.addLayer({
      id: PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID,
      type: "circle",
      source: PLANNER_LOCATION_SOURCE_ID,
      filter: [">", ["get", "itineraryOrder"], 0],
      paint: {
        "circle-radius": 10,
        "circle-color": "rgba(24, 120, 136, 0.96)",
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255, 255, 255, 0.96)",
        "circle-translate": [15, -47],
      },
    });
  }

  if (!map.getLayer(PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID)) {
    map.addLayer({
      id: PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID,
      type: "symbol",
      source: PLANNER_LOCATION_SOURCE_ID,
      filter: [">", ["get", "itineraryOrder"], 0],
      layout: {
        "text-field": ["to-string", ["get", "itineraryOrder"]],
        "text-size": 11,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(24, 120, 136, 0.01)",
        "text-halo-width": 0.5,
        "text-translate": [15, -47],
      },
    });
  }

  bringPlannerLocationLayersToFront(map);
}

function bringPlannerLocationLayersToFront(map: MapLibreMap) {
  if (map.getLayer(PLANNER_MAX_TRAVEL_LAYER_ID)) map.moveLayer(PLANNER_MAX_TRAVEL_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_HALO_LAYER_ID)) map.moveLayer(PLANNER_LOCATION_HALO_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_CIRCLE_LAYER_ID)) map.moveLayer(PLANNER_LOCATION_CIRCLE_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_SYMBOL_LAYER_ID)) map.moveLayer(PLANNER_LOCATION_SYMBOL_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID)) map.moveLayer(PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID)) map.moveLayer(PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID);
}


function normalizeMarkerId(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "place"
  );
}

function getLocationMarkerKey(place: { name: string; latitude: number; longitude: number }) {
  return `${normalizeMarkerId(place.name)}-${Number(place.latitude).toFixed(4)}-${Number(place.longitude).toFixed(4)}`;
}

function getPublicPoiFeatureId(poi: PublicPoi) {
  return `poi-${getLocationMarkerKey(poi)}`;
}

function formatSuggestedPlaceType(type: SuggestedPlace["type"]) {
  if (type === "Ferry") return "Ferry terminal";
  return type;
}

export const ForecastMap = forwardRef<ForecastMapHandle, ForecastMapProps>(function ForecastMap(
  {
    darkMode,
    showMapControls = true,
    showLegendControl = true,
    colorNoData = false,
    paletteId,
    surfaceMode,
    resolution,
    poiFilters,
    modelId,
    periods,
    selectedWeek,
    selectedWeekYear,
    hotspotsEnabled,
    hotspotMode,
    hotspotPercentile,
    expectedActivityHotspotCellCount,
    onHotspotsEnabledChange,
    onGridCellCount,
    onGridCellSelect,
    onGridCellExpand,
    forecastPath,
    fallbackForecastPath,
    colorScaleValues,
    useExternalColorScale = false,
    externalValues,
    forecastOverlayEnabled = true,
    pulseAllGridCells = false,
    mapModeLabel,
    onFatalDataError,
    suggestedPlaces = [],
    itineraryPlaceIds = [],
    selectedPlaceId = null,
    pulseSelectedPlaceMarker = false,
    onPlaceSelect,
    showTripHotspotMarkers = false,
    baseLocation = null,
    maxTravelDistanceMiles = null,
    sidebarOffsetPx = 0,
  }: ForecastMapProps,
  ref
) {
  trackRender("ForecastMap", { resolution, modelId, darkMode });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleUrl = useMemo(() => (darkMode ? DARK_STYLE : VOYAGER_STYLE), [darkMode]);
  const sidebarPaddingRight = useMemo(
    () => (sidebarOffsetPx > 0 ? Math.max(0, Math.round(sidebarOffsetPx * 0.72)) : 0),
    [sidebarOffsetPx]
  );
  const activePalette = useMemo(() => getPaletteOrDefault(paletteId), [paletteId]);
  const gridBorderColor = useMemo(
    () =>
      activePalette.id === "red_atlas"
        ? darkMode
          ? "rgba(92,32,42,0.28)"
          : "rgba(116,42,48,0.2)"
        : darkMode
          ? "rgba(8,18,44,0.22)"
          : "rgba(20,42,78,0.16)",
    [activePalette.id, darkMode]
  );
  const gridLineAccentColor = useMemo(
    () => (activePalette.id === "red_atlas" ? "rgba(176,72,66,0.38)" : "rgba(96,186,200,0.34)"),
    [activePalette.id]
  );

  const overlayRef = useRef<FeatureCollection | null>(null);
  const fillExprRef = useRef<FillColorSpec | null>(null);
  const hotspotThresholdRef = useRef<number | undefined>(undefined);
  const modeledHotspotThresholdRef = useRef<number | undefined>(undefined);
  const expectedActivityHotspotCellCountRef = useRef<number | null>(
    coerceExpectedActivityHotspotCellCount(expectedActivityHotspotCellCount)
  );
  const valuesByCellRef = useRef<Record<string, number>>({});
  const colorScaleValuesRef = useRef<Record<string, number> | undefined>(colorScaleValues);
  const sortedValuesDescRef = useRef<number[]>([]);
  const totalCellsRef = useRef(0);
  const shimmerThresholdRef = useRef<number | undefined>(undefined);
  const legendSpecRef = useRef<HeatScale | null>(null);
  const styleUrlRef = useRef(styleUrl);
  const activeStyleUrlRef = useRef(styleUrl);
  const mapReadyRef = useRef(false);
  const hotspotsOnlyRef = useRef(hotspotsEnabled);
  const lastGridLayerSignatureRef = useRef<string | null>(null);
  const hoveredCellRef = useRef<string | null>(null);
  const periodsRef = useRef<Period[]>(periods);
  const modelIdRef = useRef(modelId);
  const resolutionRef = useRef(resolution);
  const selectedWeekRef = useRef(selectedWeek);
  const selectedWeekYearRef = useRef(selectedWeekYear);
  const sparklineCacheRef = useRef<Map<string, SparklineSeries>>(new Map());
  const forecastPeriodCacheRef = useRef<Map<string, Promise<Record<string, number>>>>(new Map());
  const sightingsWeekCacheRef = useRef<Map<string, Promise<LngLat[]>>>(new Map());
  const sparkPopupRef = useRef<maplibregl.Popup | null>(null);
  const sparkRequestIdRef = useRef(0);
  const onGridCellSelectRef = useRef(onGridCellSelect);
  const onGridCellExpandRef = useRef(onGridCellExpand);

  const [legendSpec, setLegendSpec] = useState<HeatScale | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [poiItems, setPoiItems] = useState<PublicPoi[]>([]);

  const hasForecastLegend = legendSpec !== null;
  const poiLayerActive = hasActivePoiFilter(poiFilters);

  const resolveHotspotThreshold = useCallback(() => {
    const modeled = modeledHotspotThresholdRef.current ?? hotspotThresholdRef.current;
    if (hotspotMode !== "custom") {
      const values = sortedValuesDescRef.current;
      const modeledCount = expectedActivityHotspotCellCountRef.current;
      if (values.length > 0 && modeledCount !== null && Number.isFinite(modeledCount) && modeledCount > 0) {
        return values[Math.max(0, Math.min(values.length - 1, Math.round(modeledCount) - 1))] ?? modeled;
      }
      return modeled;
    }
    const values = sortedValuesDescRef.current;
    const total = totalCellsRef.current;
    if (values.length === 0 || total === 0) return modeled;
    const count = Math.max(1, Math.round((total * Math.min(Math.max(hotspotPercentile, 0), 100)) / 100));
    return values[Math.max(0, Math.min(values.length - 1, count - 1))] ?? modeled;
  }, [hotspotMode, hotspotPercentile]);

  const renderForecastLayer = useCallback(
    (map: MapLibreMap) => {
      if (!overlayRef.current) return;

      const threshold = resolveHotspotThreshold();
      const hotspots = hotspotsOnlyRef.current;
      const zeroModeledHotspots =
        hotspots &&
        hotspotMode !== "custom" &&
        expectedActivityHotspotCellCountRef.current !== null &&
        Number.isFinite(expectedActivityHotspotCellCountRef.current) &&
        expectedActivityHotspotCellCountRef.current <= 0;
      const hotspotOverlayVisible = hotspots && !zeroModeledHotspots;
      const scale = legendSpecRef.current;

      const fillExpr: FillColorSpec | undefined =
        hotspotOverlayVisible && threshold !== undefined
          ? (buildHotspotOnlyExpr(threshold) as unknown as FillColorSpec)
          : scale
            ? (buildFillExprFromScale(scale) as unknown as FillColorSpec)
            : fillExprRef.current ?? undefined;

      if (fillExpr) fillExprRef.current = fillExpr;

      const layerSignature = createGridLayerBuildSignature({
        data: overlayRef.current,
        fillColorExpr: fillExpr,
        hotspotThreshold: threshold,
        hotspotsVisible: hotspotOverlayVisible,
        shimmerThreshold: shimmerThresholdRef.current,
        borderColor: gridBorderColor,
      });

      if (lastGridLayerSignatureRef.current !== layerSignature) {
        lastGridLayerSignatureRef.current = layerSignature;
        trackLayerRebuild("grid", {
          resolution,
          hotspotOverlayVisible,
          hasThreshold: threshold !== undefined,
        });
        addGridOverlay(
          map,
          overlayRef.current,
          fillExpr,
          threshold,
          hotspotOverlayVisible,
          shimmerThresholdRef.current,
          gridBorderColor,
          gridLineAccentColor
        );
      }

      addSurfaceOverlay(map, overlayRef.current, activePalette.colors, scale);

      if (hotspots) {
        if (surfaceMode === "surface") {
          setGridBaseVisibility(map, false);
          setSurfaceVisibility(map, true);
          setHotspotVisibility(map, hotspotOverlayVisible);
        } else if (hotspotOverlayVisible) {
          setGridBaseVisibility(map, false);
          setSurfaceVisibility(map, false);
          setHotspotVisibility(map, true);
        } else {
          setGridVisibility(map, true);
          setSurfaceVisibility(map, false);
          setHotspotVisibility(map, false);
        }
      } else if (surfaceMode === "surface") {
        setGridBaseVisibility(map, false);
        setSurfaceVisibility(map, true);
        setHotspotVisibility(map, false);
      } else {
        setGridVisibility(map, true);
        setSurfaceVisibility(map, false);
        setHotspotVisibility(map, false);
      }

      setGridHoverCell(map, hoveredCellRef.current);
      bringPlannerLocationLayersToFront(map);
    },
    [
      activePalette.colors,
      darkMode,
      gridBorderColor,
      gridLineAccentColor,
      hotspotMode,
      resolution,
      resolveHotspotThreshold,
      surfaceMode,
    ]
  );

  const scheduleForecastRender = useCallback(
    (map: MapLibreMap, isCancelled?: () => boolean) => {
      let attempts = 0;
      let timeoutId: number | null = null;
      let done = false;

      const cleanup = () => {
        map.off("styledata", tryRender);
        map.off("load", tryRender);
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const tryRender = () => {
        if (done) return;
        if (isCancelled?.()) {
          done = true;
          cleanup();
          return;
        }
        if (!overlayRef.current || !mapRef.current || !map.isStyleLoaded()) return;
        try {
          renderForecastLayer(map);
          done = true;
          cleanup();
        } catch {
          // Retry while style/data settles.
        }
      };

      const poll = () => {
        if (done) return;
        tryRender();
        if (done) return;
        attempts += 1;
        if (attempts > 300) {
          cleanup();
          return;
        }
        timeoutId = window.setTimeout(poll, 60);
      };

      map.on("styledata", tryRender);
      map.on("load", tryRender);
      poll();
    },
    [renderForecastLayer]
  );

  const requestForecastRender = useCallback(
    (map: MapLibreMap) => {
      if (!overlayRef.current || !mapRef.current || mapRef.current !== map) return;
      if (!map.isStyleLoaded()) {
        scheduleForecastRender(map);
        return;
      }
      try {
        renderForecastLayer(map);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("style") || message.toLowerCase().includes("loading")) {
          scheduleForecastRender(map);
          return;
        }
        throw error;
      }
    },
    [renderForecastLayer, scheduleForecastRender]
  );

  const scheduleForecastRenderRef = useRef(scheduleForecastRender);

  useEffect(() => {
    scheduleForecastRenderRef.current = scheduleForecastRender;
  }, [scheduleForecastRender]);

  const captureMapSnapshot = useCallback(
    async ({
      center,
      zoom,
      width,
      height,
      includeForecastOverlay = true,
    }: {
      center?: LngLat;
      zoom?: number;
      width?: number;
      height?: number;
      includeForecastOverlay?: boolean;
    } = {}) => {
      const sourceMap = mapRef.current;
      const sourceCanvas = sourceMap?.getCanvas();
      const overlay = overlayRef.current;
      if (!sourceMap || !sourceCanvas) return null;
      if (includeForecastOverlay && !overlay) return null;

      type MapOptionsPatched = maplibregl.MapOptions & {
        preserveDrawingBuffer?: boolean;
        cooperativeGestures?: boolean;
      };

      const container = document.createElement("div");
      const snapshotWidth = Math.max(
        1,
        width ?? sourceCanvas.clientWidth ?? containerRef.current?.clientWidth ?? 1024
      );
      const snapshotHeight = Math.max(
        1,
        height ?? sourceCanvas.clientHeight ?? containerRef.current?.clientHeight ?? 768
      );
      container.style.cssText = `position:fixed;left:-10000px;top:0;width:${snapshotWidth}px;height:${snapshotHeight}px;pointer-events:none;opacity:0;`;
      document.body.appendChild(container);

      let tempMap: MapLibreMap | null = null;
      try {
      const sourceCenter = sourceMap.getCenter();
      tempMap = new maplibregl.Map({
        container,
        style: styleUrlRef.current,
        center: center ?? [sourceCenter.lng, sourceCenter.lat],
          zoom: zoom ?? sourceMap.getZoom(),
          bearing: sourceMap.getBearing(),
          pitch: sourceMap.getPitch(),
          attributionControl: false,
          interactive: false,
          preserveDrawingBuffer: true,
          cooperativeGestures: false,
        } as MapOptionsPatched);

        await new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => reject(new Error("Snapshot map load timed out")), 3500);
          tempMap?.once("load", () => {
            window.clearTimeout(timeoutId);
            resolve();
          });
          tempMap?.once("error", (event: { error?: unknown }) => {
            window.clearTimeout(timeoutId);
            reject(event.error instanceof Error ? event.error : new Error("Snapshot map failed to load"));
          });
        });

        safeApplyBasemapVisualTuning(tempMap, styleUrlRef.current === DARK_STYLE);
        if (includeForecastOverlay && overlay) {
          addGridOverlay(
            tempMap,
            overlay,
            fillExprRef.current ?? undefined,
            resolveHotspotThreshold(),
            hotspotsOnlyRef.current,
            shimmerThresholdRef.current,
            gridBorderColor,
            gridLineAccentColor
          );
          if (hotspotsOnlyRef.current) {
            setGridBaseVisibility(tempMap, false);
            setHotspotVisibility(tempMap, true);
          } else {
            setGridVisibility(tempMap, true);
            setHotspotVisibility(tempMap, false);
          }
        }

        tempMap.resize();
        const rendered = await waitForMapRender(tempMap);
        if (!rendered) return null;

        return await new Promise<Blob | null>((resolve) => {
          try {
            tempMap?.getCanvas().toBlob((blob) => resolve(blob), "image/png");
          } catch {
            resolve(null);
          }
        });
      } catch {
        return null;
      } finally {
        tempMap?.remove();
        container.remove();
      }
    },
    [gridBorderColor, gridLineAccentColor, resolveHotspotThreshold]
  );

  const captureCurrentMapSnapshot = useCallback(async () => {
    return captureMapSnapshot();
  }, [captureMapSnapshot]);

  const fitLocations = useCallback(
    (locations: LngLat[], options?: { padding?: number; maxZoom?: number }) => {
      const map = mapRef.current;
      if (!map || locations.length === 0) return;

      if (locations.length === 1) {
        map.flyTo({
          center: locations[0],
          zoom: options?.maxZoom ?? 11.2,
          essential: true,
          duration: 900,
        });
        return;
      }

      const bounds = locations.reduce(
        (acc, location) => acc.extend(location),
        new maplibregl.LngLatBounds(locations[0], locations[0])
      );

      map.fitBounds(bounds, {
        padding: options?.padding ?? 88,
        maxZoom: options?.maxZoom ?? 10.8,
        duration: 900,
        essential: true,
      });
    },
    []
  );

  const capturePlacePreview = useCallback(
    async ({
      center,
      zoom = 11.8,
      width = 720,
      height = 320,
    }: {
      center: LngLat;
      zoom?: number;
      width?: number;
      height?: number;
    }) =>
      captureMapSnapshot({
        center,
        zoom,
        width,
        height,
        includeForecastOverlay: true,
      }),
    [captureMapSnapshot]
  );

  useImperativeHandle(
    ref,
    () => ({
      captureSnapshot: captureCurrentMapSnapshot,
      capturePlacePreview,
      fitLocations,
    }),
    [captureCurrentMapSnapshot, capturePlacePreview, fitLocations]
  );

  useForecastData({
    resolution,
    mapReady,
    forecastPath,
    fallbackForecastPath,
    modelId,
    externalValues,
    forecastOverlayEnabled,
    pulseAllGridCells,
    onGridCellCount,
    useExternalColorScale,
    colorNoData,
    paletteColors: activePalette.colors,
    mapRef,
    overlayRef,
    fillExprRef,
    legendSpecRef,
    hotspotThresholdRef,
    modeledHotspotThresholdRef,
    valuesByCellRef,
    colorScaleValuesRef,
    sortedValuesDescRef,
    totalCellsRef,
    shimmerThresholdRef,
    setLegendSpec,
    scheduleForecastRender,
    onFatalDataError,
  });

  useEffect(() => {
    styleUrlRef.current = styleUrl;
    activeStyleUrlRef.current = styleUrl;
  }, [styleUrl]);

  useEffect(() => {
    colorScaleValuesRef.current = colorScaleValues;
  }, [colorScaleValues]);

  useEffect(() => {
    legendSpecRef.current = legendSpec;
  }, [legendSpec]);

  useEffect(() => {
    mapReadyRef.current = mapReady;
  }, [mapReady]);

  useEffect(() => {
    periodsRef.current = periods;
    modelIdRef.current = modelId;
    resolutionRef.current = resolution;
    selectedWeekRef.current = selectedWeek;
    selectedWeekYearRef.current = selectedWeekYear;
    onGridCellSelectRef.current = onGridCellSelect;
    onGridCellExpandRef.current = onGridCellExpand;
  }, [periods, modelId, resolution, selectedWeek, selectedWeekYear, onGridCellSelect, onGridCellExpand]);

  useEffect(() => {
    hotspotsOnlyRef.current = hotspotsEnabled;
  }, [hotspotsEnabled]);

  useEffect(() => {
    expectedActivityHotspotCellCountRef.current =
      coerceExpectedActivityHotspotCellCount(expectedActivityHotspotCellCount);
  }, [expectedActivityHotspotCellCount]);

  useEffect(() => {
    lastGridLayerSignatureRef.current = null;
  }, [resolution, modelId, forecastPath, fallbackForecastPath, externalValues, pulseAllGridCells, activePalette]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    type MapOptionsPatched = maplibregl.MapOptions & {
      cooperativeGestures?: boolean;
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      cooperativeGestures: false,
    } as MapOptionsPatched);

    map.on("error", (e: { error?: unknown }) => console.error("[MapLibre] error:", e?.error || e));

    const { handleSparklineClick, handleMouseEnter, handleMouseMove, handleMouseLeave } =
      createGridInteractionHandlers({
        map,
        overlayRef,
        periodsRef,
        modelIdRef,
        resolutionRef,
        selectedWeekRef,
        selectedWeekYearRef,
        sparklineCacheRef,
        forecastPeriodCacheRef,
        sightingsWeekCacheRef,
        sparkPopupRef,
        sparkRequestIdRef,
        hoveredCellRef,
        onGridCellSelect: (h3) => onGridCellSelectRef.current?.(h3),
        onGridCellExpand: (request) => onGridCellExpandRef.current?.(request),
        enableSparklinePopupRef: { current: true },
      });

    map.on("click", "grid-fill", handleSparklineClick);
    map.on("mouseenter", "grid-fill", handleMouseEnter);
    map.on("mousemove", "grid-fill", handleMouseMove);
    map.on("mouseleave", "grid-fill", handleMouseLeave);

    map.once("load", () => {
      lastGridLayerSignatureRef.current = null;
      mapReadyRef.current = true;
      setMapReady(true);
      safeApplyBasemapVisualTuning(map, styleUrlRef.current === DARK_STYLE);
      map.resize();
      scheduleForecastRenderRef.current(map);
    });

    const handleStyleData = () => {
      safeApplyBasemapVisualTuning(map, styleUrlRef.current === DARK_STYLE);
      if (!mapReadyRef.current && map.isStyleLoaded()) {
        mapReadyRef.current = true;
        setMapReady(true);
        map.resize();
      }
    };
    map.on("styledata", handleStyleData);
    mapRef.current = map;

    const raf = window.requestAnimationFrame(() => map.resize());
    const t1 = window.setTimeout(() => map.resize(), 50);
    const t2 = window.setTimeout(() => map.resize(), 250);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      map.off("click", "grid-fill", handleSparklineClick);
      map.off("mouseenter", "grid-fill", handleMouseEnter);
      map.off("mousemove", "grid-fill", handleMouseMove);
      map.off("mouseleave", "grid-fill", handleMouseLeave);
      map.off("styledata", handleStyleData);
      sparkPopupRef.current?.remove();
      sparkPopupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  useHotspotAnimation({ mapReady, mapRef, hotspotsOnlyRef, resolution, forecastPath });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || activeStyleUrlRef.current === styleUrl) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();
    map.setStyle(styleUrl);
    activeStyleUrlRef.current = styleUrl;
    lastGridLayerSignatureRef.current = null;
    const restore = () => {
      if (!mapRef.current || mapRef.current !== map || !map.isStyleLoaded()) {
        window.requestAnimationFrame(restore);
        return;
      }
      map.jumpTo({ center, zoom, bearing, pitch });
      safeApplyBasemapVisualTuning(map, styleUrl === DARK_STYLE);
      map.resize();
      scheduleForecastRender(map);
    };
    window.requestAnimationFrame(restore);
  }, [mapReady, scheduleForecastRender, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || overlayRef.current == null) return;
    const values = valuesByCellRef.current ?? {};
    const scaleSourceValues =
      useExternalColorScale && colorScaleValuesRef.current && Object.keys(colorScaleValuesRef.current).length > 0
        ? colorScaleValuesRef.current
        : values;
    const { fillColorExpr, scale } = buildAutoColorExprFromValues(
      scaleSourceValues,
      activePalette.colors,
      ["get", "prob"],
      colorNoData
    );
    fillExprRef.current = fillColorExpr as unknown as FillColorSpec;
    legendSpecRef.current = scale;
    setLegendSpec(scale);
    requestForecastRender(map);
  }, [activePalette, colorNoData, colorScaleValues, mapReady, requestForecastRender, useExternalColorScale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !overlayRef.current) return;
    requestForecastRender(map);
  }, [hotspotsEnabled, legendSpec, requestForecastRender]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || surfaceMode !== "surface") return;

    const handleSurfaceViewportChange = () => {
      if (!overlayRef.current || !mapRef.current || mapRef.current !== map) return;
      requestForecastRender(map);
    };

    map.on("moveend", handleSurfaceViewportChange);
    map.on("zoomend", handleSurfaceViewportChange);
    return () => {
      map.off("moveend", handleSurfaceViewportChange);
      map.off("zoomend", handleSurfaceViewportChange);
    };
  }, [mapReady, requestForecastRender, surfaceMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const zeroModeledHotspots =
      hotspotMode === "modeled" &&
      coerceExpectedActivityHotspotCellCount(expectedActivityHotspotCellCount) === 0;

    if (!hasForecastLegend) {
      setGridCoreLayerVisibility(map, true);
      setGridVisibility(map, true);
      setHotspotVisibility(map, false);
      return;
    }

    setGridCoreLayerVisibility(map, true);
    if (hotspotsEnabled) {
      setGridBaseVisibility(map, false);
      setHotspotVisibility(map, !zeroModeledHotspots);
      if (zeroModeledHotspots) setGridVisibility(map, false);
    } else {
      setGridVisibility(map, true);
      setHotspotVisibility(map, false);
    }
  }, [expectedActivityHotspotCellCount, hasForecastLegend, hotspotMode, hotspotsEnabled, mapReady]);

  useEffect(() => {
    if (hasForecastLegend) return;
    if (hotspotsEnabled) onHotspotsEnabledChange(false);
  }, [hasForecastLegend, hotspotsEnabled, onHotspotsEnabledChange]);

  useEffect(() => {
    if (!poiLayerActive) {
      setPoiItems([]);
      return;
    }

    let cancelled = false;
    loadPoiData()
      .then((items) => {
        if (!cancelled) setPoiItems(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setPoiItems([]);
          console.warn("[POI] failed to load places_of_interest.json", err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [poiLayerActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let cancelled = false;
    let removeHandlers: (() => void) | null = null;
    let pulseIntervalId: number | null = null;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

    const baseData = buildPlannerLocationCollection({
      baseLocation,
      suggestedPlaces,
      itineraryPlaceIds,
      selectedPlaceId,
      showSuggestedPlaces: showTripHotspotMarkers,
      poiItems,
      poiFilters,
    });

    const setupPlannerLocationLayer = async () => {
      if (!map.isStyleLoaded()) {
        await new Promise<void>((resolve) => {
          const waitForStyle = () => {
            if (map.isStyleLoaded()) {
              resolve();
              return;
            }
            map.once("styledata", waitForStyle);
          };
          waitForStyle();
        });
      }
      if (cancelled || mapRef.current !== map) return;

      await ensurePlannerLocationLayers(map, baseData);
      if (cancelled || mapRef.current !== map) return;

      if (selectedPlaceId && pulseSelectedPlaceMarker) {
        let pulseOn = true;
        const source = getGeoJsonSource(map, PLANNER_LOCATION_SOURCE_ID);
        source?.setData(withPlannerLocationPulse(baseData, pulseOn));
        pulseIntervalId = window.setInterval(() => {
          pulseOn = !pulseOn;
          source?.setData(withPlannerLocationPulse(baseData, pulseOn));
        }, 520);
      }

      const placesById = new Map(suggestedPlaces.map((place) => [place.id, place]));
      const poisById = new Map(poiItems.map((poi) => [getPublicPoiFeatureId(poi), poi]));

      const popupHtmlForFeature = (feature: NonNullable<MapLayerMouseEvent["features"]>[number]) => {
        const properties = feature.properties ?? {};
        const id = typeof properties.id === "string" ? properties.id : null;
        const kind = typeof properties.kind === "string" ? properties.kind : null;
        if (id && placesById.has(id)) return getSuggestedPlacePopupHtml(placesById.get(id)!);
        if (id && kind === "poi" && poisById.has(id)) return getPublicPoiPopupHtml(poisById.get(id)!);
        if (kind === "base" && baseLocation) return getBaseLocationPopupHtml(baseLocation);
        return "";
      };

      const handlePlannerLocationClick = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry?.type !== "Point") return;
        const id = typeof feature.properties?.id === "string" ? feature.properties.id : null;
        const place = id ? placesById.get(id) : null;
        event.originalEvent.stopPropagation();
        if (place) {
          onPlaceSelect?.(place);
          return;
        }
        const html = popupHtmlForFeature(feature);
        if (!html) return;
        popup.setLngLat(feature.geometry.coordinates as [number, number]).setHTML(html).addTo(map);
      };

      const handlePlannerLocationMouseEnter = () => {
        map.getCanvas().style.cursor = "pointer";
      };

      const handlePlannerLocationMouseMove = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry?.type !== "Point") return;
        const html = popupHtmlForFeature(feature);
        if (!html) return;
        popup.setLngLat(feature.geometry.coordinates as [number, number]).setHTML(html).addTo(map);
      };

      const handlePlannerLocationMouseLeave = () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      };

      map.on("click", PLANNER_LOCATION_CIRCLE_LAYER_ID, handlePlannerLocationClick);
      map.on("click", PLANNER_LOCATION_SYMBOL_LAYER_ID, handlePlannerLocationClick);
      map.on("mouseenter", PLANNER_LOCATION_CIRCLE_LAYER_ID, handlePlannerLocationMouseEnter);
      map.on("mousemove", PLANNER_LOCATION_CIRCLE_LAYER_ID, handlePlannerLocationMouseMove);
      map.on("mouseleave", PLANNER_LOCATION_CIRCLE_LAYER_ID, handlePlannerLocationMouseLeave);
      map.on("mouseenter", PLANNER_LOCATION_SYMBOL_LAYER_ID, handlePlannerLocationMouseEnter);
      map.on("mousemove", PLANNER_LOCATION_SYMBOL_LAYER_ID, handlePlannerLocationMouseMove);
      map.on("mouseleave", PLANNER_LOCATION_SYMBOL_LAYER_ID, handlePlannerLocationMouseLeave);

      removeHandlers = () => {
        if (pulseIntervalId !== null) {
          window.clearInterval(pulseIntervalId);
          pulseIntervalId = null;
        }
        map.off("click", PLANNER_LOCATION_CIRCLE_LAYER_ID, handlePlannerLocationClick);
        map.off("click", PLANNER_LOCATION_SYMBOL_LAYER_ID, handlePlannerLocationClick);
        map.off("mouseenter", PLANNER_LOCATION_CIRCLE_LAYER_ID, handlePlannerLocationMouseEnter);
        map.off("mousemove", PLANNER_LOCATION_CIRCLE_LAYER_ID, handlePlannerLocationMouseMove);
        map.off("mouseleave", PLANNER_LOCATION_CIRCLE_LAYER_ID, handlePlannerLocationMouseLeave);
        map.off("mouseenter", PLANNER_LOCATION_SYMBOL_LAYER_ID, handlePlannerLocationMouseEnter);
        map.off("mousemove", PLANNER_LOCATION_SYMBOL_LAYER_ID, handlePlannerLocationMouseMove);
        map.off("mouseleave", PLANNER_LOCATION_SYMBOL_LAYER_ID, handlePlannerLocationMouseLeave);
        popup.remove();
      };
    };

    void setupPlannerLocationLayer();

    return () => {
      cancelled = true;
      if (pulseIntervalId !== null) {
        window.clearInterval(pulseIntervalId);
      }
      removeHandlers?.();
      popup.remove();
    };
  }, [baseLocation, itineraryPlaceIds, mapReady, onPlaceSelect, poiFilters, poiItems, pulseSelectedPlaceMarker, selectedPlaceId, showTripHotspotMarkers, styleUrl, suggestedPlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const data = buildMaxTravelRadiusCollection(baseLocation, maxTravelDistanceMiles);
    upsertGeoJsonSource(map, PLANNER_MAX_TRAVEL_SOURCE_ID, data);

    if (!map.getLayer(PLANNER_MAX_TRAVEL_LAYER_ID)) {
      map.addLayer({
        id: PLANNER_MAX_TRAVEL_LAYER_ID,
        type: "line",
        source: PLANNER_MAX_TRAVEL_SOURCE_ID,
        paint: {
          "line-color": ["coalesce", ["get", "dashColor"], "#24A38B"],
          "line-width": 3,
          "line-opacity": 0.94,
          "line-blur": 0.2,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });
    }

    bringPlannerLocationLayersToFront(map);
  }, [baseLocation, mapReady, maxTravelDistanceMiles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedPlaceId) return;
    const selected = suggestedPlaces.find((place) => place.id === selectedPlaceId);
    if (!selected) return;
    const center = getPointCoordinates(selected.latitude, selected.longitude);
    if (!center) return;
    map.flyTo({
      center,
      zoom: Math.max(map.getZoom(), 11),
      duration: 850,
      essential: true,
      padding: { top: 0, right: sidebarPaddingRight, bottom: 0, left: 0 },
    });
  }, [mapReady, selectedPlaceId, sidebarPaddingRight, suggestedPlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({
      center: map.getCenter(),
      duration: 0,
      padding: { top: 0, right: sidebarPaddingRight, bottom: 0, left: 0 },
    });
  }, [mapReady, sidebarPaddingRight]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`mapStage${pulseAllGridCells ? " mapStage--tripLoading" : ""}`}>
      <div ref={containerRef} className="map" data-tour="map-canvas" />
      {pulseAllGridCells && (
        <div className="mapStage__tripLoading" aria-live="polite">
          <span className="mapStage__tripLoadingIcon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>{mapModeLabel ?? "Choose dates to build a seasonal occurrence map"}</span>
        </div>
      )}
      {showMapControls ? (
        <MapControls
          hasForecastLegend={showLegendControl && hasForecastLegend}
          legendOpen={showLegendControl && legendOpen}
          legendSpec={legendSpec}
          onLegendToggle={() => setLegendOpen((value) => !value)}
          onZoomIn={() => mapRef.current?.zoomIn({ duration: 180 })}
          onZoomOut={() => mapRef.current?.zoomOut({ duration: 180 })}
        />
      ) : null}
    </div>
  );
});
