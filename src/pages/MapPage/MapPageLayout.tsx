import { AppHeader } from "../../components/AppHeader";
import { AppFooter } from "../../components/AppFooter";
import { ToolDrawer } from "../../components/ToolDrawer";
import { ForecastMap, type ForecastMapProps } from "../../components/ForecastMap";
import { MapPageFailureState } from "./MapPageFailureState";
import { trackRender } from "../../debug/perf";
import type { MapPageController } from "./useMapPageController";

type MapPageLayoutProps = {
  controller: MapPageController;
};

export function MapPageLayout({ controller }: MapPageLayoutProps) {
  trackRender("MapPageLayout");
  const {
    primaryMapRef,
    darkMode,
    setThemeMode,
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
    toolsOpen,
    setToolsOpen,
    hotspotTotalCells,
    setHotspotTotalCells,
    poiFilters,
    setPoiFilters,
    mapResetNonce,
    showNoForecastNotice,
    usingFallbackForecast,
    forecastPath,
    latestForecastPath,
    expectedSummary,
    currentWeek,
    currentWeekYear,
    shareBusy,
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

  const expectedActivityChart = {
    actualValues: expectedSummary.actualChartValues,
    forecastValues: expectedSummary.forecastChartValues,
    forecastValue: expectedSummary.current,
    predictionIndex: expectedSummary.predictionIndex,
  };
  const commonHeaderProps = {
    title: "OrcaCast",
    subtitle: "Orca Sightings Forecast",
    onForecastIndexChange: setForecastIndex,
    forecastPlaybackPlaying,
    onForecastPlaybackPlayingChange: setForecastPlaybackPlaying,
    forecastPlaybackDirection,
    onForecastPlaybackDirectionChange: setForecastPlaybackDirection,
    expectedActivityCount: expectedSummary.current,
    expectedActivityVsPriorWeek: expectedSummary.vsPriorWeek,
    expectedActivityVs12WeekAvg: expectedSummary.vs12WeekAvg,
    expectedActivityTrend: expectedSummary.trend,
    expectedActivityChart,
    resolution,
    onResolutionChange: setResolution,
    darkMode,
    onToggleDarkMode: () => setThemeMode(darkMode ? "light" : "dark"),
    onOpenInfo: () => controller.setInfoOpen(true),
    onOpenMenu: () => setMenuOpen(true),
    onBrandClick: handleResetMap,
  };

  const commonMapProps = {
    darkMode,
    paletteId: selectedPaletteId,
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
  } satisfies Pick<
    ForecastMapProps,
    | "darkMode"
    | "paletteId"
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
          forecastPeriods={[]}
          forecastIndex={0}
          showForecastNotice={false}
          forecastNoticeText=""
        />
        <main className="app__main">
          <MapPageFailureState
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
        forecastPeriods={periods}
        forecastIndex={Math.max(0, forecastIndex)}
        showForecastNotice={showNoForecastNotice}
        forecastNoticeText="Forecast data is not available for the selected period."
        fallbackNoticeVisible={usingFallbackForecast}
        fallbackNoticeText="Selected period unavailable - showing latest available"
      />

      <main className="app__main">
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

        <ToolDrawer
          open={toolsOpen}
          onToggle={() => setToolsOpen((v) => !v)}
          onClose={() => setToolsOpen(false)}
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

        <div className="app__footer">
          <AppFooter
            onShareSnapshot={shareSnapshot}
            onDownloadSnapshot={downloadSnapshotAction}
            shareBusy={shareBusy}
          />
        </div>
      </main>
    </div>
  );
}
