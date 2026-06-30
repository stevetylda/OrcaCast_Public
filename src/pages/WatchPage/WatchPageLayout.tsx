import { AppHeader } from "../../shared/components/AppHeader";
import { AppFooter } from "../../shared/components/AppFooter";
import { ForecastMap, type ForecastMapProps } from "../../features/map";
import { SuggestedPlacesPanel } from "../../features/watch/components/SuggestedPlacesPanel";
import { WeekTimelineBar } from "../../features/watch/components/WeekTimelineBar";
import { WatchPageFailureState } from "./WatchPageFailureState";
import { trackRender } from "../../shared/debug/perf";
import type { WatchPageController } from "./useWatchPageController";
import { useMemo, useState, type CSSProperties } from "react";

type WatchPageLayoutProps = {
  controller: WatchPageController;
};

export function WatchPageLayout({ controller }: WatchPageLayoutProps) {
  trackRender("WatchPageLayout");
  const [sidebarOffsetPx, setSidebarOffsetPx] = useState(0);
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
    setHotspotMode,
    hotspotPercentile,
    setHotspotPercentile,
    selectedPaletteId,
    setSelectedPaletteId,
    hotspotTotalCells,
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

  const mainMapKey = `map-main-${mapResetNonce}`;

  const commonHeaderProps = {
    title: "OrcaCast",
    subtitle: "Orca Sightings Forecast",
    resolution,
    onResolutionChange: setResolution,
    onOpenInfo: () => controller.setInfoOpen(true),
    onOpenMenu: () => setMenuOpen(true),
    onBrandClick: handleResetMap,
  };

  const watchMapShellStyle = useMemo(
    () =>
      ({
        "--week-timeline-left": `${32 + Math.round(sidebarOffsetPx * 0.14)}px`,
        "--week-timeline-right": `${Math.max(32, sidebarOffsetPx + 24)}px`,
      }) as CSSProperties,
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
    suggestedPlaces,
    selectedPlaceId,
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
              forecastPath,
              fallbackForecastPath: latestForecastPath,
            },
            true
          )}

          <SuggestedPlacesPanel
            places={suggestedPlaces}
            selectedPlaceId={selectedPlaceId}
            isLoading={suggestedPlacesLoading}
            error={suggestedPlacesError}
            mapRef={primaryMapRef}
            unitsMode={unitsMode}
            onSelectPlace={(place) => setSelectedPlaceId(place.id)}
            onLayoutChange={setSidebarOffsetPx}
          />

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
        </div>

        <div className="app__footer">
          <AppFooter
            onShareSnapshot={shareSnapshot}
            onDownloadSnapshot={downloadSnapshotAction}
            shareBusy={shareBusy}
            places={suggestedPlaces}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={(place) => setSelectedPlaceId(place.id)}
            darkMode={darkMode}
            onToggleDarkMode={() => setThemeMode(darkMode ? "light" : "dark")}
            unitsMode={unitsMode}
            onUnitsModeChange={setUnitsMode}
            surfaceMode={surfaceMode}
            onSurfaceModeChange={setSurfaceMode}
            hotspotsEnabled={hotspotsEnabled}
            onHotspotsEnabledChange={setHotspotsEnabled}
            hotspotMode={hotspotMode}
            onHotspotModeChange={setHotspotMode}
            hotspotPercentile={hotspotPercentile}
            onHotspotPercentileChange={setHotspotPercentile}
            hotspotTotalCells={hotspotTotalCells}
            hotspotModeledCount={expectedSummary.current}
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
