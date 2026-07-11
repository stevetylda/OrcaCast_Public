import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ForecastMap, type ForecastMapHandle, type ForecastMapProps } from "../../features/map";
import { appConfig } from "../../shared/config/appConfig";
import { DEFAULT_RECOMMENDATION_RADIUS_MILES } from "../../shared/config/planner";
import { AppHeader } from "../../shared/components/AppHeader";
import { SwimmingOrcaLoader } from "../../shared/components/SwimmingOrcaLoader";
import {
  buildTripPlannerRangeFromDates,
} from "../../shared/data/tripPlanner";
import { useMenu } from "../../shared/state/MenuContext";
import { useMapState, type UnitsMode } from "../../shared/state/MapStateContext";
import { useSuggestedPlaces } from "../../features/watch/hooks/useSuggestedPlaces";
import type { SuggestedPlace } from "../../features/locations/types";
import { isoWeekFromDate, isoWeekYearFromDate } from "../../shared/time/forecastPeriodToIsoWeek";
import { PALETTES } from "../../shared/geo/palettes";
import { H3ResolutionPill } from "../../features/watch/components/H3ResolutionPill";
import type { TripPlanSelection } from "../../features/planner/model/plannerTypes";
import {
  clearStoredPlannerState,
  PLANNER_RECOMMENDED_PLACES_STORAGE_KEY,
  readStoredPlannerDraft,
  readStoredPlannerOpen,
  readStoredPlannerSelection,
} from "../../features/planner/model/plannerStorage";
import {
  formatPlannerDistanceLabel,
  formatPlannerDistanceValue,
  parsePlannerDistanceInput,
} from "../../features/planner/model/plannerDistance";
import { buildHighlightedDays } from "../../features/seasonal-activity/seasonalActivity";
import {
  PlannerDateRangeField,
  PlannerLocationField,
} from "../../features/planner/components/PlannerFields";
import { PlannerFerryLoader } from "../../features/planner/components/PlannerFerryLoader";
import {
  PlannerLoadingState,
  PlannerPlaceCard,
  PlannerPlaceDetailView,
} from "../../features/planner/components/PlannerPlaces";
import { usePlannerPersistence } from "../../features/planner/hooks/usePlannerPersistence";
import { usePlannerReferenceData } from "../../features/planner/hooks/usePlannerReferenceData";
import { useTripOccurrence } from "../../features/planner/hooks/useTripOccurrence";
import {
  applyTripBrushDelta,
  buildChartWindowStyle,
  buildDailyBars,
  buildDailyMonthBands,
  buildDailyTicks,
  buildInteractiveTripWindowSegments,
  buildMonthTicks,
  buildRadiusFitLocations,
  computeActivityLabel,
  computeTopWaters,
  toWeekBars,
  type AxisTick,
  type ChartBar,
  type ChartZoomMode,
  type MonthBand,
  type TripBrushDragState,
  type TripBrushMode,
} from "../../features/planner/model/plannerChart";
import {
  buildItineraryCardSvg,
  rasterizeSvgToPngBlob,
} from "../../features/planner/exports/itineraryExport";
import "./PlanPage.css";

const InfoModal = lazy(() => import("../../shared/components/InfoModal").then((m) => ({ default: m.InfoModal })));

const DEFAULT_RECOMMENDED_SPOTS_COUNT = 25;
const TRIP_BRUSH_DAYS = 366;
const TRIP_BRUSH_APPLY_DELAY_MS = 2000;
const PLANNER_COLLAPSE_DURATION_MS = 320;
const PLANNER_REVEAL_MIN_DURATION_MS = 10_000;
const PLANNER_REVEAL_EXIT_DURATION_MS = 420;
const PLACE_DETAIL_MATCH_RADIUS_KM = 1.25;
const PLANNER_ITINERARY_STORAGE_KEY = "orcacast.planner.itinerary.v1";

type FieldPickFilter = "top" | "shore" | "Ferry" | "Marina" | "Park";
type PlannerSidebarMode = "overview" | "location-details" | "itinerary";

function formatViewingPotentialLabel(value: SuggestedPlace["viewingPotential"]) {
  if (value === "very-high") return "Very high";
  if (value === "very-low") return "Very low";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineKm(a: [number, number], b: [number, number]) {
  const [lonA, latA] = a;
  const [lonB, latB] = b;
  const dLat = toRadians(latB - latA);
  const dLon = toRadians(lonB - lonA);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const aa =
    sinLat * sinLat +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * sinLon * sinLon;
  return 6371 * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

type StoredPlannerRecommendedPlaces = {
  signature: string;
  places: SuggestedPlace[];
};

function pickLegendColors(colors: string[], colorNoData = false) {
  if (colors.length === 0) return ["#08364F", "#0B718D", "#278AA2", "#8EB5BD", "#D7E1DF"];
  const highToLowStops = colorNoData ? [1, 0.8, 0.6, 0.4, 0.2, 0] : [1, 0.75, 0.5, 0.25, 0];
  const sampled = highToLowStops.map((stop) => {
    const index = Math.max(0, Math.min(colors.length - 1, Math.round(stop * (colors.length - 1))));
    return colors[index];
  });
  return colorNoData ? sampled.slice(0, 5) : sampled;
}

function isSuggestedPlace(value: unknown): value is SuggestedPlace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SuggestedPlace>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.spotId === "string" &&
    typeof candidate.name === "string" &&
    (candidate.region === undefined || typeof candidate.region === "string") &&
    (candidate.type === "Park" || candidate.type === "Marina" || candidate.type === "Ferry" || candidate.type === "Other") &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    (
      candidate.viewingPotential === "very-low" ||
      candidate.viewingPotential === "low" ||
      candidate.viewingPotential === "medium" ||
      candidate.viewingPotential === "high" ||
      candidate.viewingPotential === "very-high"
    ) &&
    Number.isFinite(candidate.score) &&
    typeof candidate.reason === "string" &&
    (candidate.distanceKm === undefined || Number.isFinite(candidate.distanceKm))
  );
}

function buildRecommendedPlacesSignature(selection: TripPlanSelection | null, resolution: string) {
  if (!selection) return "";
  return JSON.stringify({
    city: selection.city,
    arrivalDate: selection.arrivalDate,
    departureDate: selection.departureDate,
    maxTravelDistanceMiles: selection.maxTravelDistanceMiles ?? null,
    resolution,
    limit: DEFAULT_RECOMMENDED_SPOTS_COUNT,
  });
}

function readStoredRecommendedPlaces(signature: string): SuggestedPlace[] {
  if (typeof window === "undefined" || !signature) return [];
  try {
    const raw = window.sessionStorage.getItem(PLANNER_RECOMMENDED_PLACES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredPlannerRecommendedPlaces> | null;
    if (!parsed || parsed.signature !== signature || !Array.isArray(parsed.places)) return [];
    return parsed.places.filter(isSuggestedPlace);
  } catch {
    return [];
  }
}


function formatDisplayDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const startLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(end);
  return `${startLabel} – ${endLabel}`;
}


