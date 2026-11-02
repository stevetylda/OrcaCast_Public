import type { FeatureCollection } from "geojson";
import { Map as MapLibreMap } from "maplibre-gl";
import type { OrcasoundHydrophone } from "../../shared/data/orcasoundHydrophones";
import {
  filterPoisByType,
  hasActivePoiFilter,
  type PoiFilters,
  type PublicPoi,
} from "../locations/poiData";
import type { SuggestedPlace, WebcamSite } from "../locations/types";
import type { LngLat } from "./types";
export const PLANNER_LOCATION_SOURCE_ID = "planner-location-points";

export const PLANNER_LOCATION_HALO_LAYER_ID = "planner-location-points-halo";

export const PLANNER_LOCATION_CIRCLE_LAYER_ID =
  "planner-location-points-circle";

export const PLANNER_LOCATION_SYMBOL_LAYER_ID =
  "planner-location-points-symbol";

export const PLANNER_LOCATION_ITINERARY_BADGE_LAYER_ID =
  "planner-location-points-itinerary-badge";

export const PLANNER_LOCATION_ITINERARY_TEXT_LAYER_ID =
  "planner-location-points-itinerary-text";

export const PLANNER_MAX_TRAVEL_SOURCE_ID = "planner-max-travel-radius";

export const PLANNER_MAX_TRAVEL_LAYER_ID = "planner-max-travel-radius-line";

export type PlannerLocationKind =
  "base" | "suggested" | "poi" | "hydrophone" | "camera";

type PlannerLocationType =
  SuggestedPlace["type"] | PublicPoi["type"] | "Base" | "Hydrophone" | "Camera";

export type PlannerLocationFeatureProperties = {
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

export function getPointCoordinates(
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

export function getPlannerLocationIconName(
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

export function createPlannerDomMarker(
  properties: PlannerLocationFeatureProperties,
) {
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

export function escapePopupHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getSuggestedPlacePopupHtml(place: SuggestedPlace) {
  return `<div class="poiPopup"><div class="poiPopup__title">${escapePopupHtml(place.name)}</div><div class="poiPopup__meta">Recommended ${escapePopupHtml(formatSuggestedPlaceType(place.type))} · mean nearby score ${Number(place.score).toFixed(3)} · ${Number(place.latitude).toFixed(4)}, ${Number(place.longitude).toFixed(4)}</div></div>`;
}

export function getBaseLocationPopupHtml(baseLocation: {
  name: string;
  latitude: number;
  longitude: number;
}) {
  return `<div class="poiPopup"><div class="poiPopup__title">${escapePopupHtml(baseLocation.name)}</div><div class="poiPopup__meta">Base location · ${Number(baseLocation.latitude).toFixed(4)}, ${Number(baseLocation.longitude).toFixed(4)}</div></div>`;
}

export function buildPlannerLocationCollection(args: {
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

export function getGeoJsonSource(map: MapLibreMap, sourceId: string) {
  return map.getSource(sourceId) as
    { setData: (data: FeatureCollection) => void } | undefined;
}

export function upsertGeoJsonSource(
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

export function buildMaxTravelRadiusCollection(
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

export function withPlannerLocationPulse(
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

export async function ensurePlannerLocationLayers(
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

export function bringPlannerLocationLayersToFront(map: MapLibreMap) {
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

export function getPublicPoiFeatureId(poi: PublicPoi) {
  return `poi-${getLocationMarkerKey(poi)}`;
}

function formatSuggestedPlaceType(type: SuggestedPlace["type"]) {
  if (type === "Ferry") return "Ferry terminal";
  return type;
}
