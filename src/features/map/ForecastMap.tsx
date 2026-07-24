import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import maplibregl, {
  Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import "../../shared/styles/map.css";
import type { Period } from "../../shared/data/periods";
import {
  addGridOverlay,
  addGeoTiffSurfaceOverlay,
  addRasterTileSurfaceOverlay,
  addWeightedGeoTiffSurfaceOverlay,
  addSurfaceOverlay,
  setGridBaseVisibility,
  setGridCoreLayerVisibility,
  setGridHoverCell,
  setGridVisibility,
  setHotspotVisibility,
  setSurfaceVisibility,
  type GridVisualStyle,
} from "../../shared/geo/gridOverlay";
import {
  buildAutoColorExprFromValues,
  buildFillExprFromScale,
  buildHotspotOnlyExpr,
} from "../../shared/geo/colorScale";
import type { HeatScale } from "../../shared/geo/colorScale";
import { getPaletteOrDefault } from "../../shared/geo/palettes";
import { trackLayerRebuild, trackRender } from "../../shared/debug/perf";
import { MapControls } from "./MapControls";
import { createGridInteractionHandlers } from "./MapInteractions";
import {
  applyBasemapVisualTuning,
  createGridLayerBuildSignature,
  DARK_RASTER_STYLE,
  DARK_STYLE,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  VOYAGER_RASTER_STYLE,
  VOYAGER_STYLE,
} from "./buildLayers";
import { useForecastData } from "./useForecastData";
import { useHotspotAnimation } from "./useHotspotAnimation";
import type {
  FillColorSpec,
  ForecastMapHandle,
  ForecastMapProps,
  LngLat,
  MapViewportPadding,
  SparklineSeries,
} from "./types";
import {
  filterPoisByType,
  hasActivePoiFilter,
  loadPoiData,
  type PoiFilters,
  type PublicPoi,
} from "../locations/poiData";
import type { SuggestedPlace, WebcamSite } from "../locations/types";
import type { OrcasoundHydrophone } from "../../shared/data/orcasoundHydrophones";

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

function safeApplyBasemapVisualTuning(
  map: MapLibreMap,
  isDarkBasemap: boolean,
) {
  try {
    const style = map.getStyle();
    if (!style || !Array.isArray(style.layers) || style.layers.length === 0)
      return false;
    applyBasemapVisualTuning(map, isDarkBasemap);
    return true;
  } catch {
    return false;
  }
}

function coerceExpectedActivityHotspotCellCount(
  value: number | null,
): number | null {
  return value === null || !Number.isFinite(value)
    ? null
    : Math.max(0, Math.round(value));
}

function mapMotionDuration(duration: number) {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : duration;
}

// Whale pulse artwork is intentionally kept here for the future aggregate-bubble pass.
export const FUTURE_WHALE_TAIL_SVG = `<svg class="poiMarker__whaleTailIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" focusable="false"><path d="M29 53c2.1-5 2.6-9.1 2.1-12.3-.4-2.5-1.9-4.2-4.6-5.2-3.1-1.1-6.3-1.9-9.1-3.2-6-2.8-10-7.2-11.2-14.8 4.8 2.1 9 3.3 13 3.7 4.4.4 8.4.1 11.6 2.7 1 .8 1.8 1.8 2.3 3 .5-1.2 1.3-2.2 2.3-3 3.2-2.6 7.2-2.3 11.6-2.7 4-.4 8.2-1.6 13-3.7-1.2 7.6-5.2 12-11.2 14.8-2.8 1.3-6 2.1-9.1 3.2-2.7 1-4.2 2.7-4.6 5.2-.5 3.2 0 7.3 2.1 12.3H29Z" fill="currentColor"/></svg>`;

const PLANNER_LOCATION_SOURCE_ID = "planner-location-points";
const PLANNER_LOCATION_HALO_LAYER_ID = "planner-location-points-halo";
const PLANNER_LOCATION_CIRCLE_LAYER_ID = "planner-location-points-circle";
const PLANNER_LOCATION_SYMBOL_LAYER_ID = "planner-location-points-symbol";
const PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID =
  "planner-location-points-itinerary-badge";
const PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID =
  "planner-location-points-itinerary-text";
const PLANNER_MAX_TRAVEL_SOURCE_ID = "planner-max-travel-radius";
const PLANNER_MAX_TRAVEL_LAYER_ID = "planner-max-travel-radius-line";

type PlannerLocationKind =
  "base" | "suggested" | "poi" | "hydrophone" | "camera";
type PlannerLocationType =
  SuggestedPlace["type"] | PublicPoi["type"] | "Base" | "Hydrophone" | "Camera";

type PlannerLocationFeatureProperties = {
  id: string;
  kind: PlannerLocationKind;
  name: string;
  markerType: string;
  iconName: string;
  selected: boolean;
  selectedPulseOn?: boolean;
  pulseEnabled?: boolean;
  itineraryOrder?: number;
  score?: number;
};

type PlannerRadiusFeatureProperties = {
  dashColor: string;
};

type PlannerPinVariant = "suggested" | "poi" | "base" | "hydrophone" | "camera";

type PlannerPinSpec = {
  id: string;
  variant: PlannerPinVariant;
  type: PlannerLocationType;
  liveDotHalo?: "none" | "soft" | "strong";
};

const PLANNER_PIN_SPECS: PlannerPinSpec[] = [
  { id: "planner-pin-suggested-park", variant: "suggested", type: "Park" },
  { id: "planner-pin-suggested-marina", variant: "suggested", type: "Marina" },
  { id: "planner-pin-suggested-ferry", variant: "suggested", type: "Ferry" },
  { id: "planner-pin-poi-park", variant: "poi", type: "Park" },
  { id: "planner-pin-poi-marina", variant: "poi", type: "Marina" },
  { id: "planner-pin-poi-ferry", variant: "poi", type: "Ferry" },
  { id: "planner-pin-base", variant: "base", type: "Base" },
  {
    id: "planner-pin-camera",
    variant: "camera",
    type: "Camera",
    liveDotHalo: "none",
  },
  {
    id: "planner-pin-camera-live",
    variant: "camera",
    type: "Camera",
    liveDotHalo: "soft",
  },
  {
    id: "planner-pin-camera-live-strong",
    variant: "camera",
    type: "Camera",
    liveDotHalo: "strong",
  },
  {
    id: "planner-pin-hydrophone",
    variant: "hydrophone",
    type: "Hydrophone",
    liveDotHalo: "none",
  },
  {
    id: "planner-pin-hydrophone-live",
    variant: "hydrophone",
    type: "Hydrophone",
    liveDotHalo: "soft",
  },
  {
    id: "planner-pin-hydrophone-live-strong",
    variant: "hydrophone",
    type: "Hydrophone",
    liveDotHalo: "strong",
  },
];

function getPointCoordinates(
  latitude: number,
  longitude: number,
): LngLat | null {
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

function getPlannerLocationIconName(
  kind: PlannerLocationKind,
  type?: SuggestedPlace["type"] | PublicPoi["type"],
) {
  if (kind === "base") return "planner-pin-base";
  if (kind === "camera") return "planner-pin-camera-live";
  if (kind === "hydrophone") return "planner-pin-hydrophone-live";
  return `planner-pin-${kind}-${getPoiIconKey(type)}`;
}

function getPlannerMarkerSymbol(
  kind: PlannerLocationKind,
  type?: SuggestedPlace["type"] | PublicPoi["type"],
) {
  if (kind === "base") return "home";
  if (kind === "camera") return "videocam";
  if (kind === "hydrophone") return "graphic_eq";
  if (type === "Park") return "forest";
  if (type === "Ferry") return "directions_boat";
  return "anchor";
}

function createPlannerDomMarker(properties: PlannerLocationFeatureProperties) {
  const element = document.createElement("button");
  element.type = "button";
  const hasItineraryOrder =
    typeof properties.itineraryOrder === "number" &&
    properties.itineraryOrder > 0;
  element.className = `plannerMapMarker plannerMapMarker--${properties.kind}${properties.selected ? " is-selected" : ""}${properties.selected && properties.pulseEnabled ? " is-pulsing" : ""}${hasItineraryOrder ? " is-itinerary" : ""}`;
  element.setAttribute(
    "aria-label",
    `${properties.name}, ${properties.markerType}`,
  );
  element.title = properties.name;

  const icon = document.createElement("span");
  icon.className = "material-symbols-rounded";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = getPlannerMarkerSymbol(
    properties.kind,
    properties.markerType as SuggestedPlace["type"],
  );
  element.append(icon);

  const label = document.createElement("span");
  label.className = "plannerMapMarker__label";
  label.textContent = properties.name;
  label.setAttribute("aria-hidden", "true");
  element.append(label);

  if (hasItineraryOrder) {
    const badge = document.createElement("span");
    badge.className = "plannerMapMarker__itineraryBadge";
    badge.textContent = String(properties.itineraryOrder).padStart(2, "0");
    badge.setAttribute("aria-hidden", "true");
    element.append(badge);
  }

  return element;
}

function escapePopupHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSuggestedPlacePopupHtml(place: SuggestedPlace) {
  return `<div class="poiPopup"><div class="poiPopup__title">${escapePopupHtml(place.name)}</div><div class="poiPopup__meta">Recommended ${escapePopupHtml(formatSuggestedPlaceType(place.type))} · mean nearby score ${Number(place.score).toFixed(3)} · ${Number(place.latitude).toFixed(4)}, ${Number(place.longitude).toFixed(4)}</div></div>`;
}

function getBaseLocationPopupHtml(baseLocation: {
  name: string;
  latitude: number;
  longitude: number;
}) {
  return `<div class="poiPopup"><div class="poiPopup__title">${escapePopupHtml(baseLocation.name)}</div><div class="poiPopup__meta">Base location · ${Number(baseLocation.latitude).toFixed(4)}, ${Number(baseLocation.longitude).toFixed(4)}</div></div>`;
}

function buildPlannerLocationCollection(args: {
  baseLocation: { name: string; latitude: number; longitude: number } | null;
  suggestedPlaces: SuggestedPlace[];
  itineraryPlaceIds: string[];
  selectedPlaceId: string | null;
  cameraLocations: WebcamSite[];
  selectedCameraId: string | null;
  selectedHydrophoneId: string | null;
  showSuggestedPlaces: boolean;
  showCameras: boolean;
  hydrophoneLocations: OrcasoundHydrophone[];
  showHydrophones: boolean;
  poiItems: PublicPoi[];
  poiFilters: PoiFilters;
  pulseSelectedPlaceMarker: boolean;
}): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  const baseCoords = args.baseLocation
    ? getPointCoordinates(
        args.baseLocation.latitude,
        args.baseLocation.longitude,
      )
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
  const itineraryOrderById = new Map(
    args.itineraryPlaceIds.map((id, index) => [id, index + 1]),
  );

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
          pulseEnabled:
            place.id === args.selectedPlaceId && args.pulseSelectedPlaceMarker,
          itineraryOrder: itineraryOrderById.get(place.id) ?? 0,
          score: place.score,
        } satisfies PlannerLocationFeatureProperties,
      });
    }
  }

  if (args.showCameras) {
    for (const camera of args.cameraLocations) {
      const coords = getPointCoordinates(camera.latitude, camera.longitude);
      if (!coords) continue;
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: coords,
        },
        properties: {
          id: `camera:${camera.id}`,
          kind: "camera",
          name: camera.name,
          markerType: "Camera",
          iconName: getPlannerLocationIconName("camera"),
          selected: camera.id === args.selectedCameraId,
          selectedPulseOn: false,
          pulseEnabled: true,
        } satisfies PlannerLocationFeatureProperties,
      });
    }
  }

  if (args.showHydrophones) {
    for (const hydrophone of args.hydrophoneLocations) {
      const coords = getPointCoordinates(
        hydrophone.latitude,
        hydrophone.longitude,
      );
      if (!coords) continue;
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: coords,
        },
        properties: {
          id: `hydrophone:${hydrophone.id}`,
          kind: "hydrophone",
          name: hydrophone.name,
          markerType: "Hydrophone",
          iconName: getPlannerLocationIconName("hydrophone"),
          selected: hydrophone.id === args.selectedHydrophoneId,
          selectedPulseOn: false,
          pulseEnabled: true,
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
          iconName: getPlannerLocationIconName("suggested", poi.type),
          selected: id === args.selectedPlaceId,
          selectedPulseOn: id === args.selectedPlaceId,
          pulseEnabled:
            id === args.selectedPlaceId && args.pulseSelectedPlaceMarker,
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
  return map.getSource(sourceId) as
    { setData: (data: FeatureCollection) => void } | undefined;
}

function upsertGeoJsonSource(
  map: MapLibreMap,
  sourceId: string,
  data: FeatureCollection,
) {
  if (!map.isStyleLoaded()) return false;

  const source = getGeoJsonSource(map, sourceId);
  if (source) {
    source.setData(data);
    return true;
  }
  map.addSource(sourceId, { type: "geojson", data });
  return true;
}

function buildMaxTravelRadiusCollection(
  baseLocation: { latitude: number; longitude: number } | null,
  miles: number | null,
): FeatureCollection {
  if (!baseLocation || !miles || !Number.isFinite(miles) || miles <= 0) {
    return { type: "FeatureCollection", features: [] };
  }

  const center = getPointCoordinates(
    baseLocation.latitude,
    baseLocation.longitude,
  );
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
      const angleDegrees =
        startAngle + ((endAngle - startAngle) * step) / dashSteps;
      const angle = (angleDegrees * Math.PI) / 180;
      const latitudeOffset = (kilometers * Math.sin(angle)) / kmPerDegreeLat;
      const longitudeOffset = (kilometers * Math.cos(angle)) / kmPerDegreeLon;
      coordinates.push([
        longitude + longitudeOffset,
        latitude + latitudeOffset,
      ]);
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

function withPlannerLocationPulse(
  data: FeatureCollection,
  pulseOn: boolean,
): FeatureCollection {
  return {
    ...data,
    features: data.features.map((feature) => {
      const properties = (feature.properties ??
        {}) as PlannerLocationFeatureProperties;
      if (!properties.selected && !properties.pulseEnabled) return feature;
      if (properties.kind === "camera") {
        return {
          ...feature,
          properties: {
            ...properties,
            iconName: pulseOn
              ? "planner-pin-camera-live-strong"
              : "planner-pin-camera-live",
          },
        };
      }
      if (properties.kind === "hydrophone") {
        return {
          ...feature,
          properties: {
            ...properties,
            iconName: pulseOn
              ? "planner-pin-hydrophone-live-strong"
              : "planner-pin-hydrophone-live",
          },
        };
      }
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
          fill: "#fff7e8",
          center: "#fff7e8",
          stroke: "#173f62",
          icon: "#061d3c",
          glow: "rgba(7,49,68,0.26)",
        }
      : spec.variant === "base"
        ? {
            fill: "#ffffff",
            center: "#f3fbfd",
            stroke: "#158fa2",
            icon: "#0b718d",
            glow: "rgba(21,143,162,0.24)",
          }
        : spec.variant === "camera"
          ? {
              fill: "#fff7e8",
              center: "#fff7e8",
              stroke: "#173f62",
              icon: "#061d3c",
              glow: "rgba(7,49,68,0.26)",
            }
          : spec.variant === "hydrophone"
            ? {
                fill: "#fff7e8",
                center: "#fff7e8",
                stroke: "#173f62",
                icon: "#061d3c",
                glow: "rgba(7,49,68,0.26)",
              }
            : {
                fill: "#fff7e8",
                center: "#fff7e8",
                stroke: "#173f62",
                icon: "#061d3c",
                glow: "rgba(7,49,68,0.26)",
              };
  const symbol =
    spec.type === "Park"
      ? { text: "forest", font: "Material Symbols Rounded" }
      : spec.type === "Ferry"
        ? { text: "directions_boat", font: "Material Symbols Outlined" }
        : spec.type === "Base"
          ? { text: "home", font: "Material Symbols Outlined" }
          : spec.type === "Camera"
            ? { text: "videocam", font: "Material Symbols Rounded" }
            : spec.type === "Hydrophone"
              ? { text: "graphic_eq", font: "Material Symbols Rounded" }
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

  if (spec.variant === "camera" || spec.variant === "hydrophone") {
    const halo = spec.liveDotHalo ?? "none";
    if (halo === "soft") {
      ctx.fillStyle = "rgba(224, 74, 87, 0.14)";
      ctx.beginPath();
      ctx.arc(42, 22, 6.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (halo === "strong") {
      ctx.fillStyle = "rgba(224, 74, 87, 0.11)";
      ctx.beginPath();
      ctx.arc(42, 22, 8.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(224, 74, 87, 0.2)";
      ctx.beginPath();
      ctx.arc(42, 22, 5.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 243, 245, 0.98)";
    ctx.beginPath();
    ctx.arc(42, 22, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e04a57";
    ctx.beginPath();
    ctx.arc(42, 22, 3.1, 0, Math.PI * 2);
    ctx.fill();
  }

  return ctx.getImageData(0, 0, width, height);
}

async function ensurePlannerLocationIconImages(map: MapLibreMap) {
  await Promise.all(
    PLANNER_PIN_SPECS.map(async (spec) => {
      if (map.hasImage(spec.id)) return;
      const image = await buildPlannerPinImage(spec);
      if (!map.hasImage(spec.id))
        map.addImage(spec.id, image, { pixelRatio: 2 });
    }),
  );
}

async function ensurePlannerLocationLayers(
  map: MapLibreMap,
  data: FeatureCollection,
) {
  if (!upsertGeoJsonSource(map, PLANNER_LOCATION_SOURCE_ID, data)) return;

  try {
    await ensurePlannerLocationIconImages(map);
  } catch (error) {
    console.warn("[POI] planner pin images failed to load", error);
  }

  // Adding or updating a GeoJSON source temporarily makes isStyleLoaded() false
  // while MapLibre processes its data. The source's continued presence is the
  // reliable signal that the active style can receive the planner layers.
  if (!map.getSource(PLANNER_LOCATION_SOURCE_ID)) return;

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
          22,
          17,
        ],
        "circle-color": "rgba(255, 213, 79, 0)",
        "circle-opacity": 0,
        "circle-stroke-width": [
          "case",
          ["==", ["get", "selectedPulseOn"], true],
          4,
          3,
        ],
        "circle-stroke-color": "rgba(255, 213, 79, 1)",
        "circle-stroke-opacity": [
          "case",
          ["==", ["get", "selectedPulseOn"], true],
          0.9,
          0.48,
        ],
        "circle-translate": [0, -20],
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
          ["==", ["get", "selected"], true],
          17,
          ["==", ["get", "kind"], "base"],
          13,
          ["==", ["get", "kind"], "suggested"],
          11,
          ["==", ["get", "kind"], "hydrophone"],
          11,
          ["==", ["get", "kind"], "camera"],
          11,
          10,
        ],
        // This transparent circle is the shared interaction target beneath the
        // raster pin. Keeping it invisible avoids the extra blue disc that made
        // bulk POIs look larger than the Top-25 HTML pins.
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-opacity": 0,
        "circle-stroke-width": 0,
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
          0.49,
          ["==", ["get", "kind"], "suggested"],
          0.43,
          ["==", ["get", "kind"], "base"],
          0.7,
          0.43,
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
          ["==", ["get", "kind"], "hydrophone"],
          2,
          1,
        ],
      },
      paint: {
        "icon-opacity": ["case", ["==", ["get", "selected"], true], 1, 1],
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
  if (map.getLayer(PLANNER_MAX_TRAVEL_LAYER_ID))
    map.moveLayer(PLANNER_MAX_TRAVEL_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_HALO_LAYER_ID))
    map.moveLayer(PLANNER_LOCATION_HALO_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_CIRCLE_LAYER_ID))
    map.moveLayer(PLANNER_LOCATION_CIRCLE_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_SYMBOL_LAYER_ID))
    map.moveLayer(PLANNER_LOCATION_SYMBOL_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID))
    map.moveLayer(PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID);
  if (map.getLayer(PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID))
    map.moveLayer(PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID);
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

function getLocationMarkerKey(place: {
  name: string;
  latitude: number;
  longitude: number;
}) {
  return `${normalizeMarkerId(place.name)}-${Number(place.latitude).toFixed(4)}-${Number(place.longitude).toFixed(4)}`;
}

function getPublicPoiFeatureId(poi: PublicPoi) {
  return `poi-${getLocationMarkerKey(poi)}`;
}

function formatSuggestedPlaceType(type: SuggestedPlace["type"]) {
  if (type === "Ferry") return "Ferry terminal";
  return type;
}

export const ForecastMap = forwardRef<ForecastMapHandle, ForecastMapProps>(
  function ForecastMap(
    {
      darkMode,
      basemapMode = "vector",
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
      enableGridInteraction = true,
      forecastPath,
      fallbackForecastPath,
      smoothedForecastPath,
      fallbackSmoothedForecastPath,
      smoothedForecastTilePath,
      fallbackSmoothedForecastTilePath,
      weightedSmoothedForecastSources,
      colorScaleValues,
      useExternalColorScale = false,
      externalValues,
      forecastOverlayEnabled = true,
      pulseAllGridCells = false,
      mapModeLabel,
      forecastOverlayLoadKey = "",
      onForecastOverlayReady,
      onFatalDataError,
      suggestedPlaces = [],
      itineraryPlaceIds = [],
      selectedPlaceId = null,
      cameraLocations = [],
      selectedCameraId = null,
      selectedHydrophoneId = null,
      pulseSelectedPlaceMarker = false,
      onPlaceSelect,
      onCameraSelect,
      onHydrophoneSelect,
      onPoiSelect,
      onLocationSelectionClear,
      showTripHotspotMarkers = false,
      forceDomSuggestedMarkers = false,
      baseLocation = null,
      maxTravelDistanceMiles = null,
      showCameras = false,
      hydrophoneLocations = [],
      showHydrophones = false,
      sidebarOffsetPx = 0,
      gridPresentation = "default",
    }: ForecastMapProps,
    ref,
  ) {
    trackRender("ForecastMap", { resolution, modelId, darkMode });

    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const styleUrl = useMemo(
      () =>
        basemapMode === "raster"
          ? darkMode
            ? DARK_RASTER_STYLE
            : VOYAGER_RASTER_STYLE
          : darkMode
            ? DARK_STYLE
            : VOYAGER_STYLE,
      [basemapMode, darkMode],
    );

    const sidebarPaddingRight = useMemo(
      () =>
        sidebarOffsetPx > 0
          ? Math.max(0, Math.round(sidebarOffsetPx * 0.72))
          : 0,
      [sidebarOffsetPx],
    );
    const activePalette = useMemo(
      () => getPaletteOrDefault(paletteId),
      [paletteId],
    );
    const gridBorderColor = useMemo(
      () => (darkMode ? "rgba(8,18,44,0.22)" : "rgba(20,42,78,0.16)"),
      [darkMode],
    );
    const gridLineAccentColor = "rgba(96,186,200,0.34)";
    const gridVisualStyle = useMemo<GridVisualStyle>(
      () =>
        gridPresentation === "quiet"
          ? {
              fillOpacity: 0.66,
              haloOpacity: 0.12,
              lineOpacity: 0.28,
              lineWidth: 0.34,
            }
          : {
              fillOpacity: 0.8,
              haloOpacity: 0.45,
              lineOpacity: 0.85,
              lineWidth: 0.4,
            },
      [gridPresentation],
    );

    const overlayRef = useRef<FeatureCollection | null>(null);
    const fillExprRef = useRef<FillColorSpec | null>(null);
    const hotspotThresholdRef = useRef<number | undefined>(undefined);
    const modeledHotspotThresholdRef = useRef<number | undefined>(undefined);
    const expectedActivityHotspotCellCountRef = useRef<number | null>(
      coerceExpectedActivityHotspotCellCount(expectedActivityHotspotCellCount),
    );
    const valuesByCellRef = useRef<Record<string, number>>({});
    const colorScaleValuesRef = useRef<Record<string, number> | undefined>(
      colorScaleValues,
    );
    const sortedValuesDescRef = useRef<number[]>([]);
    const totalCellsRef = useRef(0);
    const shimmerThresholdRef = useRef<number | undefined>(undefined);
    const legendSpecRef = useRef<HeatScale | null>(null);
    const styleUrlRef = useRef(styleUrl);
    const activeStyleUrlRef = useRef(styleUrl);
    const mapReadyRef = useRef(false);
    const hotspotsOnlyRef = useRef(hotspotsEnabled);
    const lastGridLayerSignatureRef = useRef<string | null>(null);
    const smoothedSurfaceRequestIdRef = useRef(0);
    const hoveredCellRef = useRef<string | null>(null);
    const periodsRef = useRef<Period[]>(periods);
    const modelIdRef = useRef(modelId);
    const resolutionRef = useRef(resolution);
    const selectedWeekRef = useRef(selectedWeek);
    const selectedWeekYearRef = useRef(selectedWeekYear);
    const sparklineCacheRef = useRef<Map<string, SparklineSeries>>(new Map());
    const forecastPeriodCacheRef = useRef<
      Map<string, Promise<Record<string, number>>>
    >(new Map());
    const sightingsWeekCacheRef = useRef<Map<string, Promise<LngLat[]>>>(
      new Map(),
    );
    const sparkPopupRef = useRef<maplibregl.Popup | null>(null);
    const sparkRequestIdRef = useRef(0);
    const onGridCellSelectRef = useRef(onGridCellSelect);
    const onGridCellExpandRef = useRef(onGridCellExpand);
    const enableGridInteractionRef = useRef(enableGridInteraction);

    const [legendSpec, setLegendSpec] = useState<HeatScale | null>(null);
    const [legendOpen, setLegendOpen] = useState(false);
    const [mapReady, setMapReady] = useState(false);
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady || !forceDomSuggestedMarkers) return;

      const itineraryOrderById = new Map(
        itineraryPlaceIds.map((id, index) => [id, index + 1]),
      );
      const markers = suggestedPlaces.flatMap((place) => {
        const coordinates = getPointCoordinates(
          place.latitude,
          place.longitude,
        );
        if (!coordinates) return [];
        const element = createPlannerDomMarker({
          id: place.id,
          kind: "suggested",
          name: place.name,
          markerType: place.type,
          iconName: getPlannerLocationIconName("suggested", place.type),
          selected: place.id === selectedPlaceId,
          selectedPulseOn: place.id === selectedPlaceId,
          pulseEnabled:
            place.id === selectedPlaceId && pulseSelectedPlaceMarker,
          itineraryOrder: itineraryOrderById.get(place.id) ?? 0,
          score: place.score,
        });
        element.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onPlaceSelect?.(place);
        });
        return [
          new maplibregl.Marker({ element, anchor: "bottom" })
            .setLngLat(coordinates)
            .addTo(map),
        ];
      });

      return () => markers.forEach((marker) => marker.remove());
    }, [
      forceDomSuggestedMarkers,
      itineraryPlaceIds,
      mapReady,
      onPlaceSelect,
      pulseSelectedPlaceMarker,
      selectedPlaceId,
      suggestedPlaces,
    ]);
    const [poiItems, setPoiItems] = useState<PublicPoi[]>([]);
    const [accessibleLocationAnnouncement, setAccessibleLocationAnnouncement] =
      useState("");

    const hasForecastLegend = legendSpec !== null;
    const poiLayerActive = hasActivePoiFilter(poiFilters);
    const accessiblePoiItems = useMemo(
      () => (poiLayerActive ? filterPoisByType(poiItems, poiFilters) : []),
      [poiItems, poiFilters, poiLayerActive],
    );

    const handleAccessiblePoiSelect = useCallback(
      (featureId: string) => {
        if (!featureId) return;
        const poi = accessiblePoiItems.find(
          (item) => getPublicPoiFeatureId(item) === featureId,
        );
        if (!poi) return;
        setAccessibleLocationAnnouncement(
          `${poi.name}, ${poi.type}, selected on the map.`,
        );
        if (onPoiSelect) {
          onPoiSelect(poi);
          return;
        }
        mapRef.current?.flyTo({
          center: [poi.longitude, poi.latitude],
          zoom: Math.max(mapRef.current.getZoom(), 11),
          duration: mapMotionDuration(500),
          essential: false,
        });
      },
      [accessiblePoiItems, onPoiSelect],
    );

    const resolveHotspotThreshold = useCallback(() => {
      const modeled =
        modeledHotspotThresholdRef.current ?? hotspotThresholdRef.current;
      if (hotspotMode !== "custom") {
        const values = sortedValuesDescRef.current;
        const modeledCount = expectedActivityHotspotCellCountRef.current;
        if (
          values.length > 0 &&
          modeledCount !== null &&
          Number.isFinite(modeledCount) &&
          modeledCount > 0
        ) {
          return (
            values[
              Math.max(
                0,
                Math.min(values.length - 1, Math.round(modeledCount) - 1),
              )
            ] ?? modeled
          );
        }
        return modeled;
      }
      const values = sortedValuesDescRef.current;
      const total = totalCellsRef.current;
      if (values.length === 0 || total === 0) return modeled;
      const count = Math.max(
        1,
        Math.round(
          (total * Math.min(Math.max(hotspotPercentile, 0), 100)) / 100,
        ),
      );
      return (
        values[Math.max(0, Math.min(values.length - 1, count - 1))] ?? modeled
      );
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
              : (fillExprRef.current ?? undefined);

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
            gridLineAccentColor,
            undefined,
            undefined,
            undefined,
            gridVisualStyle,
          );
        }

        const smoothedSurfaceRequestId = ++smoothedSurfaceRequestIdRef.current;
        if (weightedSmoothedForecastSources !== undefined) {
          if (
            surfaceMode === "surface" &&
            weightedSmoothedForecastSources.length > 0
          ) {
            void addWeightedGeoTiffSurfaceOverlay(
              map,
              weightedSmoothedForecastSources,
              activePalette.colors,
              () =>
                smoothedSurfaceRequestId !==
                smoothedSurfaceRequestIdRef.current,
            ).catch((error) => {
              if (
                smoothedSurfaceRequestId !== smoothedSurfaceRequestIdRef.current
              )
                return;
              // A weighted-source prop is an exclusive raster contract. Keep
              // the last valid TIFF frame (or the basemap on first load)
              // instead of substituting the generated H3 smoothing surface.
              console.warn(
                "[Forecast] weighted smoothed GeoTIFFs failed; retaining the previous raster",
                error,
              );
            });
          }
        } else if (surfaceMode === "surface" && smoothedForecastTilePath) {
          void addRasterTileSurfaceOverlay(
            map,
            smoothedForecastTilePath,
            fallbackSmoothedForecastTilePath,
            activePalette.colors,
            () =>
              smoothedSurfaceRequestId !== smoothedSurfaceRequestIdRef.current,
          ).catch((tileError) => {
            if (
              smoothedSurfaceRequestId !== smoothedSurfaceRequestIdRef.current
            )
              return;
            if (!smoothedForecastPath) {
              console.warn(
                "[Forecast] smoothed raster tiles failed and no GeoTIFF fallback is available",
                tileError,
              );
              return;
            }
            console.warn(
              "[Forecast] smoothed raster tiles failed; using GeoTIFF fallback",
              tileError,
            );
            void addGeoTiffSurfaceOverlay(
              map,
              smoothedForecastPath,
              fallbackSmoothedForecastPath,
              activePalette.colors,
              () =>
                smoothedSurfaceRequestId !==
                smoothedSurfaceRequestIdRef.current,
            ).catch((error) => {
              if (
                smoothedSurfaceRequestId !== smoothedSurfaceRequestIdRef.current
              )
                return;
              console.warn(
                "[Forecast] smoothed GeoTIFF fallback failed; using generated surface",
                error,
              );
              if (overlayRef.current) {
                addSurfaceOverlay(
                  map,
                  overlayRef.current,
                  activePalette.colors,
                  scale,
                );
                setSurfaceVisibility(map, true);
              }
            });
          });
        } else if (surfaceMode === "surface" && smoothedForecastPath) {
          void addGeoTiffSurfaceOverlay(
            map,
            smoothedForecastPath,
            fallbackSmoothedForecastPath,
            activePalette.colors,
            () =>
              smoothedSurfaceRequestId !== smoothedSurfaceRequestIdRef.current,
          ).catch((error) => {
            if (
              smoothedSurfaceRequestId !== smoothedSurfaceRequestIdRef.current
            )
              return;
            console.warn(
              "[Forecast] smoothed GeoTIFF failed; using generated surface",
              error,
            );
            if (overlayRef.current) {
              addSurfaceOverlay(
                map,
                overlayRef.current,
                activePalette.colors,
                scale,
              );
              setSurfaceVisibility(map, true);
            }
          });
        } else {
          addSurfaceOverlay(
            map,
            overlayRef.current,
            activePalette.colors,
            scale,
          );
        }

        if (hotspots) {
          if (surfaceMode === "surface") {
            setGridBaseVisibility(
              map,
              false,
              undefined,
              undefined,
              gridVisualStyle,
            );
            setSurfaceVisibility(map, true);
            setHotspotVisibility(map, hotspotOverlayVisible);
          } else if (hotspotOverlayVisible) {
            setGridBaseVisibility(
              map,
              false,
              undefined,
              undefined,
              gridVisualStyle,
            );
            setSurfaceVisibility(map, false);
            setHotspotVisibility(map, true);
          } else {
            setGridVisibility(map, true, undefined, undefined, gridVisualStyle);
            setSurfaceVisibility(map, false);
            setHotspotVisibility(map, false);
          }
        } else if (surfaceMode === "surface") {
          setGridBaseVisibility(
            map,
            false,
            undefined,
            undefined,
            gridVisualStyle,
          );
          setSurfaceVisibility(map, true);
          setHotspotVisibility(map, false);
        } else {
          setGridVisibility(map, true, undefined, undefined, gridVisualStyle);
          setSurfaceVisibility(map, false);
          setHotspotVisibility(map, false);
        }

        setGridHoverCell(map, hoveredCellRef.current);
        bringPlannerLocationLayersToFront(map);
      },
      [
        activePalette.colors,
        gridBorderColor,
        gridLineAccentColor,
        gridVisualStyle,
        hotspotMode,
        resolution,
        resolveHotspotThreshold,
        smoothedForecastPath,
        fallbackSmoothedForecastPath,
        smoothedForecastTilePath,
        fallbackSmoothedForecastTilePath,
        weightedSmoothedForecastSources,
        surfaceMode,
      ],
    );

    const scheduleForecastRender = useCallback(
      (
        map: MapLibreMap,
        isCancelled?: () => boolean,
        onRendered?: () => void,
      ) => {
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
          if (!overlayRef.current || !mapRef.current || !map.isStyleLoaded())
            return;
          try {
            renderForecastLayer(map);
            onRendered?.();
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
      [renderForecastLayer],
    );

    const requestForecastRender = useCallback(
      (map: MapLibreMap) => {
        if (!overlayRef.current || !mapRef.current || mapRef.current !== map)
          return;
        if (!map.isStyleLoaded()) {
          scheduleForecastRender(map);
          return;
        }
        try {
          renderForecastLayer(map);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (
            message.toLowerCase().includes("style") ||
            message.toLowerCase().includes("loading")
          ) {
            scheduleForecastRender(map);
            return;
          }
          throw error;
        }
      },
      [renderForecastLayer, scheduleForecastRender],
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
        itineraryLocations,
      }: {
        center?: LngLat;
        zoom?: number;
        width?: number;
        height?: number;
        includeForecastOverlay?: boolean;
        itineraryLocations?: LngLat[];
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
          width ??
            sourceCanvas.clientWidth ??
            containerRef.current?.clientWidth ??
            1024,
        );
        const snapshotHeight = Math.max(
          1,
          height ??
            sourceCanvas.clientHeight ??
            containerRef.current?.clientHeight ??
            768,
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
            const timeoutId = window.setTimeout(
              () => reject(new Error("Snapshot map load timed out")),
              3500,
            );
            tempMap?.once("load", () => {
              window.clearTimeout(timeoutId);
              resolve();
            });
            tempMap?.once("error", (event: { error?: unknown }) => {
              window.clearTimeout(timeoutId);
              reject(
                event.error instanceof Error
                  ? event.error
                  : new Error("Snapshot map failed to load"),
              );
            });
          });

          safeApplyBasemapVisualTuning(
            tempMap,
            styleUrlRef.current === DARK_STYLE,
          );
          if (includeForecastOverlay && overlay) {
            addGridOverlay(
              tempMap,
              overlay,
              fillExprRef.current ?? undefined,
              resolveHotspotThreshold(),
              hotspotsOnlyRef.current,
              shimmerThresholdRef.current,
              gridBorderColor,
              gridLineAccentColor,
              undefined,
              undefined,
              undefined,
              gridVisualStyle,
            );
            if (hotspotsOnlyRef.current) {
              setGridBaseVisibility(
                tempMap,
                false,
                undefined,
                undefined,
                gridVisualStyle,
              );
              setHotspotVisibility(tempMap, true);
            } else {
              setGridVisibility(
                tempMap,
                true,
                undefined,
                undefined,
                gridVisualStyle,
              );
              setHotspotVisibility(tempMap, false);
            }
          }

          if (itineraryLocations && itineraryLocations.length > 0) {
            tempMap.addSource("itinerary-export-stops", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: itineraryLocations.map((coordinates, index) => ({
                  type: "Feature",
                  properties: { order: String(index + 1) },
                  geometry: { type: "Point", coordinates },
                })),
              },
            });
            tempMap.addLayer({
              id: "itinerary-export-stop-halo",
              type: "circle",
              source: "itinerary-export-stops",
              paint: {
                "circle-radius": 20,
                "circle-color": "#fff8e9",
                "circle-opacity": 0.96,
              },
            });
            tempMap.addLayer({
              id: "itinerary-export-stop-circle",
              type: "circle",
              source: "itinerary-export-stops",
              paint: {
                "circle-radius": 16,
                "circle-color": "#ff6458",
                "circle-stroke-color": "#061d3c",
                "circle-stroke-width": 2,
              },
            });
            tempMap.addLayer({
              id: "itinerary-export-stop-number",
              type: "symbol",
              source: "itinerary-export-stops",
              layout: {
                "text-field": ["get", "order"],
                "text-size": 16,
                "text-font": ["Noto Sans Bold"],
              },
              paint: { "text-color": "#fffdf6" },
            });
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
      [
        gridBorderColor,
        gridLineAccentColor,
        gridVisualStyle,
        resolveHotspotThreshold,
      ],
    );

    const captureCurrentMapSnapshot = useCallback(async () => {
      return captureMapSnapshot();
    }, [captureMapSnapshot]);

    const captureItinerarySnapshot = useCallback(
      async (locations: LngLat[]) =>
        captureMapSnapshot({
          width: 1080,
          height: 520,
          includeForecastOverlay: false,
          itineraryLocations: locations,
        }),
      [captureMapSnapshot],
    );

    const fitLocations = useCallback(
      (
        locations: LngLat[],
        options?: { padding?: MapViewportPadding; maxZoom?: number },
      ) => {
        const map = mapRef.current;
        if (!map || locations.length === 0) return;

        if (locations.length === 1) {
          map.flyTo({
            center: locations[0],
            zoom: options?.maxZoom ?? 11.2,
            essential: false,
            duration: mapMotionDuration(900),
            padding: options?.padding,
          });
          return;
        }

        const bounds = locations.reduce(
          (acc, location) => acc.extend(location),
          new maplibregl.LngLatBounds(locations[0], locations[0]),
        );

        map.fitBounds(bounds, {
          padding: options?.padding ?? 88,
          maxZoom: options?.maxZoom ?? 10.8,
          duration: mapMotionDuration(900),
          essential: false,
        });
      },
      [],
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
      [captureMapSnapshot],
    );

    useImperativeHandle(
      ref,
      () => ({
        captureSnapshot: captureCurrentMapSnapshot,
        captureItinerarySnapshot,
        capturePlacePreview,
        fitLocations,
      }),
      [
        captureCurrentMapSnapshot,
        captureItinerarySnapshot,
        capturePlacePreview,
        fitLocations,
      ],
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
      overlayLoadKey: forecastOverlayLoadKey,
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
      onOverlayRendered:
        forecastOverlayEnabled && forecastOverlayLoadKey
          ? () => onForecastOverlayReady?.(forecastOverlayLoadKey)
          : undefined,
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
      enableGridInteractionRef.current = enableGridInteraction;
    }, [
      periods,
      modelId,
      resolution,
      selectedWeek,
      selectedWeekYear,
      onGridCellSelect,
      onGridCellExpand,
      enableGridInteraction,
    ]);

    useEffect(() => {
      hotspotsOnlyRef.current = hotspotsEnabled;
    }, [hotspotsEnabled]);

    useEffect(() => {
      expectedActivityHotspotCellCountRef.current =
        coerceExpectedActivityHotspotCellCount(
          expectedActivityHotspotCellCount,
        );
    }, [expectedActivityHotspotCellCount]);

    useEffect(() => {
      lastGridLayerSignatureRef.current = null;
    }, [
      resolution,
      modelId,
      forecastPath,
      fallbackForecastPath,
      externalValues,
      pulseAllGridCells,
      activePalette,
    ]);

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

      map.on("error", (e: { error?: unknown }) =>
        console.error("[MapLibre] error:", e?.error || e),
      );

      const {
        handleSparklineClick,
        handleMouseEnter,
        handleMouseMove,
        handleMouseLeave,
      } = createGridInteractionHandlers({
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
        enableSparklinePopupRef: enableGridInteractionRef,
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

    useHotspotAnimation({
      mapReady,
      mapRef,
      hotspotsOnlyRef,
      resolution,
      forecastPath,
    });

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
        useExternalColorScale &&
        colorScaleValuesRef.current &&
        Object.keys(colorScaleValuesRef.current).length > 0
          ? colorScaleValuesRef.current
          : values;
      const { fillColorExpr, scale } = buildAutoColorExprFromValues(
        scaleSourceValues,
        activePalette.colors,
        ["get", "prob"],
        colorNoData,
      );
      fillExprRef.current = fillColorExpr as unknown as FillColorSpec;
      legendSpecRef.current = scale;
      setLegendSpec(scale);
      requestForecastRender(map);
    }, [
      activePalette,
      colorNoData,
      colorScaleValues,
      mapReady,
      requestForecastRender,
      useExternalColorScale,
    ]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !overlayRef.current) return;
      requestForecastRender(map);
    }, [hotspotsEnabled, legendSpec, requestForecastRender]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady || surfaceMode !== "surface") return;

      const handleSurfaceViewportChange = () => {
        if (!overlayRef.current || !mapRef.current || mapRef.current !== map)
          return;
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
        coerceExpectedActivityHotspotCellCount(
          expectedActivityHotspotCellCount,
        ) === 0;

      // Forecast playback updates the legend before the next GeoTIFF has
      // finished decoding. Keep the current smooth frame visible during that
      // gap instead of briefly restoring the newly updated hex layer.
      if (surfaceMode === "surface") {
        setGridBaseVisibility(
          map,
          false,
          undefined,
          undefined,
          gridVisualStyle,
        );
        setSurfaceVisibility(map, true);
        setHotspotVisibility(
          map,
          hasForecastLegend && hotspotsEnabled && !zeroModeledHotspots,
        );
        return;
      }

      if (!hasForecastLegend) {
        setGridCoreLayerVisibility(map, true);
        setGridVisibility(map, true, undefined, undefined, gridVisualStyle);
        setHotspotVisibility(map, false);
        return;
      }

      setGridCoreLayerVisibility(map, true);
      if (hotspotsEnabled) {
        setGridBaseVisibility(
          map,
          false,
          undefined,
          undefined,
          gridVisualStyle,
        );
        setHotspotVisibility(map, !zeroModeledHotspots);
        if (zeroModeledHotspots) setGridVisibility(map, false);
      } else {
        setGridVisibility(map, true, undefined, undefined, gridVisualStyle);
        setHotspotVisibility(map, false);
      }
    }, [
      expectedActivityHotspotCellCount,
      gridVisualStyle,
      hasForecastLegend,
      hotspotMode,
      hotspotsEnabled,
      mapReady,
      surfaceMode,
    ]);

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
      const domMarkers: maplibregl.Marker[] = [];
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
      });
      const hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "plannerMapHoverPopup",
        offset: 32,
      });

      const baseData = buildPlannerLocationCollection({
        baseLocation,
        suggestedPlaces,
        itineraryPlaceIds,
        selectedPlaceId,
        cameraLocations,
        selectedCameraId,
        selectedHydrophoneId,
        showSuggestedPlaces: showTripHotspotMarkers,
        showCameras,
        hydrophoneLocations,
        showHydrophones,
        poiItems,
        poiFilters,
        pulseSelectedPlaceMarker,
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

        try {
          await ensurePlannerLocationLayers(map, baseData);
        } catch (error) {
          // A secondary map can finish loading its basemap while optional symbol
          // layers are still unavailable. DOM pins do not depend on those layers,
          // so keep rendering them instead of aborting the entire marker setup.
          console.warn(
            "[Map] optional planner layers were unavailable; using DOM markers",
            error,
          );
        }
        if (cancelled || mapRef.current !== map) return;

        const poiFeatureCount = baseData.features.filter(
          (feature) => feature.properties?.kind === "poi",
        ).length;
        const cameraFeatureCount = baseData.features.filter(
          (feature) => feature.properties?.kind === "camera",
        ).length;
        const gpuMarkerKinds: PlannerLocationKind[] = [
          "poi",
          "camera",
          "hydrophone",
        ];
        const hasGpuMarkers = baseData.features.some((feature) =>
          gpuMarkerKinds.includes(
            feature.properties?.kind as PlannerLocationKind,
          ),
        );
        const hasSelectedGpuMarker = baseData.features.some(
          (feature) =>
            feature.properties?.selected === true &&
            gpuMarkerKinds.includes(
              feature.properties?.kind as PlannerLocationKind,
            ),
        );
        const gpuMarkerFilter = [
          "match",
          ["get", "kind"],
          gpuMarkerKinds,
          true,
          false,
        ] as maplibregl.FilterSpecification;

        // Keep every supplemental POI in one GPU-rendered pin system. Besides
        // keeping zoom smooth with "All POIs", this prevents cameras and
        // hydrophones from looking or stacking differently from place markers.
        [
          PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID,
          PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID,
        ].forEach((layerId) => {
          if (map.getLayer(layerId))
            map.setLayoutProperty(layerId, "visibility", "none");
        });
        if (map.getLayer(PLANNER_LOCATION_HALO_LAYER_ID)) {
          map.setFilter(PLANNER_LOCATION_HALO_LAYER_ID, [
            "all",
            ["match", ["get", "kind"], gpuMarkerKinds, true, false],
            ["==", ["get", "selected"], true],
          ] as maplibregl.FilterSpecification);
          map.setLayoutProperty(
            PLANNER_LOCATION_HALO_LAYER_ID,
            "visibility",
            hasSelectedGpuMarker && pulseSelectedPlaceMarker
              ? "visible"
              : "none",
          );
        }
        [
          PLANNER_LOCATION_CIRCLE_LAYER_ID,
          PLANNER_LOCATION_SYMBOL_LAYER_ID,
        ].forEach((layerId) => {
          if (!map.getLayer(layerId)) return;
          map.setFilter(layerId, gpuMarkerFilter);
          map.setLayoutProperty(
            layerId,
            "visibility",
            hasGpuMarkers ? "visible" : "none",
          );
        });
        if (containerRef.current) {
          containerRef.current.dataset.plannerPoiCount =
            String(poiFeatureCount);
          containerRef.current.dataset.plannerCameraCount =
            String(cameraFeatureCount);
          containerRef.current.dataset.plannerPulsingLocation =
            baseData.features.find(
              (feature) =>
                feature.properties?.selected === true &&
                feature.properties?.pulseEnabled === true,
            )?.properties?.id ?? "";
        }

        // Camera and hydrophone live indicators are already visible in their
        // static pin artwork. Only rebuild the source while an explicitly
        // selected place is pulsing; merely showing either layer must not
        // trigger a full GeoJSON update every 900 ms.
        if (selectedPlaceId && pulseSelectedPlaceMarker) {
          let pulseOn = true;
          const source = getGeoJsonSource(map, PLANNER_LOCATION_SOURCE_ID);
          source?.setData(withPlannerLocationPulse(baseData, pulseOn));
          pulseIntervalId = window.setInterval(() => {
            pulseOn = !pulseOn;
            source?.setData(withPlannerLocationPulse(baseData, pulseOn));
          }, 900);
        }

        const placesById = new Map(
          suggestedPlaces.map((place) => [place.id, place]),
        );
        const camerasById = new Map(
          cameraLocations.map((camera) => [`camera:${camera.id}`, camera]),
        );
        const poisById = new Map(
          poiItems.map((poi) => [getPublicPoiFeatureId(poi), poi]),
        );
        const hydrophonesById = new Map(
          hydrophoneLocations.map((hydrophone) => [
            `hydrophone:${hydrophone.id}`,
            hydrophone,
          ]),
        );

        const popupHtmlForFeature = (
          feature: NonNullable<MapLayerMouseEvent["features"]>[number],
        ) => {
          const properties = feature.properties ?? {};
          const id = typeof properties.id === "string" ? properties.id : null;
          const kind =
            typeof properties.kind === "string" ? properties.kind : null;
          if (id && placesById.has(id))
            return getSuggestedPlacePopupHtml(placesById.get(id)!);
          if (id && kind === "poi" && poisById.has(id))
            return `<span class="plannerMapHoverLabel">${escapePopupHtml(poisById.get(id)!.name)}</span>`;
          if (kind === "base" && baseLocation)
            return getBaseLocationPopupHtml(baseLocation);
          return "";
        };

        const hoverHtmlForFeature = (
          feature: NonNullable<MapLayerMouseEvent["features"]>[number],
        ) => {
          const name = feature.properties?.name;
          return typeof name === "string" && name.trim()
            ? `<span class="plannerMapHoverLabel">${escapePopupHtml(name)}</span>`
            : "";
        };

        const bringHoverPopupToFront = () => {
          const element = hoverPopup.getElement();
          if (!element) return;
          element.style.setProperty("z-index", "2147483647", "important");
          // MapLibre appends markers and popups to the same map container. Moving
          // the active title to the end makes it the final overlay even when a
          // marker implementation creates its own stacking context.
          map.getContainer().append(element);
        };

        for (const feature of baseData.features) {
          if (feature.geometry?.type !== "Point" || !feature.properties)
            continue;
          const properties =
            feature.properties as PlannerLocationFeatureProperties;
          if (gpuMarkerKinds.includes(properties.kind)) continue;
          if (forceDomSuggestedMarkers && properties.kind === "suggested")
            continue;
          const coordinates = feature.geometry.coordinates as [number, number];
          const element = createPlannerDomMarker(properties);
          element.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const place = placesById.get(properties.id);
            if (place) {
              onPlaceSelect?.(place);
              return;
            }
            if (properties.kind === "camera") {
              const camera = camerasById.get(properties.id);
              if (camera) onCameraSelect?.(camera);
            } else if (properties.kind === "hydrophone") {
              const hydrophone = hydrophonesById.get(properties.id);
              if (hydrophone) onHydrophoneSelect?.(hydrophone);
            } else if (properties.kind === "poi") {
              const poi = poisById.get(properties.id);
              if (poi) onPoiSelect?.(poi);
            } else if (properties.kind === "base" && baseLocation) {
              popup
                .setLngLat(coordinates)
                .setHTML(getBaseLocationPopupHtml(baseLocation))
                .addTo(map);
            }
          });
          domMarkers.push(
            new maplibregl.Marker({ element, anchor: "bottom" })
              .setLngLat(coordinates)
              .addTo(map),
          );
        }

        const handlePlannerLocationClick = (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry?.type !== "Point") return;
          const id =
            typeof feature.properties?.id === "string"
              ? feature.properties.id
              : null;
          const place = id ? placesById.get(id) : null;
          const poi = id ? poisById.get(id) : null;
          event.originalEvent.stopPropagation();
          if (place) {
            onPlaceSelect?.(place);
            return;
          }
          const camera = id ? camerasById.get(id) : null;
          if (camera) {
            hoverPopup.remove();
            onCameraSelect?.(camera);
            return;
          }
          const hydrophone = id ? hydrophonesById.get(id) : null;
          if (hydrophone) {
            hoverPopup.remove();
            onHydrophoneSelect?.(hydrophone);
            return;
          }
          if (poi) {
            hoverPopup.remove();
            onPoiSelect?.(poi);
            return;
          }
          const html = popupHtmlForFeature(feature);
          if (!html) return;
          popup
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setHTML(html)
            .addTo(map);
        };

        const handlePlannerLocationMouseEnter = () => {
          map.getCanvas().style.cursor = "pointer";
        };

        const handlePlannerLocationMouseMove = (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature || feature.geometry?.type !== "Point") return;
          const html = hoverHtmlForFeature(feature);
          if (!html) return;
          hoverPopup
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setHTML(html)
            .addTo(map);
          bringHoverPopupToFront();
        };

        const handlePlannerLocationMouseLeave = () => {
          map.getCanvas().style.cursor = "";
          hoverPopup.remove();
        };

        const handleMapBackgroundClick = (event: maplibregl.MapMouseEvent) => {
          const clickedLocation = map.queryRenderedFeatures(event.point, {
            layers: [
              PLANNER_LOCATION_CIRCLE_LAYER_ID,
              PLANNER_LOCATION_SYMBOL_LAYER_ID,
            ],
          }).length;
          if (clickedLocation === 0) onLocationSelectionClear?.();
        };

        map.on(
          "click",
          PLANNER_LOCATION_CIRCLE_LAYER_ID,
          handlePlannerLocationClick,
        );
        map.on(
          "mouseenter",
          PLANNER_LOCATION_CIRCLE_LAYER_ID,
          handlePlannerLocationMouseEnter,
        );
        map.on(
          "mousemove",
          PLANNER_LOCATION_CIRCLE_LAYER_ID,
          handlePlannerLocationMouseMove,
        );
        map.on(
          "mouseleave",
          PLANNER_LOCATION_CIRCLE_LAYER_ID,
          handlePlannerLocationMouseLeave,
        );
        map.on("click", handleMapBackgroundClick);

        removeHandlers = () => {
          if (pulseIntervalId !== null) {
            window.clearInterval(pulseIntervalId);
            pulseIntervalId = null;
          }
          map.off(
            "click",
            PLANNER_LOCATION_CIRCLE_LAYER_ID,
            handlePlannerLocationClick,
          );
          map.off(
            "mouseenter",
            PLANNER_LOCATION_CIRCLE_LAYER_ID,
            handlePlannerLocationMouseEnter,
          );
          map.off(
            "mousemove",
            PLANNER_LOCATION_CIRCLE_LAYER_ID,
            handlePlannerLocationMouseMove,
          );
          map.off(
            "mouseleave",
            PLANNER_LOCATION_CIRCLE_LAYER_ID,
            handlePlannerLocationMouseLeave,
          );
          map.off("click", handleMapBackgroundClick);
          domMarkers.forEach((marker) => marker.remove());
          popup.remove();
          hoverPopup.remove();
        };
      };

      void setupPlannerLocationLayer();

      return () => {
        cancelled = true;
        if (pulseIntervalId !== null) {
          window.clearInterval(pulseIntervalId);
        }
        removeHandlers?.();
        domMarkers.forEach((marker) => marker.remove());
        popup.remove();
        hoverPopup.remove();
      };
    }, [
      baseLocation,
      cameraLocations,
      forceDomSuggestedMarkers,
      hydrophoneLocations,
      itineraryPlaceIds,
      mapReady,
      onPlaceSelect,
      onCameraSelect,
      onHydrophoneSelect,
      onPoiSelect,
      onLocationSelectionClear,
      poiFilters,
      poiItems,
      pulseSelectedPlaceMarker,
      selectedCameraId,
      selectedHydrophoneId,
      selectedPlaceId,
      showCameras,
      showHydrophones,
      showTripHotspotMarkers,
      styleUrl,
      suggestedPlaces,
    ]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;

      const data = buildMaxTravelRadiusCollection(
        baseLocation,
        maxTravelDistanceMiles,
      );
      if (!upsertGeoJsonSource(map, PLANNER_MAX_TRAVEL_SOURCE_ID, data)) return;

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
      const selected = suggestedPlaces.find(
        (place) => place.id === selectedPlaceId,
      );
      if (!selected) return;
      const center = getPointCoordinates(selected.latitude, selected.longitude);
      if (!center) return;
      map.flyTo({
        center,
        zoom: Math.max(map.getZoom(), 11),
        duration: mapMotionDuration(850),
        essential: false,
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
      <div
        className={`mapStage${pulseAllGridCells ? " mapStage--tripLoading" : ""}`}
        data-map-ready={mapReady ? "true" : "false"}
      >
        <div ref={containerRef} className="map" data-tour="map-canvas" />
        {accessiblePoiItems.length > 0 ? (
          <label className="mapLocationPicker">
            <span>Browse map locations</span>
            <select
              value=""
              onChange={(event) =>
                handleAccessiblePoiSelect(event.target.value)
              }
            >
              <option value="">
                Choose a location ({accessiblePoiItems.length})
              </option>
              {accessiblePoiItems.map((poi) => (
                <option
                  key={getPublicPoiFeatureId(poi)}
                  value={getPublicPoiFeatureId(poi)}
                >
                  {poi.name} — {poi.type}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="visuallyHidden" role="status" aria-live="polite">
          {accessibleLocationAnnouncement}
        </div>
        {pulseAllGridCells && (
          <div className="mapStage__tripLoading" aria-live="polite">
            <span className="mapStage__tripLoadingIcon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              {mapModeLabel ??
                "Choose dates to build a seasonal occurrence map"}
            </span>
          </div>
        )}
        {showMapControls ? (
          <MapControls
            hasForecastLegend={showLegendControl && hasForecastLegend}
            legendOpen={showLegendControl && legendOpen}
            legendSpec={legendSpec}
            onLegendToggle={() => setLegendOpen((value) => !value)}
            onZoomIn={() =>
              mapRef.current?.zoomIn({ duration: mapMotionDuration(180) })
            }
            onZoomOut={() =>
              mapRef.current?.zoomOut({ duration: mapMotionDuration(180) })
            }
          />
        ) : null}
      </div>
    );
  },
);