export function PlannerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setMenuOpen } = useMenu();
  const {
    unitsMode,
    setUnitsMode,
    surfaceMode,
    setSurfaceMode,
    resolution,
    setResolution,
    selectedPaletteId,
    setSelectedPaletteId,
  } = useMapState();
  const resumeStoredPlan = useMemo(() => new URLSearchParams(location.search).get("resume") === "1", [location.search]);
  const [infoOpen, setInfoOpen] = useState(false);
  const storedSelection = useMemo(() => (resumeStoredPlan ? readStoredPlannerSelection() : null), [resumeStoredPlan]);
  const storedDraft = useMemo(() => (resumeStoredPlan ? readStoredPlannerDraft() : null), [resumeStoredPlan]);
  const [plannerSelection, setPlannerSelection] = useState<TripPlanSelection | null>(storedSelection);
  const [appliedPlannerSelection, setAppliedPlannerSelection] = useState<TripPlanSelection | null>(storedSelection);
  const [plannerOpen, setPlannerOpen] = useState(() => (resumeStoredPlan ? readStoredPlannerOpen(!storedSelection) : true));
  const [plannerCollapsing, setPlannerCollapsing] = useState(false);
  const [plannerEditingTransition, setPlannerEditingTransition] = useState(false);
  const [tripRevealPending, setTripRevealPending] = useState(false);
  const [revealMinimumElapsed, setRevealMinimumElapsed] = useState(false);
  const [renderedTripLoadKey, setRenderedTripLoadKey] = useState("");
  const [plannerMapLoadFailed, setPlannerMapLoadFailed] = useState(false);
  const [draftCity, setDraftCity] = useState(resumeStoredPlan ? storedDraft?.city ?? "" : "");
  const [draftArrivalDate, setDraftArrivalDate] = useState(resumeStoredPlan ? storedDraft?.arrivalDate ?? "" : "");
  const [draftDepartureDate, setDraftDepartureDate] = useState(resumeStoredPlan ? storedDraft?.departureDate ?? "" : "");
  const [draftMaxTravelDistance, setDraftMaxTravelDistance] = useState(() => {
    if (!resumeStoredPlan) return "";
    if (!storedDraft?.maxTravelDistance) return "";
    const storedUnitsMode = storedDraft.unitsMode ?? unitsMode;
    const miles = parsePlannerDistanceInput(storedDraft.maxTravelDistance, storedUnitsMode);
    return formatPlannerDistanceValue(miles, unitsMode);
  });
  const [formError, setFormError] = useState<string | null>(null);
  const {
    baseLocations,
    photoManifest,
    cameraLocations,
    hydrophoneLocations,
    hydrophoneListenUrl,
  } = usePlannerReferenceData();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [detailPlaceId, setDetailPlaceId] = useState<string | null>(null);
  const [fieldPickFilter, setFieldPickFilter] = useState<FieldPickFilter>("top");
  const [chartCollapsed, setChartCollapsed] = useState(true);
  const [spotsCollapsed, setSpotsCollapsed] = useState(true);
  const [sidebarMode, setSidebarMode] = useState<PlannerSidebarMode>("overview");
  const [itineraryPlaceIds, setItineraryPlaceIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(PLANNER_ITINERARY_STORAGE_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
      return [];
    }
  });
  const [itineraryExpanded, setItineraryExpanded] = useState(false);
  const [itineraryExportOpen, setItineraryExportOpen] = useState(false);
  const [itineraryMapViewActive, setItineraryMapViewActive] = useState(false);
  const [pulseSelectedPlaceMarker, setPulseSelectedPlaceMarker] = useState(false);
  const [draggingItineraryPlaceId, setDraggingItineraryPlaceId] = useState<string | null>(null);
  const [itineraryDropTargetId, setItineraryDropTargetId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [placesMenuOpen, setPlacesMenuOpen] = useState(false);
  const [topPlacesVisible, setTopPlacesVisible] = useState(true);
  const [camerasVisible, setCamerasVisible] = useState(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [hydrophonesVisible, setHydrophonesVisible] = useState(false);
  const [selectedHydrophoneId, setSelectedHydrophoneId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const tripHotspotsVisible = true;
  const [poiFilters, setPoiFilters] = useState({ Park: false, Marina: false, Ferry: false });
  const [shareBusy, setShareBusy] = useState(false);
  const [itineraryShareMenuOpen, setItineraryShareMenuOpen] = useState(false);
  const [tripBrushMode, setTripBrushMode] = useState<TripBrushMode | null>(null);
  const [chartZoomMode, setChartZoomMode] = useState<ChartZoomMode>("weekly");
  const primaryMapRef = useRef<ForecastMapHandle | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const legendPaletteRef = useRef<HTMLElement | null>(null);
  const chartPlotRef = useRef<HTMLDivElement | null>(null);
  const tripBrushDragRef = useRef<TripBrushDragState | null>(null);
  const tripBrushApplyTimerRef = useRef<number | null>(null);
  const tripBrushPendingApplyRef = useRef(false);
  const plannerCollapseTimerRef = useRef<number | null>(null);
  const plannerEditTimerRef = useRef<number | null>(null);
  const previousUnitsModeRef = useRef<UnitsMode>(unitsMode);
  const handlePlannerMapFatalError = useCallback(() => setPlannerMapLoadFailed(true), []);

  usePlannerPersistence({
    selection: plannerSelection,
    plannerOpen,
    draftCity,
    draftArrivalDate,
    draftDepartureDate,
    draftMaxTravelDistance,
    unitsMode,
  });

  useEffect(() => {
    return () => {
      if (plannerEditTimerRef.current !== null) {
        window.clearTimeout(plannerEditTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!tripRevealPending) return;
    const timerId = window.setTimeout(() => {
      setRevealMinimumElapsed(true);
    }, PLANNER_REVEAL_MIN_DURATION_MS);
    return () => window.clearTimeout(timerId);
  }, [tripRevealPending]);

  useEffect(() => {
    if (resumeStoredPlan) return;
    clearStoredPlannerState();
    if (location.search) navigate("/planner", { replace: true });
  }, [location.search, navigate, resumeStoredPlan]);

  const downloadSnapshot = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const toFileSafeToken = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "model";

  const tripRange = useMemo(
    () => (plannerSelection ? buildTripPlannerRangeFromDates(plannerSelection.arrivalDate, plannerSelection.departureDate) : null),
    [plannerSelection]
  );
  const plannerSubmitted = !!plannerSelection && !!tripRange;
  const appliedTripRange = useMemo(
    () =>
      appliedPlannerSelection
        ? buildTripPlannerRangeFromDates(appliedPlannerSelection.arrivalDate, appliedPlannerSelection.departureDate)
        : null,
    [appliedPlannerSelection]
  );
  const appliedPlannerSubmitted = !!appliedPlannerSelection && !!appliedTripRange;
  const {
    occurrence: tripOccurrence,
    loading: tripLoading,
    error: occurrenceError,
  } = useTripOccurrence(appliedTripRange, resolution);
  const tripError = formError ?? occurrenceError;

  useEffect(() => {
    if (tripBrushApplyTimerRef.current) {
      window.clearTimeout(tripBrushApplyTimerRef.current);
      tripBrushApplyTimerRef.current = null;
    }

    if (!plannerSelection) {
      setAppliedPlannerSelection(null);
      tripBrushPendingApplyRef.current = false;
      return;
    }

    if (!tripBrushPendingApplyRef.current) {
      setAppliedPlannerSelection(plannerSelection);
      return;
    }

    tripBrushApplyTimerRef.current = window.setTimeout(() => {
      setAppliedPlannerSelection(plannerSelection);
      tripBrushPendingApplyRef.current = false;
      tripBrushApplyTimerRef.current = null;
    }, TRIP_BRUSH_APPLY_DELAY_MS);

    return () => {
      if (tripBrushApplyTimerRef.current) {
        window.clearTimeout(tripBrushApplyTimerRef.current);
        tripBrushApplyTimerRef.current = null;
      }
    };
  }, [plannerSelection]);


  useEffect(() => {
    if (baseLocations.length === 0) return;
    const validNames = new Set(baseLocations.map((location) => location.name));

    if (draftCity && !validNames.has(draftCity)) {
      setDraftCity("");
    }

    setPlannerSelection((current) => {
      if (!current) return current;
      return validNames.has(current.city) ? current : null;
    });
  }, [baseLocations, draftCity]);

  useEffect(
    () => () => {
      if (plannerCollapseTimerRef.current) {
        window.clearTimeout(plannerCollapseTimerRef.current);
        plannerCollapseTimerRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (previousUnitsModeRef.current === unitsMode) return;
    setDraftMaxTravelDistance((current) => {
      const miles = parsePlannerDistanceInput(current, previousUnitsModeRef.current);
      return formatPlannerDistanceValue(miles, unitsMode);
    });
    previousUnitsModeRef.current = unitsMode;
  }, [unitsMode]);

  const baseLocationsByName = useMemo(
    () => new Map(baseLocations.map((location) => [location.name, location])),
    [baseLocations]
  );
  const activeBaseLocation = useMemo(() => {
    const appliedName = appliedPlannerSelection?.city ?? "";
    return baseLocationsByName.get(appliedName) ?? null;
  }, [appliedPlannerSelection?.city, baseLocationsByName]);

  const recommendedPlacesData = useSuggestedPlaces({
    resolution,
    modelId: appConfig.compositeModelId,
    externalValues: tripOccurrence?.values,
    enabled: appliedPlannerSubmitted && !tripLoading && !!tripOccurrence,
    limit: DEFAULT_RECOMMENDED_SPOTS_COUNT,
    baseLocation: activeBaseLocation,
    maxTravelDistanceMiles: appliedPlannerSelection?.maxTravelDistanceMiles,
  });

  const recommendedPlacesSignature = useMemo(
    () => buildRecommendedPlacesSignature(appliedPlannerSelection, resolution),
    [appliedPlannerSelection, resolution]
  );
  const recommendedPlaces = recommendedPlacesData.places;
  const cachedRecommendedPlaces = useMemo(
    () => (resumeStoredPlan ? readStoredRecommendedPlaces(recommendedPlacesSignature) : []),
    [recommendedPlacesSignature, resumeStoredPlan]
  );
  const displayedRecommendedPlaces =
    recommendedPlaces.length > 0
      ? recommendedPlaces
      : plannerSubmitted && (tripLoading || recommendedPlacesData.isLoading)
        ? cachedRecommendedPlaces
        : recommendedPlaces;
  const recommendedPlacesLoading = appliedPlannerSubmitted && (tripLoading || recommendedPlacesData.isLoading);
  const plannerResourcesReady =
    Boolean(tripError) ||
    (
      appliedPlannerSubmitted &&
      !tripLoading &&
      !!tripOccurrence &&
      !recommendedPlacesData.isLoading &&
      (renderedTripLoadKey === recommendedPlacesSignature || plannerMapLoadFailed)
    );
  const plannerRevealComplete = tripRevealPending && revealMinimumElapsed && plannerResourcesReady;

  useEffect(() => {
    if (!plannerRevealComplete) return;
    const timerId = window.setTimeout(() => {
      setTripRevealPending(false);
      setRevealMinimumElapsed(false);
    }, PLANNER_REVEAL_EXIT_DURATION_MS);
    return () => window.clearTimeout(timerId);
  }, [plannerRevealComplete]);

  const fieldPickPlaces = useMemo(() => {
    if (fieldPickFilter === "top") return displayedRecommendedPlaces;
    if (fieldPickFilter === "shore") return displayedRecommendedPlaces.filter((place) => place.type === "Other");
    return displayedRecommendedPlaces.filter((place) => place.type === fieldPickFilter);
  }, [displayedRecommendedPlaces, fieldPickFilter]);
  const chartLoading = appliedPlannerSubmitted && tripLoading && !tripOccurrence;
  const selectedPlace = useMemo(
    () => displayedRecommendedPlaces.find((place) => place.id === selectedPlaceId) ?? null,
    [displayedRecommendedPlaces, selectedPlaceId]
  );
  const detailPlace = useMemo(
    () => displayedRecommendedPlaces.find((place) => place.id === detailPlaceId) ?? null,
    [detailPlaceId, displayedRecommendedPlaces]
  );
  const detailPlaceCameras = useMemo(() => {
    if (!detailPlace) return [];
    return cameraLocations.filter(
      (camera) =>
        haversineKm(
          [detailPlace.longitude, detailPlace.latitude],
          [camera.longitude, camera.latitude]
        ) <= PLACE_DETAIL_MATCH_RADIUS_KM
    );
  }, [cameraLocations, detailPlace]);
  const detailPlaceHydrophones = useMemo(() => {
    if (!detailPlace) return [];
    return hydrophoneLocations.filter(
      (hydrophone) =>
        haversineKm(
          [detailPlace.longitude, detailPlace.latitude],
          [hydrophone.longitude, hydrophone.latitude]
        ) <= PLACE_DETAIL_MATCH_RADIUS_KM
    );
  }, [detailPlace, hydrophoneLocations]);
  const itineraryPlaces = useMemo(
    () => itineraryPlaceIds.map((id) => displayedRecommendedPlaces.find((place) => place.id === id)).filter(Boolean) as SuggestedPlace[],
    [displayedRecommendedPlaces, itineraryPlaceIds]
  );
  const mapSuggestedPlaces = useMemo(
    () => (itineraryMapViewActive ? itineraryPlaces : topPlacesVisible ? displayedRecommendedPlaces : []),
    [displayedRecommendedPlaces, itineraryMapViewActive, itineraryPlaces, topPlacesVisible]
  );
  const visiblePlannerMapLocations = useMemo(
    () => [
      ...mapSuggestedPlaces.map((place) => [place.longitude, place.latitude] as [number, number]),
      ...(camerasVisible ? cameraLocations.map((camera) => [camera.longitude, camera.latitude] as [number, number]) : []),
      ...(hydrophonesVisible
        ? hydrophoneLocations.map((hydrophone) => [hydrophone.longitude, hydrophone.latitude] as [number, number])
        : []),
    ],
    [cameraLocations, camerasVisible, hydrophoneLocations, hydrophonesVisible, mapSuggestedPlaces]
  );
  const visiblePlannerMapLocationsSignature = useMemo(
    () => visiblePlannerMapLocations.map(([longitude, latitude]) => `${longitude.toFixed(4)},${latitude.toFixed(4)}`).join("|"),
    [visiblePlannerMapLocations]
  );
  const lastPlannerMarkerViewportRef = useRef<string | null>(null);

  useEffect(() => {
    if (!plannerSubmitted || tripLoading || visiblePlannerMapLocations.length === 0) return;
    if (lastPlannerMarkerViewportRef.current === visiblePlannerMapLocationsSignature) return;

    lastPlannerMarkerViewportRef.current = visiblePlannerMapLocationsSignature;
    primaryMapRef.current?.fitLocations(visiblePlannerMapLocations, {
      // The planner is a map-first composition with panels around the edges.
      // Reserve their space so the active location markers land in the visible map window.
      padding: { top: 112, right: 120, bottom: 300, left: 470 },
      maxZoom: 10,
    });
  }, [plannerSubmitted, tripLoading, visiblePlannerMapLocations, visiblePlannerMapLocationsSignature]);

  const handleAddPlaceToItinerary = (place: SuggestedPlace) => {
    setItineraryPlaceIds((current) => (current.includes(place.id) ? current : [...current, place.id]));
  };

  const handleRemovePlaceFromItinerary = (placeId: string) => {
    setItineraryPlaceIds((current) => {
      const next = current.filter((id) => id !== placeId);
      if (next.length === 0) setItineraryExpanded(false);
      return next;
    });
  };

  const handleOpenPlaceDetails = (place: SuggestedPlace) => {
    setSpotsCollapsed(false);
    setSidebarMode("location-details");
    setDetailPlaceId(place.id);
    setItineraryMapViewActive(false);
    setPulseSelectedPlaceMarker(true);
    setSelectedPlaceId(place.id);
    setCamerasVisible(false);
    setSelectedCameraId(null);
    setHydrophonesVisible(false);
    setSelectedHydrophoneId(null);
    primaryMapRef.current?.fitLocations([[place.longitude, place.latitude]], {
      padding: 120,
      maxZoom: 11.5,
    });
  };

  const handleSelectItineraryPlace = (place: SuggestedPlace) => {
    setPulseSelectedPlaceMarker(false);
    setSelectedPlaceId(place.id);
    setItineraryMapViewActive(true);
    primaryMapRef.current?.fitLocations([[place.longitude, place.latitude]], {
      padding: { top: 112, right: 120, bottom: 260, left: 430 },
      maxZoom: 11.2,
    });
  };

  const handleItineraryDragStart = (placeId: string, event: ReactDragEvent<HTMLElement>) => {
    setDraggingItineraryPlaceId(placeId);
    setItineraryDropTargetId(placeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", placeId);
  };

  const handleItineraryDragOver = (placeId: string, event: ReactDragEvent<HTMLDivElement>) => {
    if (!draggingItineraryPlaceId || draggingItineraryPlaceId === placeId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (itineraryDropTargetId !== placeId) {
      setItineraryDropTargetId(placeId);
    }
  };

  const handleItineraryDrop = (targetPlaceId: string, event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourcePlaceId = draggingItineraryPlaceId ?? event.dataTransfer.getData("text/plain");
    if (!sourcePlaceId || sourcePlaceId === targetPlaceId) {
      setDraggingItineraryPlaceId(null);
      setItineraryDropTargetId(null);
      return;
    }

    setItineraryPlaceIds((current) => {
      const sourceIndex = current.indexOf(sourcePlaceId);
      const targetIndex = current.indexOf(targetPlaceId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });

    setDraggingItineraryPlaceId(null);
    setItineraryDropTargetId(null);
  };

  const handleItineraryDragEnd = () => {
    setDraggingItineraryPlaceId(null);
    setItineraryDropTargetId(null);
  };

  useEffect(() => {
    if (!plannerSubmitted) {
      setSelectedPlaceId(null);
      setDetailPlaceId(null);
      setItineraryPlaceIds([]);
      setSidebarMode("overview");
      setItineraryMapViewActive(false);
      setPulseSelectedPlaceMarker(false);
      if (typeof window !== "undefined") window.sessionStorage.removeItem(PLANNER_ITINERARY_STORAGE_KEY);
      return;
    }

    if (selectedPlaceId && !displayedRecommendedPlaces.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(null);
      setPulseSelectedPlaceMarker(false);
    }
    if (detailPlaceId && !displayedRecommendedPlaces.some((place) => place.id === detailPlaceId)) {
      setDetailPlaceId(null);
    }
    setItineraryPlaceIds((current) => current.filter((id) => displayedRecommendedPlaces.some((place) => place.id === id)));
  }, [detailPlaceId, displayedRecommendedPlaces, plannerSubmitted, selectedPlaceId]);

  useEffect(() => {
    if (!plannerSubmitted || typeof window === "undefined") return;
    window.sessionStorage.setItem(PLANNER_ITINERARY_STORAGE_KEY, JSON.stringify(itineraryPlaceIds));
  }, [itineraryPlaceIds, plannerSubmitted]);

  useEffect(() => {
    if (sidebarMode === "location-details" && !detailPlace) {
      setSidebarMode("overview");
    }
  }, [detailPlace, sidebarMode]);

  useEffect(() => {
    if (!itineraryExportOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setItineraryExportOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [itineraryExportOpen]);

  useEffect(() => {
    if (!selectedPlaceId || typeof document === "undefined") return;
    const selectedRow = sidebarRef.current?.querySelector<HTMLElement>(`#field-pick-${CSS.escape(selectedPlaceId)}`);
    if (!selectedRow) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    selectedRow.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [fieldPickPlaces, selectedPlaceId]);

  useEffect(() => {
    if (itineraryPlaces.length === 0 && itineraryMapViewActive) {
      setItineraryMapViewActive(false);
    }
  }, [itineraryMapViewActive, itineraryPlaces.length]);

  useEffect(() => {
    if (typeof window === "undefined" || !recommendedPlacesSignature || recommendedPlaces.length === 0) return;
    window.sessionStorage.setItem(
      PLANNER_RECOMMENDED_PLACES_STORAGE_KEY,
      JSON.stringify({
        signature: recommendedPlacesSignature,
        places: recommendedPlaces,
      } satisfies StoredPlannerRecommendedPlaces)
    );
  }, [recommendedPlaces, recommendedPlacesSignature]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (legendPaletteRef.current?.contains(target)) return;
      setPaletteOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPaletteOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [paletteOpen]);

  useEffect(() => {
    if (!settingsOpen) setPaletteOpen(false);
  }, [settingsOpen]);

  const today = useMemo(() => new Date(), []);
  const selectedWeek = isoWeekFromDate(today);
  const selectedWeekYear = isoWeekYearFromDate(today);
  const highlightedDays = useMemo(
    () =>
      tripRange ? buildHighlightedDays(tripRange.startDayOfYear, tripRange.endDayOfYear, tripRange.crossesYear) : new Set<number>(),
    [tripRange]
  );
  const weekBars = useMemo(
    () => toWeekBars(tripOccurrence?.histogram ?? [], highlightedDays),
    [highlightedDays, tripOccurrence?.histogram]
  );
  const chartZoomedToDays = chartZoomMode === "daily" || tripBrushMode === "start" || tripBrushMode === "end";
  const chartBars = useMemo<ChartBar[]>(
    () =>
      chartZoomedToDays && tripRange
        ? buildDailyBars(tripOccurrence?.histogram ?? [], tripRange)
        : weekBars.map((bar) => ({ ...bar, dayOfYear: bar.index * 7 + 1 })),
    [chartZoomedToDays, tripOccurrence?.histogram, tripRange, weekBars]
  );
  const weeklyChartMax = Math.max(1, ...weekBars.map((bar) => bar.count));
  const chartMax = Math.max(1, ...chartBars.map((bar) => bar.count));
  const chartTicks = useMemo<AxisTick[]>(
    () => (chartZoomedToDays && tripRange ? buildDailyTicks(chartBars, tripRange) : buildMonthTicks(weekBars)),
    [chartBars, chartZoomedToDays, tripRange, weekBars]
  );
  const weeklyChartTicks = useMemo<AxisTick[]>(() => buildMonthTicks(weekBars), [weekBars]);
  const dailyMonthBands = useMemo<MonthBand[]>(
    () => (chartZoomedToDays && tripRange ? buildDailyMonthBands(chartBars, tripRange) : []),
    [chartBars, chartZoomedToDays, tripRange]
  );
  const chartWindowStyle = useMemo(() => buildChartWindowStyle(chartBars), [chartBars]);
  const chartColumnStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${Math.max(chartBars.length, 1)}, minmax(0, 1fr))` }),
    [chartBars.length]
  );
  const weeklyChartColumnStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${Math.max(weekBars.length, 1)}, minmax(0, 1fr))` }),
    [weekBars.length]
  );
  const tripWindowSegments = useMemo(() => buildInteractiveTripWindowSegments(tripRange, weekBars), [tripRange, weekBars]);
  const tripLabel = tripRange ? formatDisplayDateRange(tripRange.startDate, tripRange.endDate) : "Choose dates";
  const tripLengthLabel = tripRange ? `${tripRange.dayCount} ${tripRange.dayCount === 1 ? "day" : "days"}` : "";
  const tripCityLabel = plannerSelection?.city || "Base location";
  const tripDistanceLabel = formatPlannerDistanceLabel(plannerSelection?.maxTravelDistanceMiles, unitsMode);
  const activeMaxTravelDistanceMiles = appliedPlannerSelection?.maxTravelDistanceMiles ?? null;
  const selectedCount = tripOccurrence?.selectedCount ?? 0;
  const activityLabel = useMemo(() => computeActivityLabel(selectedCount, weekBars), [selectedCount, weekBars]);
  const topWatersLabel = useMemo(() => computeTopWaters(displayedRecommendedPlaces), [displayedRecommendedPlaces]);
  const paletteEntries = useMemo(() => Object.values(PALETTES), []);
  const allPoiLayersVisible =
    poiFilters.Park && poiFilters.Marina && poiFilters.Ferry && camerasVisible && hydrophonesVisible;
  const legendColors = useMemo(
    () => pickLegendColors(PALETTES[selectedPaletteId].colors, true),
    [selectedPaletteId]
  );

  useEffect(() => {
    if (!tripBrushMode) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = tripBrushDragRef.current;
      const plot = chartPlotRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !plot) return;

      const deltaX = event.clientX - drag.startX;
      const deltaDays = Math.round((deltaX / Math.max(plot.getBoundingClientRect().width, 1)) * TRIP_BRUSH_DAYS);
      const nextSelection = applyTripBrushDelta(drag.initialSelection, drag.mode, deltaDays);
      if (!nextSelection) return;

      setPlannerSelection((current) => {
        if (!current) return current;
        if (
          current.arrivalDate === nextSelection.arrivalDate &&
          current.departureDate === nextSelection.departureDate &&
          current.city === nextSelection.city &&
          current.maxTravelDistanceMiles === nextSelection.maxTravelDistanceMiles
        ) {
          return current;
        }
        return nextSelection;
      });
    };

    const stopDrag = (event?: PointerEvent) => {
      const drag = tripBrushDragRef.current;
      if (event && drag && drag.pointerId !== event.pointerId) return;
      tripBrushDragRef.current = null;
      setTripBrushMode(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [tripBrushMode]);

  const handleTripBrushPointerDown = (mode: TripBrushMode, event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (!plannerSelection || !tripRange) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (mode === "start" || mode === "end") {
      setChartZoomMode("daily");
    }
    tripBrushPendingApplyRef.current = true;
    tripBrushDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      initialSelection: plannerSelection,
    };
    setSelectedPlaceId(null);
    setTripBrushMode(mode);
  };
  const handlePlannerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftCity || !draftArrivalDate || !draftDepartureDate) return;

    if (!baseLocationsByName.has(draftCity)) {
      setFormError("Choose a base location from the available list.");
      return;
    }
    const selectedBaseLocation = baseLocationsByName.get(draftCity) ?? null;

    const range = buildTripPlannerRangeFromDates(draftArrivalDate, draftDepartureDate);
    if (!range) {
      setFormError("Departure must be on or after arrival.");
      return;
    }

    const parsedMaxTravelDistanceMiles = parsePlannerDistanceInput(draftMaxTravelDistance, unitsMode);
    if (tripBrushApplyTimerRef.current) {
      window.clearTimeout(tripBrushApplyTimerRef.current);
      tripBrushApplyTimerRef.current = null;
    }
    tripBrushPendingApplyRef.current = false;
    const nextSelection = {
      city: draftCity.trim(),
      arrivalDate: range.startDate,
      departureDate: range.endDate,
      // Keep the canonical value exact. Metric input is converted to miles here,
      // while rounding is reserved for display-only formatters.
      maxTravelDistanceMiles:
        typeof parsedMaxTravelDistanceMiles === "number" && Number.isFinite(parsedMaxTravelDistanceMiles) && parsedMaxTravelDistanceMiles > 0
          ? parsedMaxTravelDistanceMiles
          : undefined,
    } satisfies TripPlanSelection;
    setFormError(null);
    setTripRevealPending(true);
    setRevealMinimumElapsed(false);
    setRenderedTripLoadKey("");
    setPlannerMapLoadFailed(false);
    setPlannerSelection(nextSelection);
    setAppliedPlannerSelection(nextSelection);
    setChartZoomMode("weekly");
    setSelectedPlaceId(null);
    setChartCollapsed(false);
    setSpotsCollapsed(false);
    setSidebarMode("overview");
    setDetailPlaceId(null);
    if (plannerCollapseTimerRef.current) {
      window.clearTimeout(plannerCollapseTimerRef.current);
      plannerCollapseTimerRef.current = null;
    }
    setPlannerCollapsing(false);
    setPlannerOpen(false);
    setPlannerEditingTransition(false);

    if (selectedBaseLocation && nextSelection.maxTravelDistanceMiles) {
      primaryMapRef.current?.fitLocations(
        buildRadiusFitLocations(
          selectedBaseLocation.latitude,
          selectedBaseLocation.longitude,
          nextSelection.maxTravelDistanceMiles
        ),
        { padding: 144, maxZoom: 9.8 }
      );
    }
  };

  const openPlannerEditor = () => {
    if (plannerCollapseTimerRef.current) {
      window.clearTimeout(plannerCollapseTimerRef.current);
      plannerCollapseTimerRef.current = null;
    }
    setPlannerCollapsing(false);
    if (plannerEditTimerRef.current !== null) {
      window.clearTimeout(plannerEditTimerRef.current);
    }
    setDraftCity(plannerSelection?.city ?? "");
    setDraftArrivalDate(plannerSelection?.arrivalDate ?? "");
    setDraftDepartureDate(plannerSelection?.departureDate ?? "");
    setDraftMaxTravelDistance(formatPlannerDistanceValue(plannerSelection?.maxTravelDistanceMiles, unitsMode));
    setPlannerEditingTransition(true);
    setPlannerOpen(true);
    plannerEditTimerRef.current = window.setTimeout(() => {
      setPlannerEditingTransition(false);
      plannerEditTimerRef.current = null;
    }, PLANNER_COLLAPSE_DURATION_MS);
  };

  const handleItineraryDownloadAction = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const { svg, width, height } = buildItineraryCardSvg({
        tripCityLabel,
        tripLabel,
        tripLengthLabel,
        itineraryPlaces,
        weekBars,
      });
      const blob = await rasterizeSvgToPngBlob(svg, width, height);
      const fileName = `orcacast_itinerary_${toFileSafeToken(tripCityLabel)}_${plannerSelection?.arrivalDate ?? "trip"}.png`;
      downloadSnapshot(blob, fileName);
    } catch (error) {
      console.error("[Download] Itinerary card failed", error);
    } finally {
      setShareBusy(false);
    }
  };

  const isEditingTrip = plannerSubmitted && plannerOpen;
  const showPlannerChrome =
    plannerSubmitted &&
    !tripRevealPending &&
    (!plannerOpen || plannerEditingTransition) &&
    !plannerCollapsing;
  const showExpandedChart = showPlannerChrome && !chartCollapsed;

  const mapProps = {
    darkMode: false,
    basemapMode: "raster" as const,
    showMapControls: false,
    showLegendControl: false,
    colorNoData: true,
    paletteId: selectedPaletteId,
    surfaceMode,
    resolution,
    poiFilters,
    modelId: appConfig.compositeModelId,
    periods: [],
    selectedWeek,
    selectedWeekYear,
    hotspotsEnabled: false,
    hotspotMode: "modeled" as const,
    hotspotPercentile: 1,
    expectedActivityHotspotCellCount: null,
    onHotspotsEnabledChange: () => undefined,
    externalValues: plannerSubmitted && tripOccurrence ? tripOccurrence.values : undefined,
    forecastOverlayEnabled: plannerSubmitted && !!tripOccurrence,
    forecastOverlayLoadKey: recommendedPlacesSignature,
    onForecastOverlayReady: setRenderedTripLoadKey,
    onFatalDataError: handlePlannerMapFatalError,
    pulseAllGridCells: plannerSubmitted && tripLoading,
    mapModeLabel:
      plannerSubmitted ? "Loading typical activity map…" : "Choose trip details to build your outlook",
    suggestedPlaces: plannerSubmitted ? mapSuggestedPlaces : [],
    itineraryPlaceIds: plannerSubmitted ? itineraryPlaceIds : [],
    showTripHotspotMarkers: plannerSubmitted && tripHotspotsVisible && !tripLoading,
    selectedPlaceId,
    cameraLocations,
    selectedCameraId,
    selectedHydrophoneId,
    pulseSelectedPlaceMarker: plannerSubmitted ? pulseSelectedPlaceMarker : false,
    onPlaceSelect: (place: SuggestedPlace) => {
      handleOpenPlaceDetails(place);
    },
    baseLocation: activeBaseLocation,
    maxTravelDistanceMiles: activeMaxTravelDistanceMiles,
    showCameras: plannerSubmitted && camerasVisible,
    hydrophoneLocations,
    showHydrophones: plannerSubmitted && hydrophonesVisible,
    sidebarOffsetPx: 0,
    gridPresentation: "quiet" as const,
  } satisfies ForecastMapProps;

  return (
    <div className="mapPageRoot">
      <AppHeader
        title="OrcaCast"
        subtitle="Forecast Lab"
        variant="home"
        onOpenInfo={() => setInfoOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
        rightSlot={
          <nav className="homeNav" aria-label="Planner navigation">
            <Link to="/watch">This week</Link>
            <Link to="/planner">Plan a trip</Link>
            <Link to="/#explore">Explore</Link>
          </nav>
        }
      />

      <main className="app__main">
        <div
          className={`plannerResultsPage${plannerSubmitted ? " hasPlan" : " isPrompting"}${plannerOpen ? " isPlannerOpen" : ""}${plannerSubmitted && plannerOpen ? " isEditing" : ""}${plannerEditingTransition ? " isPoppingPanels" : ""}${plannerCollapsing ? " isCollapsing" : ""}${chartCollapsed ? " isChartCollapsed" : ""}${spotsCollapsed ? " isSpotsCollapsed" : ""}${tripLoading ? " isLoading" : ""}${tripRevealPending ? " isRevealing" : ""}${settingsOpen ? " isSettingsOpen" : ""}`}
          aria-busy={tripRevealPending || tripLoading}
        >
          <div className="plannerResultsPage__main">
        <div className="plannerResultsPage__mapLayer">
          <ForecastMap
            {...mapProps}
            ref={primaryMapRef}
          />
        </div>

        {tripRevealPending ? (
          <div
            className={`plannerResultsPage__revealGate${plannerRevealComplete ? " isComplete" : ""}`}
            role="status"
            aria-live="polite"
            aria-label="Preparing the trip planner map, activity layers, and recommended viewing spots."
          >
            <PlannerFerryLoader complete={plannerRevealComplete} />
          </div>
        ) : tripLoading ? (
          <div
            className="plannerResultsPage__screenLoading"
            role="status"
            aria-live="polite"
            aria-label="Loading historical sightings, the activity map, and trip recommendations."
          >
            <SwimmingOrcaLoader />
          </div>
        ) : null}

        {(!plannerSubmitted || plannerOpen) ? (
          <section
            className={`plannerResultsPage__promptCard${plannerSubmitted ? " isEditing" : ""}${plannerCollapsing ? " isCollapsing" : ""}`}
            aria-labelledby="plannerPromptTitle"
          >
            <header className="plannerResultsPage__promptHeader">
              <div className="plannerResultsPage__promptIcon">
                <span className="material-symbols-rounded" aria-hidden="true">
                  calendar_month
                </span>
              </div>
              <div className="plannerResultsPage__promptHeading">
                <p className="plannerResultsPage__promptEyebrow">Trip planner</p>
                <h1 id="plannerPromptTitle">{plannerSubmitted ? "Edit Trip Plan" : "Plan around your dates"}</h1>
                {!plannerSubmitted ? (
                  <p className="plannerResultsPage__promptSupporting">
                    Choose a base, dates, and optional travel range.
                  </p>
                ) : null}
              </div>
              {plannerSubmitted ? (
                <button
                  type="button"
                  className="plannerResultsPage__promptClose"
                  onClick={() => {
                    setPlannerEditingTransition(false);
                    setPlannerOpen(false);
                  }}
                  aria-label="Close trip editor"
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    close
                  </span>
                </button>
              ) : null}
            </header>

            <form className="plannerResultsPage__promptForm" onSubmit={handlePlannerSubmit} autoComplete="off">
              <div className="plannerResultsPage__promptField plannerResultsPage__promptField--base">
                <span id="planner-base-location-label">Base location</span>
                <PlannerLocationField
                  value={draftCity}
                  options={baseLocations}
                  labelledBy="planner-base-location-label"
                  valueId="planner-base-location-value"
                  onChange={setDraftCity}
                />
              </div>

              <div className="plannerResultsPage__promptRow plannerResultsPage__promptRow--middle">
                <div className="plannerResultsPage__promptField plannerResultsPage__promptField--range">
                  <span id="planner-trip-dates-label">Dates</span>
                  <PlannerDateRangeField
                    arrivalDate={draftArrivalDate}
                    departureDate={draftDepartureDate}
                    labelledBy="planner-trip-dates-label"
                    valueId="planner-trip-dates-value"
                    onChange={(nextArrivalDate, nextDepartureDate) => {
                      setDraftArrivalDate(nextArrivalDate);
                      setDraftDepartureDate(nextDepartureDate);
                    }}
                  />
                </div>

                <label className="plannerResultsPage__promptField plannerResultsPage__promptField--distance">
                  <span className="plannerResultsPage__promptLabelWithBadge">
                    <span>Max travel distance</span>
                    <small>Optional</small>
                  </span>
                  <span className="plannerResultsPage__promptInputWrap plannerResultsPage__promptInputWrap--suffix">
                    <span className="material-symbols-rounded" aria-hidden="true">
                      route
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      inputMode="decimal"
                      value={draftMaxTravelDistance}
                      onChange={(event) => setDraftMaxTravelDistance(event.target.value)}
                      placeholder={`Default: ${formatPlannerDistanceValue(
                        DEFAULT_RECOMMENDATION_RADIUS_MILES,
                        unitsMode
                      )}`}
                      autoComplete="off"
                    />
                    <span className="plannerResultsPage__promptSuffix">{unitsMode === "metric" ? "km" : "mi"}</span>
                  </span>
                </label>
              </div>

              <div className="plannerResultsPage__promptActions">
                <button
                  type="submit"
                  className="plannerResultsPage__promptSubmit"
                  disabled={!draftCity || !draftArrivalDate || !draftDepartureDate}
                >
                  <span>Find viewing spots</span>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    arrow_forward
                  </span>
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {plannerSubmitted && (!isEditingTrip || plannerEditingTransition) ? (
          <section className="plannerResultsPage__summaryCard">
            <div className="plannerResultsPage__summaryIcon">
              <span className="material-symbols-rounded" aria-hidden="true">
                calendar_month
              </span>
            </div>
            <div className="plannerResultsPage__summaryBody">
              <div className="plannerResultsPage__summaryEyebrow">Your Salish Sea trip</div>
              <h1>{tripCityLabel}</h1>
              <div className="plannerResultsPage__summaryMeta">
                <span>
                  {tripLabel} · {tripLengthLabel}
                </span>
                {tripDistanceLabel ? <span>{tripDistanceLabel}</span> : null}
              </div>
            </div>
            <div className="plannerResultsPage__summaryActions">
              <button type="button" className="plannerResultsPage__summaryEditBtn" onClick={openPlannerEditor}>
                <span className="material-symbols-rounded" aria-hidden="true">
                  edit_calendar
                </span>
                <span>Edit Trip</span>
              </button>
              {itineraryPlaces.length > 0 ? (
                <div
                  className="plannerResultsPage__summaryItinerary"
                  tabIndex={0}
                  onMouseLeave={(event) => {
                    if (itineraryShareMenuOpen) return;
                    setItineraryShareMenuOpen(false);
                    const activeElement = document.activeElement;
                    if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
                      activeElement.blur();
                    }
                  }}
                >
                  <button
                    type="button"
                    className="plannerResultsPage__summaryItineraryTrigger"
                    onClick={() => {
                      if (itineraryMapViewActive) {
                        setItineraryMapViewActive(false);
                        setPulseSelectedPlaceMarker(false);
                        return;
                      }
                      setItineraryMapViewActive(true);
                      setPulseSelectedPlaceMarker(false);
                      setSelectedPlaceId(itineraryPlaces[0]?.id ?? null);
                      primaryMapRef.current?.fitLocations(
                        itineraryPlaces.map((place) => [place.longitude, place.latitude] as [number, number]),
                        { padding: 104, maxZoom: 10.5 }
                      );
                    }}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">
                      route
                    </span>
                    <span>{`${itineraryMapViewActive ? "View all places" : "View itinerary"} (${itineraryPlaces.length})`}</span>
                  </button>

                  <div className="plannerResultsPage__itineraryMenu">
                    <div className="plannerResultsPage__itineraryMenuHead">
                      <div className="plannerResultsPage__itineraryMenuTitle">
                        <strong>Trip stops</strong>
                        <span>{itineraryPlaces.length}</span>
                      </div>
                      <div className="plannerResultsPage__itineraryMenuActions">
                        <button
                          type="button"
                          className="plannerResultsPage__itineraryMenuUtility"
                          onClick={() => setItineraryShareMenuOpen((value) => !value)}
                          aria-expanded={itineraryShareMenuOpen}
                          aria-label="Open itinerary download details"
                        >
                          <span className="material-symbols-rounded" aria-hidden="true">
                            download
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="plannerResultsPage__itineraryList">
                      {itineraryPlaces.map((place, index) => (
                        <Fragment key={place.id}>
                          <div
                            className={`plannerResultsPage__itineraryItem${
                              draggingItineraryPlaceId === place.id ? " isDragging" : ""
                            }${itineraryDropTargetId === place.id && draggingItineraryPlaceId !== place.id ? " isDropTarget" : ""}`}
                            draggable
                            onDragStart={(event) => handleItineraryDragStart(place.id, event)}
                            onDragOver={(event) => handleItineraryDragOver(place.id, event)}
                            onDrop={(event) => handleItineraryDrop(place.id, event)}
                            onDragEnd={handleItineraryDragEnd}
                          >
                            <div className="plannerResultsPage__itineraryItemOrder">{index + 1}</div>
                            <button
                              type="button"
                              className="plannerResultsPage__itineraryItemMain"
                              onClick={() => {
                                setPulseSelectedPlaceMarker(false);
                                setSelectedPlaceId(place.id);
                              }}
                            >
                              <strong>{place.name}</strong>
                              <span>{place.region ?? "Salish Sea"}</span>
                            </button>
                            <button
                              type="button"
                              className="plannerResultsPage__itineraryItemRemove"
                              onClick={() => handleRemovePlaceFromItinerary(place.id)}
                              aria-label={`Remove ${place.name} from itinerary`}
                            >
                              <span className="material-symbols-rounded" aria-hidden="true">
                                close
                              </span>
                            </button>
                          </div>
                          {index < itineraryPlaces.length - 1 ? (
                            <div className="plannerResultsPage__itineraryDots" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </div>
                          ) : null}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {itineraryShareMenuOpen ? (
          <div
            className="plannerResultsPage__itineraryUtilityModal"
            role="dialog"
            aria-modal="true"
            aria-label="Download itinerary details"
            onClick={() => setItineraryShareMenuOpen(false)}
          >
            <div
              className="plannerResultsPage__itineraryUtilityPopover"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="plannerResultsPage__itineraryUtilityClose"
                onClick={() => setItineraryShareMenuOpen(false)}
                aria-label="Close download itinerary dialog"
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  close
                </span>
              </button>
              <div className="plannerResultsPage__itineraryExportCardShell">
                <div className="plannerResultsPage__itineraryExportCard">
                  <div className="plannerResultsPage__itineraryExportHeader">
                    <h3>Orca Itinerary</h3>
                  </div>
                  <div className="plannerResultsPage__itineraryExportMeta">
                    <div className="plannerResultsPage__itineraryExportMetaBlock">
                      <span>From</span>
                      <strong>{tripCityLabel}</strong>
                    </div>
                    <div className="plannerResultsPage__itineraryExportMetaBlock">
                      <span>Date range</span>
                      <strong>{tripLabel}</strong>
                    </div>
                    <div className="plannerResultsPage__itineraryExportMetaBlock">
                      <span>Trip length</span>
                      <strong>{tripLengthLabel}</strong>
                    </div>
                  </div>
                  <div className="plannerResultsPage__itineraryExportRule" aria-hidden="true" />
                  <div className="plannerResultsPage__itineraryExportStops">
                    {itineraryPlaces.map((place, index) => (
                      <div key={`export-${place.id}`} className="plannerResultsPage__itineraryExportStop">
                        <span>{index + 1}</span>
                        <div>
                          <strong>{`${place.name} (${place.latitude.toFixed(3)}, ${place.longitude.toFixed(3)})`}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="plannerResultsPage__itineraryExportRule" aria-hidden="true" />
                  <div className="plannerResultsPage__itineraryExportChart">
                    <div className="plannerResultsPage__itineraryExportChartTitle">Typical Sightings Per Week</div>
                    <div className="plannerResultsPage__itineraryExportBars" style={weeklyChartColumnStyle}>
                      {weekBars.map((bar) => (
                        <span
                          key={`export-bar-${bar.index}`}
                          className={`plannerResultsPage__itineraryExportBar${bar.highlighted ? " isHighlighted" : ""}`}
                          style={{ height: `${Math.max(8, (bar.count / weeklyChartMax) * 100)}%` }}
                        />
                      ))}
                    </div>
                    <div className="plannerResultsPage__itineraryExportMonths" style={weeklyChartColumnStyle} aria-hidden="true">
                      {weeklyChartTicks.map((tick) => (
                        <span
                          key={`export-tick-${tick.index}`}
                          className="plannerResultsPage__itineraryExportMonth"
                          style={{ gridColumn: `${tick.index + 1} / span 1` }}
                        >
                          {tick.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="plannerResultsPage__itineraryUtilityAction"
                onClick={handleItineraryDownloadAction}
                disabled={shareBusy}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  download
                </span>
                <span>Download card</span>
              </button>
            </div>
          </div>
        ) : null}

        {showPlannerChrome ? (
          <aside className="plannerResultsPage__leftTripStack" aria-label="Trip and itinerary">
            <div className="plannerResultsPage__sidebarTripCard">
              <div className="plannerResultsPage__sidebarTripIcon" aria-hidden="true">
                <span className="material-symbols-rounded">calendar_month</span>
              </div>
              <div className="plannerResultsPage__sidebarTripCopy">
                <div className="plannerResultsPage__spotsEyebrow">Your Salish Sea trip</div>
                <h2>{tripCityLabel}</h2>
                <p>{tripLabel}{tripDistanceLabel ? ` · ${tripDistanceLabel}` : ""}</p>
              </div>
              <button type="button" className="plannerResultsPage__sidebarEditTrip" onClick={openPlannerEditor}>
                Edit trip
              </button>
              {itineraryPlaces.length > 0 ? (
                <button
                  type="button"
                  className="plannerResultsPage__sidebarViewItinerary"
                  onClick={() => setItineraryExpanded((expanded) => !expanded)}
                  aria-expanded={itineraryExpanded}
                  aria-controls="planner-trip-itinerary"
                >
                  <span>{itineraryExpanded ? "Hide itinerary" : "View itinerary"}</span>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    {itineraryExpanded ? "expand_less" : "expand_more"}
                  </span>
                </button>
              ) : null}
            </div>
            {itineraryPlaces.length > 0 && itineraryExpanded ? (
            <div id="planner-trip-itinerary" className="plannerResultsPage__leftItineraryCard">
              <div className="plannerResultsPage__itineraryPreviewHeader">
                <span>Your itinerary</span>
                <span className="plannerResultsPage__itineraryHeaderActions">
                  <strong>{itineraryPlaces.length}</strong>
                  {itineraryPlaces.length > 0 ? (
                    <button type="button" className="plannerResultsPage__itineraryExportButton" onClick={() => setItineraryExportOpen(true)}>
                      <span className="material-symbols-rounded" aria-hidden="true">ios_share</span>
                      Export
                    </button>
                  ) : null}
                </span>
              </div>
                <div className="plannerResultsPage__leftItineraryList" aria-label="Sortable itinerary">
                  {itineraryPlaces.map((place, index) => (
                    <div
                      key={place.id}
                      className={`plannerResultsPage__leftItineraryItem${draggingItineraryPlaceId === place.id ? " isDragging" : ""}${
                        itineraryDropTargetId === place.id && draggingItineraryPlaceId !== place.id ? " isDropTarget" : ""
                      }`}
                      onDragOver={(event) => handleItineraryDragOver(place.id, event)}
                      onDrop={(event) => handleItineraryDrop(place.id, event)}
                    >
                      <button
                        type="button"
                        className="plannerResultsPage__itineraryDragHandle"
                        draggable
                        onDragStart={(event) => handleItineraryDragStart(place.id, event)}
                        onDragEnd={handleItineraryDragEnd}
                        aria-label={`Drag ${place.name}`}
                      >
                        <span aria-hidden="true">⠿</span>
                      </button>
                      <button type="button" className="plannerResultsPage__leftItineraryMain" onClick={() => handleSelectItineraryPlace(place)}>
                        <span className="plannerResultsPage__sidebarItineraryOrder">{index + 1}</span>
                        <span><strong>{place.name}</strong><small>{place.region ?? "Salish Sea"}</small></span>
                      </button>
                      <button type="button" className="plannerResultsPage__sidebarItineraryRemove" onClick={() => handleRemovePlaceFromItinerary(place.id)} aria-label={`Remove ${place.name}`}>
                        <span className="material-symbols-rounded" aria-hidden="true">close</span>
                      </button>
                    </div>
                  ))}
                </div>
            </div>
            ) : null}
          </aside>
        ) : null}

        {showPlannerChrome ? (
          <aside
            ref={legendPaletteRef}
            className={`plannerResultsPage__legendCard${paletteOpen ? " isPaletteOpen" : ""}`}
            aria-label="Typical orca activity legend, low to high"
          >
            <button
              type="button"
              className="plannerResultsPage__legendPaletteTrigger"
              aria-label="Typical activity color scale"
              aria-haspopup="listbox"
              aria-expanded={paletteOpen}
              onClick={() => setPaletteOpen((value) => !value)}
            />
            <strong className="plannerResultsPage__legendTitle">Typical activity</strong>
            <div className="plannerResultsPage__legendScale">
              <span>Low</span>
              <div className="plannerResultsPage__legendRamp" aria-hidden="true">
                {[...legendColors].reverse().map((color, index) => (
                  <span key={`${color}-${index}`} style={{ background: color }} />
                ))}
              </div>
              <span>High</span>
            </div>
            {paletteOpen ? (
              <div
                className="plannerResultsPage__legendPaletteList"
                role="listbox"
                aria-label="Color scale palettes"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {paletteEntries.map((palette) => {
                  const selected = palette.id === selectedPaletteId;
                  return (
                    <button
                      key={palette.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`plannerResultsPage__legendPaletteRow${selected ? " isSelected" : ""}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPlannerOpen(false);
                        setPlannerCollapsing(false);
                        setPlannerEditingTransition(false);
                        setTripRevealPending(false);
                        setRevealMinimumElapsed(false);
                        setSelectedPaletteId(palette.id);
                        setPaletteOpen(false);
                      }}
                    >
                      <span className="plannerResultsPage__legendPaletteSwatches" aria-hidden="true">
                        {palette.colors.slice(0, 6).map((color, index) => (
                          <span key={`${palette.id}-${index}`} style={{ backgroundColor: color }} />
                        ))}
                      </span>
                      <span>{palette.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </aside>
        ) : null}

        {showPlannerChrome ? (
          <aside
            ref={sidebarRef}
            className={`plannerResultsPage__spotsCard plannerResultsPage__tripSidebar isMode-${sidebarMode}${
              spotsCollapsed ? " isCollapsed" : ""
            }${detailPlace ? " isDetailOpen" : ""}`}
          >
            {spotsCollapsed ? (
              <button
                type="button"
                className="plannerResultsPage__spotsNotebook"
                onClick={() => setSpotsCollapsed(false)}
                aria-expanded="false"
                aria-label="Expand recommended viewing spots"
              >
                <span className="plannerResultsPage__spotsNotebookGraphic" aria-hidden="true">
                  <span className="plannerResultsPage__spotsNotebookPage" />
                  <span className="plannerResultsPage__spotsNotebookRing plannerResultsPage__spotsNotebookRing--one" />
                  <span className="plannerResultsPage__spotsNotebookRing plannerResultsPage__spotsNotebookRing--two" />
                  <span className="plannerResultsPage__spotsNotebookRing plannerResultsPage__spotsNotebookRing--three" />
                  <span className="plannerResultsPage__spotsNotebookRing plannerResultsPage__spotsNotebookRing--four" />
                </span>
                <span className="plannerResultsPage__spotsNotebookLabel">Field picks</span>
                <span className="plannerResultsPage__spotsNotebookCount">{displayedRecommendedPlaces.length}</span>
              </button>
            ) : (
              <button
                type="button"
                className="plannerResultsPage__spotsCollapseBtn"
                onClick={() => {
                  setDetailPlaceId(null);
                  setSpotsCollapsed(true);
                }}
                aria-expanded="true"
                aria-label="Collapse recommended viewing spots"
              >
                <span className="material-symbols-rounded" aria-hidden="true">expand_more</span>
              </button>
            )}
            <div className="plannerResultsPage__spotsPanel">
              <div className="plannerResultsPage__spotsPanelFace plannerResultsPage__spotsPanelFace--front">
                <div className="plannerResultsPage__sidebarTripCard">
                  <div className="plannerResultsPage__sidebarTripIcon" aria-hidden="true">
                    <span className="material-symbols-rounded">calendar_month</span>
                  </div>
                  <div className="plannerResultsPage__sidebarTripCopy">
                    <div className="plannerResultsPage__spotsEyebrow">Your Salish Sea trip</div>
                    <h2>{tripCityLabel}</h2>
                    <p>{tripLabel}{tripDistanceLabel ? ` · ${tripDistanceLabel}` : ""}</p>
                  </div>
                  <button type="button" className="plannerResultsPage__sidebarEditTrip" onClick={openPlannerEditor}>
                    Edit trip
                  </button>
                </div>

                {sidebarMode === "itinerary" ? (
                  <div className="plannerResultsPage__itineraryPanel">
                    <div className="plannerResultsPage__sidebarSectionHeader">
                      <button type="button" className="plannerResultsPage__sidebarBackBtn" onClick={() => setSidebarMode("overview")}>
                        <span className="material-symbols-rounded" aria-hidden="true">arrow_back</span>
                        Back to trip
                      </button>
                      <strong>Your itinerary <span>{itineraryPlaces.length}</span></strong>
                    </div>
                    {itineraryPlaces.length === 0 ? (
                      <div className="plannerResultsPage__itineraryEmptyState">
                        <span className="material-symbols-rounded" aria-hidden="true">explore</span>
                        <h3>Your day is still an open chart.</h3>
                        <p>Add places from the map to begin building your Salish Sea route.</p>
                      </div>
                    ) : (
                      <div className="plannerResultsPage__sidebarItineraryList" aria-label="Sortable itinerary">
                        {itineraryPlaces.map((place, index) => (
                          <div
                            key={place.id}
                            className={`plannerResultsPage__sidebarItineraryItem${
                              draggingItineraryPlaceId === place.id ? " isDragging" : ""
                            }${itineraryDropTargetId === place.id && draggingItineraryPlaceId !== place.id ? " isDropTarget" : ""}${
                              selectedPlaceId === place.id ? " isSelected" : ""
                            }`}
                            onDragOver={(event) => handleItineraryDragOver(place.id, event)}
                            onDrop={(event) => handleItineraryDrop(place.id, event)}
                          >
                            <button
                              type="button"
                              className="plannerResultsPage__itineraryDragHandle"
                              draggable
                              onDragStart={(event) => handleItineraryDragStart(place.id, event)}
                              onDragEnd={handleItineraryDragEnd}
                              aria-label={`Drag ${place.name}`}
                            >
                              <span aria-hidden="true">⠿</span>
                            </button>
                            <button
                              type="button"
                              className="plannerResultsPage__sidebarItineraryMain"
                              onClick={() => handleSelectItineraryPlace(place)}
                            >
                              <span className="plannerResultsPage__sidebarItineraryOrder">{index + 1}</span>
                              <span>
                                <strong>{place.name}</strong>
                                <small>{place.region ?? "Salish Sea"} · {place.distanceKm !== undefined ? `${Math.round(place.distanceKm * 0.621371)} mi` : "Selected stop"}</small>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="plannerResultsPage__sidebarItineraryAction"
                              onClick={() => handleOpenPlaceDetails(place)}
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              className="plannerResultsPage__sidebarItineraryRemove"
                              onClick={() => handleRemovePlaceFromItinerary(place.id)}
                              aria-label={`Remove ${place.name} from itinerary`}
                            >
                              <span className="material-symbols-rounded" aria-hidden="true">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="plannerResultsPage__itineraryPreviewCard">
                      <div className="plannerResultsPage__itineraryPreviewHeader">
                        <span>Your itinerary</span>
                        <strong>{itineraryPlaces.length}</strong>
                      </div>
                      {itineraryPlaces.length === 0 ? (
                        <div className="plannerResultsPage__itineraryEmptyState plannerResultsPage__itineraryEmptyState--compact">
                          <span className="material-symbols-rounded" aria-hidden="true">travel_explore</span>
                          <h3>Your day is still an open chart.</h3>
                          <p>Add places from the map to begin building your Salish Sea route.</p>
                        </div>
                      ) : (
                        <div className="plannerResultsPage__itineraryPreviewList">
                          {itineraryPlaces.slice(0, 3).map((place, index) => (
                            <button
                              key={place.id}
                              type="button"
                              className="plannerResultsPage__itineraryPreviewItem"
                              onClick={() => handleSelectItineraryPlace(place)}
                            >
                              <span aria-hidden="true">⠿</span>
                              <strong>{index + 1}</strong>
                              <span>
                                <b>{place.name}</b>
                                <small>{place.viewingPotential === "very-high" ? "Strong outlook" : `${formatViewingPotentialLabel(place.viewingPotential)} outlook`}</small>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button type="button" className="plannerResultsPage__viewItineraryBtn" onClick={() => setSidebarMode("itinerary")}>
                        View full itinerary
                      </button>
                    </div>

                    <div className="plannerResultsPage__spotsHeader plannerResultsPage__sidebarRecommendationsHeader">
                      <div className="plannerResultsPage__spotsIcon">
                        <img src="/images/icons/binoculars_recreated.svg" alt="" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="plannerResultsPage__spotsEyebrow">Recommended places</div>
                        <h2>Field Picks <span>{displayedRecommendedPlaces.length}</span></h2>
                      </div>
                    </div>

                    <div className="plannerResultsPage__fieldPickFilters" role="group" aria-label="Filter field picks">
                      {([
                        ["top", "Top picks"],
                        ["shore", "Shore"],
                        ["Ferry", "Ferry"],
                        ["Marina", "Marina"],
                        ["Park", "Park"],
                      ] as const).map(([filter, label]) => (
                        <button
                          key={filter}
                          type="button"
                          className={fieldPickFilter === filter ? "isActive" : ""}
                          aria-pressed={fieldPickFilter === filter}
                          onClick={() => setFieldPickFilter(filter)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div
                      className="plannerResultsPage__spotsList"
                      role="region"
                      aria-label="Recommended places"
                      tabIndex={0}
                    >
                      {!plannerSubmitted ? (
                        <PlannerLoadingState
                          className="plannerResultsPage__loadingState--idle"
                          title="Ready to scout"
                          message="Choose a base, dates, and optional travel range. Your recommended viewing spots will appear here."
                        />
                      ) : recommendedPlacesLoading && displayedRecommendedPlaces.length === 0 ? (
                        <PlannerLoadingState
                          title="Scouting viewing spots..."
                          message="Our orca is searching nearby parks, marinas, and ferry viewpoints for your trip dates."
                        />
                      ) : displayedRecommendedPlaces.length === 0 &&
                        !tripLoading &&
                        !recommendedPlacesData.isLoading &&
                        !tripError &&
                        !recommendedPlacesData.error &&
                        activeMaxTravelDistanceMiles ? (
                        <div className="plannerResultsPage__spotsEmptyState">
                          No suggested locations within defined search radius. Expand your search radius and try again.
                        </div>
                      ) : (
                        fieldPickPlaces.map((place, index) => (
                          <div id={`field-pick-${place.id}`} key={place.id} className="plannerResultsPage__spotRow">
                            <PlannerPlaceCard
                              place={place}
                              rank={index + 1}
                              photoManifest={photoManifest}
                              itineraryAdded={itineraryPlaceIds.includes(place.id)}
                              onAddToItinerary={() => handleAddPlaceToItinerary(place)}
                              onRemoveFromItinerary={() => handleRemovePlaceFromItinerary(place.id)}
                              selected={selectedPlace?.id === place.id}
                              onShowOnMap={() => {
                                setDetailPlaceId(null);
                                setSidebarMode("overview");
                                setItineraryMapViewActive(false);
                                setPulseSelectedPlaceMarker(true);
                                setSelectedPlaceId(place.id);
                              }}
                              onViewDetails={() => handleOpenPlaceDetails(place)}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="plannerResultsPage__spotsPanelFace plannerResultsPage__spotsPanelFace--back">
                {detailPlace ? (
                  <div className="plannerResultsPage__detailModeWrap">
                    <PlannerPlaceDetailView
                      place={detailPlace}
                      photoManifest={photoManifest}
                      matchedCameras={detailPlaceCameras}
                      matchedHydrophones={detailPlaceHydrophones}
                      hydrophoneListenUrl={hydrophoneListenUrl}
                      itineraryAdded={itineraryPlaceIds.includes(detailPlace.id)}
                      onAddToItinerary={() => handleAddPlaceToItinerary(detailPlace)}
                      onRemoveFromItinerary={() => handleRemovePlaceFromItinerary(detailPlace.id)}
                      onViewItinerary={() => {
                        setDetailPlaceId(null);
                        setSidebarMode("itinerary");
                      }}
                      onBack={() => {
                        setDetailPlaceId(null);
                        setSidebarMode("overview");
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        ) : null}

        {showPlannerChrome && chartCollapsed ? (
          <button
            type="button"
            className="plannerResultsPage__chartCollapsedButton"
            onClick={() => setChartCollapsed(false)}
            aria-expanded="false"
            aria-label="Expand Your Trip Window"
          >
            <span className="plannerResultsPage__chartIcon">
              <span className="material-symbols-rounded" aria-hidden="true">
                bar_chart
              </span>
            </span>
            <span className="plannerResultsPage__chartCollapsedCopy">
              <strong>Your Trip Window</strong>
              <small>
                {plannerSubmitted
                  ? `${tripLabel} · ${activityLabel} · ${topWatersLabel}`
                  : "Seasonal activity for your selected dates"}
              </small>
            </span>
            <span className="plannerResultsPage__chartCollapsedToggle" aria-hidden="true">
              <span className="material-symbols-rounded">expand_less</span>
            </span>
          </button>
        ) : null}

        {showExpandedChart ? (
          <section className="plannerResultsPage__bottomPanel">
            <div className={`plannerResultsPage__chartCard${chartZoomedToDays ? " isDailyZoom" : ""}`}>
              <div className="plannerResultsPage__chartHeader">
                <div className="plannerResultsPage__chartTitleWrap">
                  <div className="plannerResultsPage__chartIcon">
                    <span className="material-symbols-rounded" aria-hidden="true">
                      bar_chart
                    </span>
                  </div>
                  <div>
                    <h2>{chartZoomedToDays ? "Daily Sightings Around Your Trip" : "Your Trip Window"}</h2>
                    {chartZoomedToDays ? (
                      <p>{tripLabel}</p>
                    ) : plannerSubmitted ? (
                      <p>{tripLabel} · {activityLabel} · {topWatersLabel}</p>
                    ) : (
                      <p>Enter trip details to highlight your viewing window.</p>
                    )}
                  </div>
                </div>
                <div className="plannerResultsPage__chartHeaderActions">
                  {plannerSubmitted && chartZoomMode === "daily" ? (
                    <button
                      type="button"
                      className="plannerResultsPage__chartModeButton"
                      onClick={() => setChartZoomMode("weekly")}
                    >
                      <span>Back to weekly</span>
                    </button>
                  ) : null}
                  {!isEditingTrip ? (
                    <button
                      type="button"
                      className="plannerResultsPage__panelCollapseBtn"
                      onClick={() => setChartCollapsed(true)}
                      aria-expanded="true"
                      aria-label="Collapse seasonal activity panel"
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">
                        expand_more
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="plannerResultsPage__chartBody">
                {!plannerSubmitted ? (
                  <PlannerLoadingState
                    className="plannerResultsPage__loadingState--chart plannerResultsPage__loadingState--idle"
                    title="Activity chart standing by"
                    message="Choose your dates and the seasonal sightings pattern will load here."
                  />
                ) : chartLoading ? (
                  <PlannerLoadingState
                    className="plannerResultsPage__loadingState--chart"
                    title="Loading seasonal activity..."
                    message="Our orca is pulling the activity curve for your dates so the weekly chart can snap into place."
                  />
                ) : (
                <div
                  ref={chartPlotRef}
                  className={`plannerResultsPage__chartPlot${tripBrushMode ? " isDraggingTripWindow" : ""}${chartZoomedToDays ? " isDailyZoom" : ""}${!plannerSubmitted ? " isPromptState" : ""}`}
                  onClick={() => {
                    if (!plannerSubmitted) return;
                    if (tripBrushMode) return;
                    setChartZoomMode("daily");
                  }}
                >
                  <div className="plannerResultsPage__chartGridLines" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  {chartZoomedToDays
                    ? (chartWindowStyle ? (
                        <div
                          className={`plannerResultsPage__tripWindowOverlay isInteractive isZoomed`}
                          style={chartWindowStyle}
                        >
                          <div className="plannerResultsPage__tripRangeSelection">
                            <div
                              className="plannerResultsPage__tripWindowMoveZone"
                              onPointerDown={(event) => handleTripBrushPointerDown("move", event)}
                            />
                            <button
                              type="button"
                              className="plannerResultsPage__tripWindowHandle plannerResultsPage__tripWindowHandle--start"
                              aria-label="Adjust trip start date"
                              onPointerDown={(event) => handleTripBrushPointerDown("start", event)}
                            />
                            <button
                              type="button"
                              className="plannerResultsPage__tripWindowHandle plannerResultsPage__tripWindowHandle--end"
                              aria-label="Adjust trip end date"
                              onPointerDown={(event) => handleTripBrushPointerDown("end", event)}
                            />
                          </div>
                        </div>
                      ) : null)
                    : tripWindowSegments.map((segment) => (
                        <div
                          key={segment.key}
                          className={`plannerResultsPage__tripWindowOverlay${tripBrushMode ? " isInteractive" : ""}`}
                          style={segment.style}
                        >
                          <div
                            className="plannerResultsPage__tripWindowHitArea"
                            onPointerDown={(event) => handleTripBrushPointerDown("move", event)}
                          >
                            {segment.handleStart ? (
                              <button
                                type="button"
                                className="plannerResultsPage__tripWindowHandle plannerResultsPage__tripWindowHandle--start"
                                aria-label="Adjust trip start date"
                                onPointerDown={(event) => handleTripBrushPointerDown("start", event)}
                              />
                            ) : null}
                            {segment.handleEnd ? (
                              <button
                                type="button"
                                className="plannerResultsPage__tripWindowHandle plannerResultsPage__tripWindowHandle--end"
                                aria-label="Adjust trip end date"
                                onPointerDown={(event) => handleTripBrushPointerDown("end", event)}
                              />
                            ) : null}
                            {segment.showLabel ? (
                              <div className="plannerResultsPage__tripWindow">
                                <span>Your trip</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  <div className="plannerResultsPage__chartBars" style={chartColumnStyle}>
                    {chartBars.map((bar, index) => {
                      return (
                      <div key={bar.index} className="plannerResultsPage__chartBarWrap">
                        <span
                          className={`plannerResultsPage__chartBar${bar.highlighted ? " isHighlighted" : ""}`}
                          style={
                            {
                              height: `${Math.max(6, (bar.count / chartMax) * 100)}%`,
                              "--bar-delay": `${Math.max(0, index * 20)}ms`,
                            } as CSSProperties
                          }
                        />
                      </div>
                    )})}
                  </div>
                  <div className="plannerResultsPage__chartMonths" aria-hidden="true" style={chartColumnStyle}>
                    {chartTicks.map((tick) => (
                      <span
                        key={`${tick.label}-${tick.index}`}
                        className="plannerResultsPage__chartMonth"
                        style={{ gridColumn: chartZoomedToDays ? `${tick.index + 1} / span 1` : `${tick.index + 1} / span 4` }}
                      >
                        <span>{tick.label}</span>
                        {tick.sublabel ? <small>{tick.sublabel}</small> : null}
                      </span>
                    ))}
                  </div>
                  {chartZoomedToDays ? (
                    <div className="plannerResultsPage__chartMonthBands" aria-hidden="true" style={chartColumnStyle}>
                      {dailyMonthBands.map((band) => (
                        <span
                          key={`${band.label}-${band.startIndex}`}
                          className="plannerResultsPage__chartMonthBand"
                          style={{ gridColumn: `${band.startIndex + 1} / span ${band.span}` }}
                        >
                          {band.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                )}
              </div>
            </div>

          </section>
        ) : null}

        {showPlannerChrome ? (
        <div className="plannerResultsPage__quickActions">
          {plannerSubmitted ? (
            <div className={`plannerResultsPage__placesFab${placesMenuOpen ? " isOpen" : ""}`}>
              <div id="planner-places-filters" className="plannerResultsPage__placesFabMenu" role="group" aria-label="Choose visible points of interest">
                {([
                  ["top", "Top Places", "star"],
                  ["all", "All POIs", "location_on"],
                  ["Park", "Parks", "park"],
                  ["Marina", "Marinas", "anchor"],
                  ["Ferry", "Ferries", "directions_boat"],
                  ["camera", "Cameras", "videocam"],
                  ["hydrophone", "Hydrophones", "graphic_eq"],
                ] as const).map(([filter, label, icon]) => {
                  const active =
                    filter === "top"
                      ? topPlacesVisible
                      : filter === "all"
                        ? allPoiLayersVisible
                        : filter === "camera"
                          ? camerasVisible
                          : filter === "hydrophone"
                            ? hydrophonesVisible
                            : poiFilters[filter];
                  return (
                    <button
                      key={filter}
                      type="button"
                      className={active ? "isActive" : ""}
                      aria-pressed={active}
                      onClick={() => {
                        if (filter === "top") {
                          setTopPlacesVisible(true);
                          setPoiFilters({ Park: false, Marina: false, Ferry: false });
                          setCamerasVisible(false);
                          setHydrophonesVisible(false);
                        } else if (filter === "all") {
                          setTopPlacesVisible(false);
                          setPoiFilters({ Park: true, Marina: true, Ferry: true });
                          setCamerasVisible(true);
                          setHydrophonesVisible(true);
                        } else if (filter === "camera") {
                          setTopPlacesVisible(false);
                          setCamerasVisible((visible) => !visible);
                        } else if (filter === "hydrophone") {
                          setTopPlacesVisible(false);
                          setHydrophonesVisible((visible) => !visible);
                        } else {
                          setTopPlacesVisible(false);
                          setPoiFilters((current) => ({ ...current, [filter]: !current[filter] }));
                        }
                      }}
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">{icon}</span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className={`plannerResultsPage__quickAction plannerResultsPage__quickAction--places${placesMenuOpen ? " isExpanded" : ""}`}
                aria-expanded={placesMenuOpen}
                aria-controls="planner-places-filters"
                onClick={() => {
                  setPlacesMenuOpen((open) => !open);
                  setSelectedCameraId(null);
                  setSelectedHydrophoneId(null);
                }}
              >
                <span className="material-symbols-rounded plannerResultsPage__placesFabIcon" aria-hidden="true">add</span>
                <span>Places</span>
                <em>{displayedRecommendedPlaces.length}</em>
              </button>
            </div>
          ) : null}
          <div ref={settingsRef} className="plannerResultsPage__settingsDock">
            {settingsOpen && (
              <section
                className="footerDock__panel footerDock__panel--settings plannerResultsPage__settingsPanel"
                role="dialog"
                aria-modal="false"
              >
                <div className="footerDock__panelHeader footerDock__panelHeader--settings">
                  <div className="footerDock__titleRow">
                    <div>
                      <div className="footerDock__sectionLabel">Planner settings</div>
                      <div className="footerDock__title">Settings</div>
                    </div>
                  </div>
                  <div className="footerDock__headerActions">
                    <button
                      type="button"
                      className="footerDock__closeButton"
                      onClick={() => setSettingsOpen(false)}
                      aria-label="Close settings"
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">
                        close
                      </span>
                    </button>
                  </div>
                </div>

                <section className="footerDock__section footerDock__section--settings">
                  <div className="footerDock__sectionLabel">Display</div>
                  <label className="footerDock__settingRow footerDock__settingRow--select">
                    <span className="footerDock__settingLabel">Units</span>
                    <span className="footerDock__selectWrap">
                      <select
                        className="select select--footer"
                        value={unitsMode}
                        onChange={(event) => setUnitsMode(event.target.value as "imperial" | "metric")}
                        aria-label="Units"
                      >
                        <option value="imperial">Imperial</option>
                        <option value="metric">Metric</option>
                      </select>
                      <span className="material-symbols-rounded footerDock__selectChevron" aria-hidden="true">
                        expand_more
                      </span>
                    </span>
                  </label>
                </section>

                <section className="footerDock__section footerDock__section--settings">
                  <div className="footerDock__sectionLabel">Map layers</div>
                  <label className="footerDock__settingRow footerDock__settingRow--select">
                    <span className="footerDock__settingLabel">Surface view</span>
                    <span className="footerDock__settingControls footerDock__settingControls--layers">
                      <span className="footerDock__resolutionInline">
                        <H3ResolutionPill
                          value={resolution === "H4" ? 4 : resolution === "H5" ? 5 : 6}
                          onChange={(next) => setResolution(next === 4 ? "H4" : next === 5 ? "H5" : "H6")}
                          compact
                        />
                      </span>
                      <span className="footerDock__selectWrap">
                        <select
                          className="select select--footer"
                          value={surfaceMode}
                          onChange={(event) => setSurfaceMode(event.target.value as "grid" | "surface")}
                          aria-label="Surface view"
                        >
                          <option value="grid">Hex grid</option>
                          <option value="surface">Smooth</option>
                        </select>
                        <span className="material-symbols-rounded footerDock__selectChevron" aria-hidden="true">
                          expand_more
                        </span>
                      </span>
                    </span>
                  </label>
                </section>

              </section>
            )}

            <button
              type="button"
              className={`plannerResultsPage__quickAction plannerResultsPage__quickAction--settings${settingsOpen ? " isActive" : ""}`}
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              aria-label="Open planner settings"
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                settings
              </span>
            </button>
          </div>
        </div>
        ) : null}

        {(tripLoading || tripError || recommendedPlacesData.error) && (
          <div className="plannerResultsPage__statusBanner">
            {tripLoading
              ? "Loading historical sightings and trip recommendations…"
              : tripError || recommendedPlacesData.error || "Planner results are unavailable."}
          </div>
        )}

        {itineraryExportOpen ? (
          <div className="plannerResultsPage__itineraryExportOverlay" role="presentation" onMouseDown={() => setItineraryExportOpen(false)}>
            <section
              className="plannerResultsPage__itineraryExportDialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="planner-itinerary-export-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="plannerResultsPage__itineraryExportHeader">
                <div>
                  <div className="plannerResultsPage__spotsEyebrow">Salish Sea trip</div>
                  <h2 id="planner-itinerary-export-title">Your itinerary</h2>
                  <p>{tripLabel}</p>
                </div>
                <button type="button" className="plannerResultsPage__itineraryExportClose" onClick={() => setItineraryExportOpen(false)} aria-label="Close itinerary export">
                  <span className="material-symbols-rounded" aria-hidden="true">close</span>
                </button>
              </div>
              <div className="plannerResultsPage__itineraryExportList">
                {itineraryPlaces.map((place, index) => (
                  <div className="plannerResultsPage__itineraryExportStop" key={place.id}>
                    <span className="plannerResultsPage__itineraryExportNumber">{index + 1}</span>
                    <div>
                      <strong>{place.name}</strong>
                      <span>{place.region ?? "Salish Sea"}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="plannerResultsPage__itineraryExportFooter">{itineraryPlaces.length} {itineraryPlaces.length === 1 ? "stop" : "stops"} planned</div>
            </section>
          </div>
        ) : null}

        <Suspense fallback={null}>
          {infoOpen && (
            <InfoModal
              open={infoOpen}
              onClose={() => setInfoOpen(false)}
              onStartTour={() => setInfoOpen(false)}
              darkMode={false}
            />
          )}
        </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
