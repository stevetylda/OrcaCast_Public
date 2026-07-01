import { AppHeader } from "../../shared/components/AppHeader";
import { AppFooter } from "../../shared/components/AppFooter";
import { ForecastMap, type ForecastMapProps } from "../../features/map";
import { SuggestedPlacesPanel } from "../../features/watch/components/SuggestedPlacesPanel";
import { WeekTimelineBar } from "../../features/watch/components/WeekTimelineBar";
import { TripPlannerHistogram } from "../../features/watch/components/TripPlannerHistogram";
import { WatchPageFailureState } from "./WatchPageFailureState";
import { trackRender } from "../../shared/debug/perf";
import {
  aggregateTripPlannerOccurrence,
  buildTripPlannerRange,
  loadTripPlannerOccurrencePayload,
  type TripLengthOption,
  type TripPlannerOccurrenceResult,
  type TripPlannerRange,
} from "../../shared/data/tripPlanner";
import type { WatchPageController } from "./useWatchPageController";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type PanelView = "this-week" | "trip-planner";

type WatchPageLayoutProps = {
  controller: WatchPageController;
};

export function WatchPageLayout({ controller }: WatchPageLayoutProps) {
  trackRender("WatchPageLayout");
  const [sidebarOffsetPx, setSidebarOffsetPx] = useState(0);
  const [plannerPanelOpen, setPlannerPanelOpen] = useState(true);
  const [plannerPanelView, setPlannerPanelView] = useState<PanelView>("this-week");
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripCity, setTripCity] = useState("");
  const [tripLength, setTripLength] = useState<TripLengthOption>("1 day");
  const [tripPlannerSearched, setTripPlannerSearched] = useState(false);
  const [tripOccurrence, setTripOccurrence] = useState<TripPlannerOccurrenceResult | null>(null);
  const [tripOccurrenceLoading, setTripOccurrenceLoading] = useState(false);
  const [tripOccurrenceError, setTripOccurrenceError] = useState<string | null>(null);
  const {
    primaryMapRef,
    darkMode,
    setThemeMode,
    unitsMode,
    setUnitsMode,
    surfaceMode,
    setSurfaceMode,
    resolution,
    setResolution,
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
    shareBusy,
    suggestedPlaces,
    suggestedPlacesLoading,
    suggestedPlacesError,
    selectedPlaceId,
    setSelectedPlaceId,
    shareSnapshot,
    downloadSnapshotAction,
    handleResetMap,
    openGridDetail,
    setMenuOpen,
    pageLoadError,
    reportFatalDataError,
    retryPageLoad,
  } = controller;

  const tripPlannerRange = useMemo<TripPlannerRange | null>(
    () => buildTripPlannerRange(tripStartDate, tripLength),
    [tripLength, tripStartDate]
  );
  const tripPlannerActive = plannerPanelOpen && plannerPanelView === "trip-planner";

  useEffect(() => {
    if (!tripPlannerSearched || !tripPlannerRange || !tripPlannerActive) {
      if (!tripPlannerSearched) {
        setTripOccurrence(null);
        setTripOccurrenceError(null);
      }
      setTripOccurrenceLoading(false);
      return;
    }

    let cancelled = false;
    setTripOccurrenceLoading(true);
    setTripOccurrenceError(null);
    loadTripPlannerOccurrencePayload(resolution)
      .then((payload) => {
        if (cancelled) return;
        setTripOccurrence(aggregateTripPlannerOccurrence(payload, tripPlannerRange));
      })
      .catch((error) => {
        if (cancelled) return;
        setTripOccurrence(null);
        setTripOccurrenceError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setTripOccurrenceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resolution, tripPlannerActive, tripPlannerRange, tripPlannerSearched]);

  const emptyTripValues = useMemo<Record<string, number>>(() => ({}), []);
  const tripExternalValues = useMemo(
    () => (tripPlannerActive && tripPlannerSearched && tripOccurrence ? tripOccurrence.values : undefined),
    [tripOccurrence, tripPlannerActive, tripPlannerSearched]
  );
  const tripPulseMap = tripPlannerActive && (!tripPlannerSearched || tripOccurrenceLoading);

  const mainMapKey = `map-main-${mapResetNonce}`;

  const commonHeaderProps = {
    title: "OrcaCast",
    subtitle: "Orca Sightings Forecast",
    onOpenInfo: () => controller.setInfoOpen(true),
    onOpenMenu: () => setMenuOpen(true),
    onBrandClick: handleResetMap,
    rightSlot: (
      <div className="headerModeActions" aria-label="Planner views">
        <button
          type="button"
          className={`headerModeAction${plannerPanelOpen && plannerPanelView === "this-week" ? " headerModeAction--active" : ""}`}
          onClick={() => {
            setPlannerPanelView("this-week");
            setPlannerPanelOpen(true);
          }}
          aria-pressed={plannerPanelOpen && plannerPanelView === "this-week"}
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            travel_explore
          </span>
          <span>This Week</span>
        </button>
        <button
          type="button"
          className={`headerModeAction headerModeAction--planner${
            plannerPanelOpen && plannerPanelView === "trip-planner" ? " headerModeAction--active" : ""
          }`}
          onClick={() => {
            setPlannerPanelView("trip-planner");
            setPlannerPanelOpen(true);
            setTripPlannerSearched(false);
            setTripOccurrence(null);
            setTripOccurrenceError(null);
          }}
          aria-pressed={plannerPanelOpen && plannerPanelView === "trip-planner"}
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            route
          </span>
          <span>Trip Planner</span>
        </button>
      </div>
    ),
  };

  const watchMapShellStyle = useMemo(
    () => {
      const sidebarOpen = sidebarOffsetPx > 0;
      return {
        "--week-timeline-left": `${32 + Math.round(sidebarOffsetPx * 0.14)}px`,
        "--week-timeline-right": `${sidebarOpen ? Math.max(32, sidebarOffsetPx + 24) : 32}px`,
        "--week-timeline-shift": sidebarOpen ? "0px" : "120px",
      } as CSSProperties;
    },
    [sidebarOffsetPx]
  );

  const commonMapProps = {
    darkMode,
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
    onGridCellExpand: openGridDetail,
    onFatalDataError: reportFatalDataError,
    suggestedPlaces: tripPlannerActive ? [] : suggestedPlaces,
    selectedPlaceId: tripPlannerActive ? null : selectedPlaceId,
    onPlaceSelect: (place) => setSelectedPlaceId(place.id),
    sidebarOffsetPx,
  } satisfies Pick<
    ForecastMapProps,
    | "darkMode"
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
    | "onGridCellExpand"
    | "onFatalDataError"
    | "suggestedPlaces"
    | "selectedPlaceId"
    | "onPlaceSelect"
    | "sidebarOffsetPx"
  >;

  const renderForecastMap = (
    key: string,
    props: Pick<ForecastMapProps, "resolution" | "modelId" | "selectedWeek" | "selectedWeekYear"> &
      Partial<ForecastMapProps>,
    withPrimaryRef = false
  ) => <ForecastMap {...commonMapProps} {...props} ref={withPrimaryRef ? primaryMapRef : undefined} key={key} />;

  if (pageLoadError) {
    return (
      <div className="mapPageRoot">
        <AppHeader
          {...commonHeaderProps}
        />
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
    <div className="mapPageRoot">
      <AppHeader
        {...commonHeaderProps}
      />

      <main className="app__main">
        <div className="watchMapShell" style={watchMapShellStyle}>
          {renderForecastMap(
            mainMapKey,
            {
              resolution,
              modelId,
              selectedWeek: currentWeek,
              selectedWeekYear: currentWeekYear,
              forecastPath: tripPlannerActive ? undefined : forecastPath,
              fallbackForecastPath: tripPlannerActive ? undefined : latestForecastPath,
              externalValues: tripPlannerActive ? tripExternalValues ?? emptyTripValues : undefined,
              pulseAllGridCells: tripPulseMap,
              mapModeLabel: tripPlannerSearched
                ? "Loading seasonal occurrence map…"
                : "Choose dates, then search seasonal occurrence",
            },
            true
          )}

          <SuggestedPlacesPanel
            places={tripPlannerActive ? [] : suggestedPlaces}
            selectedPlaceId={tripPlannerActive ? null : selectedPlaceId}
            isLoading={suggestedPlacesLoading}
            error={suggestedPlacesError}
            mapRef={primaryMapRef}
            unitsMode={unitsMode}
            activeView={plannerPanelView}
            open={plannerPanelOpen}
            onClose={() => setPlannerPanelOpen(false)}
            onSelectPlace={(place) => setSelectedPlaceId(place.id)}
            onLayoutChange={setSidebarOffsetPx}
            tripStartDate={tripStartDate}
            onTripStartDateChange={(value) => {
              setTripStartDate(value);
              setTripPlannerSearched(false);
              setTripOccurrence(null);
            }}
            tripCity={tripCity}
            onTripCityChange={setTripCity}
            tripLength={tripLength}
            onTripLengthChange={(value) => {
              setTripLength(value);
              setTripPlannerSearched(false);
              setTripOccurrence(null);
            }}
            tripPlannerSearched={tripPlannerSearched}
            tripPlannerLoading={tripOccurrenceLoading}
            tripPlannerError={tripOccurrenceError}
            tripPlannerRange={tripPlannerRange}
            tripOccurrenceSummary={tripOccurrence}
            onTripPlannerSearch={() => {
              setTripPlannerSearched(true);
              setTripOccurrence(null);
              setTripOccurrenceError(null);
            }}
            onTripPlannerEdit={() => {
              setTripPlannerSearched(false);
              setTripOccurrence(null);
              setTripOccurrenceError(null);
            }}
          />

          {tripPlannerActive ? (
            <TripPlannerHistogram
              histogram={tripOccurrence?.histogram ?? []}
              selectedRange={tripPlannerRange}
              loading={tripOccurrenceLoading}
              error={tripOccurrenceError}
              selectedCount={tripOccurrence?.selectedCount ?? 0}
              activeCells={tripOccurrence?.activeCells ?? 0}
              rightInsetPx={sidebarOffsetPx}
            />
          ) : (
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
          )}
        </div>

        <div className="app__footer">
          <AppFooter
            onShareSnapshot={shareSnapshot}
            onDownloadSnapshot={downloadSnapshotAction}
            shareBusy={shareBusy}
            places={tripPlannerActive ? [] : suggestedPlaces}
            selectedPlaceId={tripPlannerActive ? null : selectedPlaceId}
            onSelectPlace={(place) => setSelectedPlaceId(place.id)}
            darkMode={darkMode}
            onToggleDarkMode={() => setThemeMode(darkMode ? "light" : "dark")}
            resolution={resolution}
            onResolutionChange={setResolution}
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
            onTogglePoiType={(type) => setPoiFilters((prev) => ({ ...prev, [type]: !prev[type] }))}
            selectedPaletteId={selectedPaletteId}
            onPaletteChange={setSelectedPaletteId}
          />
        </div>
      </main>
    </div>
  );
}
