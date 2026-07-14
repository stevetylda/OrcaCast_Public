import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { Link } from "react-router-dom";
import { AppFooter } from "../../shared/components/AppFooter";
import { AppHeader } from "../../shared/components/AppHeader";
import { trackRender } from "../../shared/debug/perf";
import {
  ForecastMap,
  type ForecastMapHandle,
  type ForecastMapProps,
} from "../../features/map";
import { SuggestedPlacesPanel } from "../../features/watch/components/SuggestedPlacesPanel";
import { WeekTimelineBar } from "../../features/watch/components/WeekTimelineBar";
import { isoWeekToDateRange } from "../../shared/time/forecastPeriodToIsoWeek";
import { WatchPageFailureState } from "./WatchPageFailureState";
import type { WatchPageController } from "./useWatchPageController";
import { PALETTES } from "../../shared/geo/palettes";
import {
  LoadingAnimation,
  LoadingOverlay,
} from "../../shared/components/loading";
import {
  loadOrcasoundHydrophones,
  type OrcasoundHydrophone,
} from "../../shared/data/orcasoundHydrophones";
import { loadPoiData } from "../../features/locations/poiData";
import type { ViewingLocation } from "../../features/locations/types";

function pickLegendColors(colors: string[], colorNoData = false) {
  const source = colorNoData ? colors.slice(1) : colors;
  return source.length > 0 ? source : colors;
}

function formatItineraryPlaceType(type: string) {
  return type === "Ferry" ? "Ferry terminal" : type;
}

function getItineraryPlaceTypeIcon(type: string) {
  if (type === "Park") return "park";
  if (type === "Ferry") return "directions_boat";
  if (type === "Marina") return "anchor";
  return "waves";
}

type WatchPageLayoutProps = {
  controller: WatchPageController;
};

function formatWeekRange(year: number, statWeek: number) {
  const { start, end } = isoWeekToDateRange(year, statWeek);
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameMonth = startDate.getUTCMonth() === endDate.getUTCMonth();
  const startLabel = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const endLabel = endDate.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year:
      startDate.getUTCFullYear() === endDate.getUTCFullYear()
        ? undefined
        : "numeric",
    timeZone: "UTC",
  });
  return `${startLabel} – ${endLabel}`;
}

const TREND_PRESENTATION = {
  up: { icon: "north_east", label: "Trending up" },
  down: { icon: "south_east", label: "Trending down" },
  steady: { icon: "east", label: "Holding steady" },
  none: { icon: "waves", label: "Weekly outlook" },
} as const;

const WATCH_REVEAL_MIN_DURATION_MS = 300;
const WATCH_REVEAL_EXIT_DURATION_MS = 180;

export function WatchPageLayout({ controller }: WatchPageLayoutProps) {
  trackRender("WatchPageLayout");
  const [sidebarOffsetPx, setSidebarOffsetPx] = useState(0);
  const [recommendedPanelOpen, setRecommendedPanelOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [itineraryPlaceIds, setItineraryPlaceIds] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(
        window.sessionStorage.getItem("orcacast.planner.itinerary.v1") ?? "[]",
      );
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [itineraryExpanded, setItineraryExpanded] = useState(false);
  const [itineraryExportOpen, setItineraryExportOpen] = useState(false);
  const [itineraryExportBusy, setItineraryExportBusy] = useState(false);
  const [itineraryExportMapReady, setItineraryExportMapReady] = useState(false);
  const itineraryExportMapRef = useRef<ForecastMapHandle | null>(null);
  const itineraryExportCardRef = useRef<HTMLElement | null>(null);
  const [draggingItineraryPlaceId, setDraggingItineraryPlaceId] = useState<
    string | null
  >(null);
  const [itineraryDropTargetId, setItineraryDropTargetId] = useState<
    string | null
  >(null);
  const [itineraryMapViewActive, setItineraryMapViewActive] = useState(false);
  const [itineraryAddPulse, setItineraryAddPulse] = useState(false);
  const [thisWeekLoading, setThisWeekLoading] = useState(true);
  const [hydrophoneLocations, setHydrophoneLocations] = useState<
    OrcasoundHydrophone[]
  >([]);
  const [selectedHydrophoneId, setSelectedHydrophoneId] = useState<
    string | null
  >(null);
  const [cameraLocations, setCameraLocations] = useState<ViewingLocation[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [camerasVisible, setCamerasVisible] = useState(false);
  const [hydrophonesVisible, setHydrophonesVisible] = useState(false);
  const [watchRevealMinimumElapsed, setWatchRevealMinimumElapsed] =
    useState(false);
  const [renderedForecastLoadKey, setRenderedForecastLoadKey] = useState("");
  const {
    primaryMapRef,
    darkMode,
    unitsMode,
    setUnitsMode,
    surfaceMode,
    setSurfaceMode,
    resolution,
    modelId,
    forecastIndex,
    setForecastIndex,
    forecastPlaybackPlaying,
    setForecastPlaybackPlaying,
    forecastPlaybackDirection,
    setForecastPlaybackDirection,
    periods,
    hotspotsEnabled,
    setHotspotsEnabled,
    hotspotMode,
    hotspotPercentile,
    selectedPaletteId,
    setSelectedPaletteId,
    setHotspotTotalCells,
    poiFilters,
    setPoiFilters,
    mapResetNonce,
    forecastPath,
    latestForecastPath,
    expectedSummary,
    currentWeek,
    currentWeekYear,
    showNoForecastNotice,
    usingFallbackForecast,
    selectedPeriodIsCurrentWeek,
    latestAvailableForecastRange,
    shareBusy,
    suggestedPlaces,
    suggestedPlacesLoading,
    suggestedPlacesError,
    selectedPlaceId,
    setSelectedPlaceId,
    shareSnapshot,
    downloadSnapshotAction,
    setMenuOpen,
    pageLoadError,
    reportFatalDataError,
    retryPageLoad,
  } = controller;

  const mainMapKey = `map-main-${mapResetNonce}`;
  const weekRangeLabel = useMemo(
    () => formatWeekRange(currentWeekYear, currentWeek),
    [currentWeek, currentWeekYear],
  );
  const trendPresentation = TREND_PRESENTATION[expectedSummary.trend];
  const paletteEntries = useMemo(() => Object.values(PALETTES), []);
  const legendColors = useMemo(
    () => pickLegendColors(PALETTES[selectedPaletteId].colors, true),
    [selectedPaletteId],
  );
  const itineraryPlaces = useMemo(
    () =>
      itineraryPlaceIds
        .map((id) => suggestedPlaces.find((place) => place.id === id))
        .filter((place): place is NonNullable<typeof place> => Boolean(place)),
    [itineraryPlaceIds, suggestedPlaces],
  );
  const mapSuggestedPlaces = itineraryMapViewActive
    ? itineraryPlaces
    : suggestedPlaces;

  useEffect(() => {
    if (!itineraryExportOpen) return;
    setItineraryExportMapReady(false);
    const locations = itineraryPlaces.map(
      (place) => [place.longitude, place.latitude] as [number, number],
    );
    const fit = () =>
      itineraryExportMapRef.current?.fitLocations(locations, {
        padding: 72,
        maxZoom: 11,
      });
    const firstTimer = window.setTimeout(fit, 250);
    const secondTimer = window.setTimeout(fit, 1_050);
    const readyTimer = window.setTimeout(
      () => setItineraryExportMapReady(true),
      1_350,
    );
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setItineraryExportOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
      window.clearTimeout(readyTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [itineraryExportOpen, itineraryPlaces]);
  useEffect(() => {
    window.sessionStorage.setItem(
      "orcacast.planner.itinerary.v1",
      JSON.stringify(itineraryPlaceIds),
    );
  }, [itineraryPlaceIds]);

  useEffect(() => {
    if (!itineraryAddPulse) return;
    const timerId = window.setTimeout(() => setItineraryAddPulse(false), 900);
    return () => window.clearTimeout(timerId);
  }, [itineraryAddPulse]);

  const forecastLoadKey = forecastPath ?? latestForecastPath ?? "";
  const watchResourcesReady =
    periods.length > 0 &&
    forecastLoadKey.length > 0 &&
    renderedForecastLoadKey === forecastLoadKey;
  const thisWeekLoaderComplete =
    watchRevealMinimumElapsed && watchResourcesReady;

  useEffect(() => {
    const timerId = window.setTimeout(
      () => setWatchRevealMinimumElapsed(true),
      WATCH_REVEAL_MIN_DURATION_MS,
    );
    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    if (!thisWeekLoaderComplete) return;
    const timerId = window.setTimeout(
      () => setThisWeekLoading(false),
      WATCH_REVEAL_EXIT_DURATION_MS,
    );
    return () => window.clearTimeout(timerId);
  }, [thisWeekLoaderComplete]);

  useEffect(() => {
    let cancelled = false;
    void loadPoiData()
      .then((items) => {
        if (cancelled) return;
        setCameraLocations(
          items
            .filter(
              (item) =>
                item.hasLiveFeed &&
                typeof item.liveCameraUrl === "string" &&
                item.liveCameraUrl.length > 0,
            )
            .map((item, index) => ({
              id: `camera-${index}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
              name: item.name,
              region: item.region ?? "Viewing location",
              latitude: item.latitude,
              longitude: item.longitude,
              liveCameraUrl: item.liveCameraUrl,
            })),
        );
      })
      .catch((error) =>
        console.warn("[This Week] failed to load live camera locations", error),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadOrcasoundHydrophones()
      .then((items) => {
        if (!cancelled) setHydrophoneLocations(items);
      })
      .catch((error) =>
        console.warn("[This Week] failed to load Orcasound hydrophones", error),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const addPlaceToItinerary = (place: (typeof suggestedPlaces)[number]) => {
    if (itineraryPlaceIds.includes(place.id)) return;
    setItineraryPlaceIds((current) => [...current, place.id]);
    setItineraryExpanded(false);
    setItineraryAddPulse(true);
  };

  const moveItineraryPlace = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setItineraryPlaceIds((current) => {
      const sourceIndex = current.indexOf(sourceId);
      const targetIndex = current.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, sourceId);
      return next;
    });
  };

  const handleItineraryDragStart = (
    placeId: string,
    event: DragEvent<HTMLElement>,
  ) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", placeId);
    setDraggingItineraryPlaceId(placeId);
    setItineraryDropTargetId(null);
  };

  const handleItineraryDragEnd = () => {
    setDraggingItineraryPlaceId(null);
    setItineraryDropTargetId(null);
  };

  const downloadItineraryExport = async () => {
    if (
      itineraryExportBusy ||
      !itineraryExportMapReady ||
      itineraryPlaces.length === 0
    )
      return;
    setItineraryExportBusy(true);
    try {
      const card = itineraryExportCardRef.current;
      if (!card) throw new Error("The itinerary card is not ready.");
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(card, {
        backgroundColor: "#fff8e9",
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
        filter: (node) =>
          !(
            node instanceof HTMLElement && node.dataset.exportExclude === "true"
          ),
      });
      if (!blob)
        throw new Error(
          "The itinerary image could not be created. Please try again.",
        );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `orcacast_itinerary_${currentWeekYear}_week_${currentWeek}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      console.error("[Itinerary Export]", error);
    } finally {
      setItineraryExportBusy(false);
    }
  };
  const pageStyle = useMemo(
    () =>
      ({
        "--this-week-panel-offset": `${Math.max(0, sidebarOffsetPx)}px`,
      }) as CSSProperties,
    [sidebarOffsetPx],
  );

  const commonHeaderProps = {
    title: "OrcaCast",
    subtitle: "Forecast Lab",
    variant: "home" as const,
    onOpenInfo: () => controller.setInfoOpen(true),
    onOpenMenu: () => setMenuOpen(true),
    rightSlot: (
      <nav className="homeNav" aria-label="This week navigation">
        <Link to="/watch" aria-current="page">
          This week
        </Link>
        <Link to="/planner">Plan a trip</Link>
        <Link to="/explore">Explore</Link>
      </nav>
    ),
  };

  const commonMapProps = {
    darkMode,
    basemapMode: "vector" as const,
    showMapControls: false,
    showLegendControl: false,
    colorNoData: true,
    gridPresentation: "quiet" as const,
    paletteId: selectedPaletteId,
    surfaceMode,
    poiFilters,
    periods,
    hotspotsEnabled,
    hotspotMode,
    hotspotPercentile,
    expectedActivityHotspotCellCount: expectedSummary.current,
    onHotspotsEnabledChange: setHotspotsEnabled,
    onGridCellCount: setHotspotTotalCells,
    enableGridInteraction: false,
    onFatalDataError: reportFatalDataError,
    suggestedPlaces: mapSuggestedPlaces,
    selectedPlaceId,
    onPlaceSelect: (place) => setSelectedPlaceId(place.id),
    sidebarOffsetPx,
    mapModeLabel: "Loading this week’s forecast…",
    itineraryPlaceIds,
    showTripHotspotMarkers: true,
    forceDomSuggestedMarkers: true,
    hydrophoneLocations,
    selectedHydrophoneId,
    showHydrophones: hydrophonesVisible,
    cameraLocations,
    selectedCameraId,
    showCameras: camerasVisible,
  } satisfies Pick<
    ForecastMapProps,
    | "darkMode"
    | "basemapMode"
    | "showMapControls"
    | "showLegendControl"
    | "colorNoData"
    | "gridPresentation"
    | "paletteId"
    | "surfaceMode"
    | "poiFilters"
    | "periods"
    | "hotspotsEnabled"
    | "hotspotMode"
    | "hotspotPercentile"
    | "expectedActivityHotspotCellCount"
    | "onHotspotsEnabledChange"
    | "onGridCellCount"
    | "enableGridInteraction"
    | "onFatalDataError"
    | "suggestedPlaces"
    | "selectedPlaceId"
    | "onPlaceSelect"
    | "sidebarOffsetPx"
    | "mapModeLabel"
    | "itineraryPlaceIds"
    | "showTripHotspotMarkers"
    | "forceDomSuggestedMarkers"
    | "hydrophoneLocations"
    | "selectedHydrophoneId"
    | "showHydrophones"
    | "cameraLocations"
    | "selectedCameraId"
    | "showCameras"
  >;

  const renderForecastMap = (
    key: string,
    props: Pick<
      ForecastMapProps,
      "resolution" | "modelId" | "selectedWeek" | "selectedWeekYear"
    > &
      Partial<ForecastMapProps>,
    withPrimaryRef = false,
  ) => (
    <ForecastMap
      {...commonMapProps}
      {...props}
      ref={withPrimaryRef ? primaryMapRef : undefined}
      key={key}
    />
  );

  if (pageLoadError) {
    return (
      <div className="mapPageRoot mapPageRoot--thisWeek">
        <AppHeader {...commonHeaderProps} />
        <main className="app__main">
          <WatchPageFailureState
            title="Data failed to load"
            message="The map could not start because a required data file was unavailable."
            failingPath={pageLoadError.path}
            status={pageLoadError.status}
            details={pageLoadError.details ?? pageLoadError.message}
            onRetry={retryPageLoad}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="mapPageRoot mapPageRoot--thisWeek">
      <AppHeader {...commonHeaderProps} />

      <main className="app__main">
        <div
          className={`plannerResultsPage hasPlan thisWeekResultsPage${
            recommendedPanelOpen
              ? " isRecommendedOpen"
              : " isRecommendedCollapsed"
          }`}
          style={pageStyle}
        >
          <div className="plannerResultsPage__main thisWeekResultsPage__main">
            <div className="plannerResultsPage__mapLayer thisWeekResultsPage__mapLayer">
              {renderForecastMap(
                mainMapKey,
                {
                  resolution,
                  modelId,
                  selectedWeek: currentWeek,
                  selectedWeekYear: currentWeekYear,
                  forecastPath,
                  fallbackForecastPath: latestForecastPath,
                  forecastOverlayLoadKey: forecastLoadKey,
                  onForecastOverlayReady: setRenderedForecastLoadKey,
                },
                true,
              )}
            </div>

            <aside
              className={`plannerResultsPage__legendCard${paletteOpen ? " isPaletteOpen" : ""}`}
              aria-label="Typical orca activity legend, low to high"
            >
              <button
                type="button"
                className="plannerResultsPage__legendPaletteTrigger"
                aria-label="Typical activity color scale"
                aria-haspopup="listbox"
                aria-expanded={paletteOpen}
                onClick={() => setPaletteOpen((open) => !open)}
              />
              <strong className="plannerResultsPage__legendTitle">
                Activity likelihood
              </strong>
              <div className="plannerResultsPage__legendScale">
                <span>Lower</span>
                <div
                  className="plannerResultsPage__legendRamp"
                  aria-hidden="true"
                >
                  {legendColors.map((color, index) => (
                    <span
                      key={`${color}-${index}`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
                <span>Higher</span>
              </div>
              {paletteOpen ? (
                <div
                  className="plannerResultsPage__legendPaletteList"
                  role="listbox"
                  aria-label="Color scale palettes"
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
                        onClick={() => {
                          setSelectedPaletteId(palette.id);
                          setPaletteOpen(false);
                        }}
                      >
                        <span
                          className="plannerResultsPage__legendPaletteSwatches"
                          aria-hidden="true"
                        >
                          {palette.colors.slice(0, 6).map((color, index) => (
                            <span
                              key={`${palette.id}-${index}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </span>
                        <span>{palette.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </aside>

            <section
              className="thisWeekResultsPage__summaryCard"
              aria-labelledby="thisWeekSummaryTitle"
            >
              <div
                className="thisWeekResultsPage__summaryIcon"
                aria-hidden="true"
              >
                <span className="material-symbols-rounded">waves</span>
              </div>
              <div className="thisWeekResultsPage__summaryBody">
                <p className="thisWeekResultsPage__eyebrow">
                  This week’s outlook
                </p>
                <div className="thisWeekResultsPage__summaryLine">
                  <h1 id="thisWeekSummaryTitle">{weekRangeLabel}</h1>
                  <div className="thisWeekResultsPage__summaryMeta">
                    <span>
                      <span
                        className="material-symbols-rounded"
                        aria-hidden="true"
                      >
                        {trendPresentation.icon}
                      </span>
                      {trendPresentation.label}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {itineraryPlaceIds.length > 0 ? (
              <aside
                className={`thisWeekResultsPage__itineraryPopover${itineraryExpanded ? " isExpanded" : ""}${itineraryAddPulse ? " isNewlyAdded" : ""}`}
                aria-label="Your itinerary"
              >
                <button
                  type="button"
                  className="thisWeekResultsPage__itineraryPopoverHeader"
                  onClick={() => setItineraryExpanded((expanded) => !expanded)}
                  aria-expanded={itineraryExpanded}
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    route
                  </span>
                  <strong>Your itinerary</strong>
                  <em>{itineraryPlaceIds.length}</em>
                  {itineraryAddPulse ? (
                    <span
                      className="thisWeekResultsPage__itineraryAddStamp"
                      aria-hidden="true"
                    >
                      +1
                    </span>
                  ) : null}
                  <span
                    role="button"
                    tabIndex={0}
                    className={`thisWeekResultsPage__itineraryMapButton${itineraryMapViewActive ? " isActive" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (itineraryPlaces.length === 0) return;
                      setItineraryMapViewActive(true);
                      setSelectedPlaceId(null);
                      primaryMapRef.current?.fitLocations(
                        itineraryPlaces.map((place) => [
                          place.longitude,
                          place.latitude,
                        ]),
                        {
                          padding: {
                            top: 110,
                            right: 480,
                            bottom: 160,
                            left: 470,
                          },
                          maxZoom: 10.8,
                        },
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (itineraryPlaces.length === 0) return;
                      setItineraryMapViewActive(true);
                      setSelectedPlaceId(null);
                      primaryMapRef.current?.fitLocations(
                        itineraryPlaces.map((place) => [
                          place.longitude,
                          place.latitude,
                        ]),
                        {
                          padding: {
                            top: 110,
                            right: 480,
                            bottom: 160,
                            left: 470,
                          },
                          maxZoom: 10.8,
                        },
                      );
                    }}
                    aria-label="Show itinerary stops on map"
                    title="Show itinerary stops"
                  >
                    <span
                      className="material-symbols-rounded"
                      aria-hidden="true"
                    >
                      visibility
                    </span>
                  </span>
                  <span
                    className="material-symbols-rounded thisWeekResultsPage__itineraryPopoverChevron"
                    aria-hidden="true"
                  >
                    {itineraryExpanded ? "expand_less" : "expand_more"}
                  </span>
                </button>
                {itineraryExpanded ? (
                  <button
                    type="button"
                    className="thisWeekResultsPage__itineraryExportLaunch"
                    onClick={() => setItineraryExportOpen(true)}
                  >
                    <span
                      className="material-symbols-rounded"
                      aria-hidden="true"
                    >
                      ios_share
                    </span>
                    Export
                  </button>
                ) : null}
                {itineraryExpanded ? (
                  <ol>
                    {itineraryPlaceIds.map((id, index) => {
                      const place = suggestedPlaces.find(
                        (item) => item.id === id,
                      );
                      return place ? (
                        <li
                          key={id}
                          className={`${draggingItineraryPlaceId === id ? "isDragging" : ""}${itineraryDropTargetId === id && draggingItineraryPlaceId !== id ? " isDropTarget" : ""}`}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setItineraryDropTargetId(id);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            moveItineraryPlace(
                              draggingItineraryPlaceId ??
                                event.dataTransfer.getData("text/plain"),
                              id,
                            );
                            handleItineraryDragEnd();
                          }}
                        >
                          <button
                            type="button"
                            className="thisWeekResultsPage__itineraryDragHandle"
                            draggable
                            onDragStart={(event) =>
                              handleItineraryDragStart(id, event)
                            }
                            onDragEnd={handleItineraryDragEnd}
                            aria-label={`Drag ${place.name}`}
                          >
                            ⠿
                          </button>
                          <span className="thisWeekResultsPage__itineraryStopNumber">
                            {index + 1}
                          </span>
                          <span className="thisWeekResultsPage__itineraryStopCopy">
                            <strong>{place.name}</strong>
                            <small>
                              <span
                                className="material-symbols-rounded"
                                aria-hidden="true"
                              >
                                {getItineraryPlaceTypeIcon(place.type)}
                              </span>
                              {formatItineraryPlaceType(place.type)}
                            </small>
                          </span>
                          <button
                            type="button"
                            className="thisWeekResultsPage__itineraryStopRemove"
                            onClick={() =>
                              setItineraryPlaceIds((current) =>
                                current.filter((item) => item !== id),
                              )
                            }
                            aria-label={`Remove ${place.name} from itinerary`}
                          >
                            <span
                              className="material-symbols-rounded"
                              aria-hidden="true"
                            >
                              close
                            </span>
                          </button>
                        </li>
                      ) : null;
                    })}
                  </ol>
                ) : null}
              </aside>
            ) : null}

            <SuggestedPlacesPanel
              places={suggestedPlaces}
              selectedPlaceId={selectedPlaceId}
              isLoading={suggestedPlacesLoading}
              error={suggestedPlacesError}
              mapRef={primaryMapRef}
              open={recommendedPanelOpen}
              onOpen={() => setRecommendedPanelOpen(true)}
              onClose={() => setRecommendedPanelOpen(false)}
              onSelectPlace={(place) => setSelectedPlaceId(place.id)}
              onClearSelection={() => setSelectedPlaceId(null)}
              isItineraryMapView={itineraryMapViewActive}
              onShowTopPlaces={() => {
                setItineraryMapViewActive(false);
                setSelectedPlaceId(null);
                primaryMapRef.current?.fitLocations(
                  suggestedPlaces.map((place) => [
                    place.longitude,
                    place.latitude,
                  ]),
                  {
                    padding: { top: 110, right: 480, bottom: 160, left: 70 },
                    maxZoom: 9.8,
                  },
                );
              }}
              itineraryPlaceIds={itineraryPlaceIds}
              onAddToItinerary={addPlaceToItinerary}
              onRemoveFromItinerary={(place) =>
                setItineraryPlaceIds((current) =>
                  current.filter((id) => id !== place.id),
                )
              }
              onLayoutChange={setSidebarOffsetPx}
            />

            <section
              className="thisWeekResultsPage__timelineCard"
              aria-label="Weekly forecast timeline"
            >
              <div className="thisWeekResultsPage__timelineHeading">
                <div
                  className="thisWeekResultsPage__timelineIcon"
                  aria-hidden="true"
                >
                  <span className="material-symbols-rounded">date_range</span>
                </div>
                <div>
                  <p className="thisWeekResultsPage__eyebrow">
                    Forecast window
                  </p>
                  <h2>Browse the weekly outlook</h2>
                </div>
              </div>
              <WeekTimelineBar
                periods={periods}
                selectedIndex={Math.max(0, forecastIndex)}
                onChangeIndex={setForecastIndex}
                isPlaying={forecastPlaybackPlaying}
                onPlayingChange={setForecastPlaybackPlaying}
                playDir={forecastPlaybackDirection}
                onPlayDirChange={setForecastPlaybackDirection}
                rightInsetPx={sidebarOffsetPx}
              />
            </section>

            {showNoForecastNotice || usingFallbackForecast ? (
              <div
                className="thisWeekResultsPage__statusBanner"
                role="status"
                aria-live="polite"
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  info
                </span>
                <span>
                  {selectedPeriodIsCurrentWeek
                    ? "A forecast for this week is not available. "
                    : "This period does not have a dedicated forecast. "}
                  {latestAvailableForecastRange
                    ? `Showing the latest packaged forecast (${latestAvailableForecastRange.start} to ${latestAvailableForecastRange.end}).`
                    : "Showing the latest available forecast surface."}
                </span>
              </div>
            ) : null}
          </div>
          {thisWeekLoading ? (
            <LoadingOverlay
              complete={thisWeekLoaderComplete}
              className="thisWeekResultsPage__revealGate"
            >
              <LoadingAnimation
                variant="orca"
                complete={thisWeekLoaderComplete}
                label="Preparing this week's forecast"
                completeLabel={
                  usingFallbackForecast
                    ? "Latest available forecast is ready"
                    : "This week's forecast is ready"
                }
              />
            </LoadingOverlay>
          ) : null}
        </div>

        <div className="app__footer">
          <AppFooter
            onShareSnapshot={shareSnapshot}
            onDownloadSnapshot={downloadSnapshotAction}
            shareBusy={shareBusy}
            places={suggestedPlaces}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={(place) => setSelectedPlaceId(place.id)}
            hydrophones={hydrophoneLocations}
            onToggleLiveCameras={(visible) => {
              setCamerasVisible(visible);
              if (!visible) setSelectedCameraId(null);
            }}
            onToggleHydrophones={(visible) => {
              setHydrophonesVisible(visible);
              if (!visible) setSelectedHydrophoneId(null);
            }}
            onSelectHydrophone={(hydrophone) => {
              setSelectedPlaceId(null);
              setHydrophonesVisible(true);
              setSelectedHydrophoneId(hydrophone.id);
              primaryMapRef.current?.fitLocations(
                [[hydrophone.longitude, hydrophone.latitude]],
                {
                  padding: { top: 110, right: 480, bottom: 160, left: 70 },
                  maxZoom: 11,
                },
              );
            }}
            unitsMode={unitsMode}
            onUnitsModeChange={setUnitsMode}
            surfaceMode={surfaceMode}
            onSurfaceModeChange={setSurfaceMode}
            poiFilters={poiFilters}
            onTogglePoiAll={() =>
              setPoiFilters((prev) => {
                const allOn = prev.Park && prev.Marina && prev.Ferry;
                return { Park: !allOn, Marina: !allOn, Ferry: !allOn };
              })
            }
            onTogglePoiType={(type) =>
              setPoiFilters((prev) => ({ ...prev, [type]: !prev[type] }))
            }
            selectedPaletteId={selectedPaletteId}
            onPaletteChange={setSelectedPaletteId}
            showPalette={false}
          />
        </div>
      </main>

      {itineraryExportOpen ? (
        <div
          className="thisWeekItineraryExport__overlay"
          role="presentation"
          onMouseDown={() => setItineraryExportOpen(false)}
        >
          <section
            ref={itineraryExportCardRef}
            className="thisWeekItineraryExport"
            role="dialog"
            aria-modal="true"
            aria-labelledby="this-week-itinerary-export-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="thisWeekItineraryExport__header">
              <div
                className="thisWeekItineraryExport__brand"
                aria-hidden="true"
              >
                <span className="material-symbols-rounded">waves</span>
                <strong>OrcaCast</strong>
                <em>— Forecast Lab</em>
              </div>
              <div className="thisWeekItineraryExport__fieldLabel">
                Salish Sea field plan
              </div>
              <button
                type="button"
                className="thisWeekItineraryExport__close"
                data-export-exclude="true"
                onClick={() => setItineraryExportOpen(false)}
                aria-label="Close itinerary export"
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  close
                </span>
              </button>
            </header>

            <div className="thisWeekItineraryExport__titleRow">
              <div>
                <h2 id="this-week-itinerary-export-title">
                  Your Orca-Watching Itinerary
                </h2>
                <p>
                  <strong>{weekRangeLabel}</strong> · {itineraryPlaces.length}{" "}
                  planned {itineraryPlaces.length === 1 ? "stop" : "stops"}
                </p>
              </div>
            </div>

            <div
              className="thisWeekItineraryExport__map"
              aria-label="Map fitted to itinerary stops"
            >
              <ForecastMap
                {...commonMapProps}
                ref={itineraryExportMapRef}
                resolution={resolution}
                modelId={modelId}
                selectedWeek={currentWeek}
                selectedWeekYear={currentWeekYear}
                forecastOverlayEnabled={false}
                suggestedPlaces={itineraryPlaces}
                itineraryPlaceIds={itineraryPlaceIds}
                selectedPlaceId={null}
                onPlaceSelect={undefined}
                poiFilters={{ Park: false, Marina: false, Ferry: false }}
                hotspotsEnabled={false}
                showTripHotspotMarkers
                forceDomSuggestedMarkers
                hydrophoneLocations={[]}
                showHydrophones={false}
                cameraLocations={[]}
                showCameras={false}
                sidebarOffsetPx={0}
                mapModeLabel="Preparing itinerary map…"
              />
            </div>

            <div className="thisWeekItineraryExport__stops">
              {itineraryPlaces.map((place, index) => (
                <div className="thisWeekItineraryExport__stop" key={place.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{place.name}</strong>
                    <small>{place.region ?? "Salish Sea"}</small>
                  </div>
                  <em>
                    <span
                      className="material-symbols-rounded"
                      aria-hidden="true"
                    >
                      {getItineraryPlaceTypeIcon(place.type)}
                    </span>
                    {formatItineraryPlaceType(place.type)}
                  </em>
                </div>
              ))}
            </div>

            <aside className="thisWeekItineraryExport__care">
              <div className="thisWeekItineraryExport__careHeading">
                <span className="material-symbols-rounded" aria-hidden="true">
                  volunteer_activism
                </span>
                <div>
                  <strong>Watch with care</strong>
                  <small>
                    Give Southern Residents room to feed, rest, and communicate.
                  </small>
                </div>
              </div>
              <div className="thisWeekItineraryExport__distance">
                <strong>1,000 yards</strong>
                <span>
                  In Washington waters, stay away from Southern Resident killer
                  whales.
                </span>
              </div>
              <div className="thisWeekItineraryExport__distance thisWeekItineraryExport__distance--navy">
                <strong>Within 400 yards</strong>
                <span>
                  Get out of their path and, if safe, disengage transmission or
                  stop paddling.
                </span>
              </div>
              <ul>
                <li>Within 1,000 yards, move away at 7 knots or less.</li>
                <li>
                  Never chase, encircle, leapfrog, feed, or separate mothers and
                  calves.
                </li>
                <li>
                  Check current local rules before departure at BeWhaleWise.org.
                </li>
              </ul>
            </aside>

            <footer className="thisWeekItineraryExport__footer">
              <span>Prepared with OrcaCast · {trendPresentation.label}</span>
              <button
                type="button"
                data-export-exclude="true"
                onClick={() => void downloadItineraryExport()}
                disabled={itineraryExportBusy || !itineraryExportMapReady}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  download
                </span>
                {itineraryExportBusy
                  ? "Preparing…"
                  : itineraryExportMapReady
                    ? "Download PNG"
                    : "Preparing map…"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
