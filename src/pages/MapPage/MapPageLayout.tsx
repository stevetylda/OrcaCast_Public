import { AppHeader } from "../../components/AppHeader";
import { AppFooter } from "../../components/AppFooter";
import { ToolDrawer } from "../../components/ToolDrawer";
import { ForecastMap, type ForecastMapProps } from "../../components/ForecastMap";
import { SwipeComparePills } from "../../components/Compare/SwipeComparePills";
import { DualMapCompare } from "../../components/Compare/DualMapCompare";
import { SingleSwipeMap } from "../../components/Compare/SingleSwipeMap";
import { MapPageFailureState } from "./MapPageFailureState";
import { trackRender } from "../../debug/perf";
import type { NonNoneLastWeekMode } from "./types";
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
    setModelId,
    forecastIndex,
    setForecastIndex,
    forecastPlaybackPlaying,
    setForecastPlaybackPlaying,
    forecastPlaybackDirection,
    setForecastPlaybackDirection,
    periods,
    lastWeekMode,
    setLastWeekMode,
    hotspotsEnabled,
    setHotspotsEnabled,
    hotspotMode,
    setHotspotMode,
    hotspotPercentile,
    setHotspotPercentile,
    compareEnabled,
    setCompareEnabled,
    compareSettings,
    setCompareSettings,
    selectedPaletteId,
    setSelectedPaletteId,
    displayMode,
    setDisplayMode,
    toolsOpen,
    setToolsOpen,
    timeseriesOpen,
    setTimeseriesOpen,
    gridDetailOpen,
    hotspotTotalCells,
    setHotspotTotalCells,
    poiFilters,
    setPoiFilters,
    modelOptions,
    compareModels,
    setCompareModelA,
    setCompareModelB,
    setComparePeriodA,
    setComparePeriodB,
    compareResolutionA,
    setCompareResolutionA,
    compareResolutionB,
    setCompareResolutionB,
    compareViewState,
    setCompareViewState,
    mapResetNonce,
    deltaMapData,
    showNoForecastNotice,
    usingFallbackForecast,
    forecastPath,
    latestForecastPath,
    expectedSummary,
    modelVersion,
    showLastWeek,
    currentWeek,
    currentWeekYear,
    compareDisabled,
    compareDisabledReason,
    periodOptions,
    resolvedCompareModelA,
    resolvedCompareModelIdA,
    resolvedCompareModelB,
    resolvedCompareModelIdB,
    comparePeriodAObj,
    comparePeriodBObj,
    effectiveCompareResolutionB,
    comparePathA,
    comparePathB,
    deltaFillExpr,
    deltaCellPopupHtmlBuilder,
    compareRenderMode,
    deltaMode,
    syncEnabled,
    shareBusy,
    shareSnapshot,
    downloadSnapshotAction,
    handleResetMap,
    openGridDetail,
    setMenuOpen,
    setSelectedCompareH3,
    DEFAULT_DELTA_LEGEND,
    pageLoadError,
    reportFatalDataError,
    retryPageLoad,
  } = controller;

  const mainMapKey = `map-main-${mapResetNonce}`;
  const deltaMapKey = `map-delta-${mapResetNonce}`;
  const dualMapAKey = `map-dual-a-${mapResetNonce}`;
  const dualMapBKey = `map-dual-b-${mapResetNonce}`;
  const swipeMapAKey = `map-swipe-a-${mapResetNonce}`;
  const swipeMapBKey = `map-swipe-b-${mapResetNonce}`;

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
    onExitCompareMode: () => setCompareEnabled(false),
  };

  const commonMapProps = {
    darkMode,
    paletteId: selectedPaletteId,
    displayMode,
    showLastWeek,
    lastWeekMode,
    poiFilters,
    periods,
    timeseriesOpen: timeseriesOpen || gridDetailOpen,
    hotspotsEnabled,
    hotspotMode,
    hotspotPercentile,
    expectedActivityHotspotCellCount: expectedSummary.current,
    onHotspotsEnabledChange: setHotspotsEnabled,
    onGridCellCount: setHotspotTotalCells,
    onGridCellSelect: setSelectedCompareH3,
    onGridCellExpand: openGridDetail,
    onFatalDataError: reportFatalDataError,
  } satisfies Pick<
    ForecastMapProps,
    | "darkMode"
    | "paletteId"
    | "displayMode"
    | "showLastWeek"
    | "lastWeekMode"
    | "poiFilters"
    | "periods"
    | "timeseriesOpen"
    | "hotspotsEnabled"
    | "hotspotMode"
    | "hotspotPercentile"
    | "expectedActivityHotspotCellCount"
    | "onHotspotsEnabledChange"
    | "onGridCellCount"
    | "onGridCellSelect"
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
          compareEnabled={false}
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
        compareEnabled={compareEnabled}
      />

      <main className="app__main">
        {!compareEnabled ? (
          renderForecastMap(
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
          )
        ) : (
          <div className="compareModeStage compareModeStage--map">
            {compareRenderMode === "delta" ? (
              <div className="compareMapPane">
                {renderForecastMap(deltaMapKey, {
                  resolution: compareResolutionA,
                  modelId: resolvedCompareModelIdA,
                  selectedWeek: comparePeriodAObj.stat_week,
                  selectedWeekYear: comparePeriodAObj.year,
                  derivedValuesByCell: deltaMapData?.deltaByCell ?? {},
                  derivedValueProperty: "delta_pctl",
                  derivedFillExpr: deltaFillExpr,
                  deltaLegend: DEFAULT_DELTA_LEGEND,
                  disableHotspots: true,
                  enableSparklinePopup: false,
                  cellPopupHtmlBuilder: deltaCellPopupHtmlBuilder,
                  syncViewState: syncEnabled ? compareViewState : null,
                  onMoveViewState: setCompareViewState,
                  onMoveEndViewState: setCompareViewState,
                })}
              </div>
            ) : compareRenderMode === "dual" ? (
              <DualMapCompare
                childrenLeft={
                  <div className="compareMapPane">
                    {renderForecastMap(dualMapAKey, {
                      resolution: compareResolutionA,
                      modelId: resolvedCompareModelIdA,
                      selectedWeek: comparePeriodAObj.stat_week,
                      selectedWeekYear: comparePeriodAObj.year,
                      forecastPath: comparePathA,
                      fallbackForecastPath: latestForecastPath,
                      syncViewState: syncEnabled ? compareViewState : null,
                      onMoveViewState: setCompareViewState,
                      onMoveEndViewState: setCompareViewState,
                    })}
                  </div>
                }
                childrenRight={
                  <div className="compareMapPane">
                    {renderForecastMap(dualMapBKey, {
                      resolution: compareResolutionB,
                      modelId: resolvedCompareModelIdB,
                      selectedWeek: comparePeriodBObj.stat_week,
                      selectedWeekYear: comparePeriodBObj.year,
                      forecastPath: comparePathB,
                      fallbackForecastPath: latestForecastPath,
                      syncViewState: syncEnabled ? compareViewState : null,
                      onMoveViewState: setCompareViewState,
                      onMoveEndViewState: setCompareViewState,
                    })}
                  </div>
                }
              />
            ) : (
              <SingleSwipeMap
                splitPct={compareSettings.splitPct}
                onSplitCommit={(pct) => setCompareSettings((prev) => ({ ...prev, splitPct: pct }))}
                childrenLeft={
                  <div className="compareMapPane">
                    {renderForecastMap(swipeMapAKey, {
                      resolution: compareResolutionA,
                      modelId: resolvedCompareModelIdA,
                      selectedWeek: comparePeriodAObj.stat_week,
                      selectedWeekYear: comparePeriodAObj.year,
                      forecastPath: comparePathA,
                      fallbackForecastPath: latestForecastPath,
                      syncViewState: syncEnabled ? compareViewState : null,
                      onMoveEndViewState: setCompareViewState,
                    })}
                  </div>
                }
                childrenRight={
                  <div className="compareMapPane">
                    {renderForecastMap(swipeMapBKey, {
                      resolution: compareResolutionB,
                      modelId: resolvedCompareModelIdB,
                      selectedWeek: comparePeriodBObj.stat_week,
                      selectedWeekYear: comparePeriodBObj.year,
                      forecastPath: comparePathB,
                      fallbackForecastPath: latestForecastPath,
                      syncViewState: syncEnabled ? compareViewState : null,
                      onMoveEndViewState: setCompareViewState,
                    })}
                  </div>
                }
              />
            )}

            <SwipeComparePills
              modelLeftId={resolvedCompareModelA}
              modelRightId={resolvedCompareModelB}
              periodLeft={comparePeriodAObj.periodKey}
              periodRight={comparePeriodBObj.periodKey}
              resolutionLeft={compareResolutionA}
              resolutionRight={effectiveCompareResolutionB}
              periodOptions={periodOptions}
              models={compareModels}
              dualMapMode={compareSettings.dualMapMode}
              deltaMode={deltaMode}
              onChangeModelLeft={setCompareModelA}
              onChangeModelRight={setCompareModelB}
              onChangePeriodLeft={setComparePeriodA}
              onChangePeriodRight={setComparePeriodB}
              onChangeResolutionLeft={(next) => {
                setCompareResolutionA(next);
                if (deltaMode) setCompareResolutionB(next);
              }}
              onChangeResolutionRight={setCompareResolutionB}
              onToggleDeltaMode={() => setCompareSettings((prev) => ({ ...prev, showDelta: !prev.showDelta }))}
              onToggleLocked={() =>
                setCompareSettings((prev) => ({
                  ...prev,
                  dualMapMode: !prev.dualMapMode,
                  splitPct: !prev.dualMapMode ? 50 : prev.splitPct,
                }))
              }
            />
          </div>
        )}

        <ToolDrawer
          open={toolsOpen}
          onToggle={() => setToolsOpen((v) => !v)}
          onClose={() => setToolsOpen(false)}
          onSelectLastWeek={(mode: NonNoneLastWeekMode) => {
            const prev = lastWeekMode;
            let next = prev;
            if (prev === "none") next = mode;
            else if (prev === mode) next = "none";
            else if (prev === "both") next = mode === "previous" ? "selected" : "previous";
            else next = "both";
            setLastWeekMode(next);
          }}
          lastWeekMode={lastWeekMode}
          showLastWeek={showLastWeek}
          hotspotsEnabled={hotspotsEnabled}
          onHotspotsEnabledChange={setHotspotsEnabled}
          hotspotMode={hotspotMode}
          onHotspotModeChange={setHotspotMode}
          hotspotPercentile={hotspotPercentile}
          onHotspotPercentileChange={setHotspotPercentile}
          hotspotTotalCells={hotspotTotalCells}
          hotspotModeledCount={expectedSummary.current}
          onOpenTimeseries={() => setTimeseriesOpen(true)}
          poiFilters={poiFilters}
          onTogglePoiAll={() =>
            setPoiFilters((prev) => {
              const allOn = prev.Park && prev.Marina && prev.Ferry;
              return { Park: !allOn, Marina: !allOn, Ferry: !allOn };
            })
          }
          onTogglePoiType={(type) => setPoiFilters((prev) => ({ ...prev, [type]: !prev[type] }))}
          compareEnabled={compareEnabled}
          compareDisabled={compareDisabled}
          compareDisabledReason={compareDisabledReason}
          selectedPaletteId={selectedPaletteId}
          onPaletteChange={setSelectedPaletteId}
          displayMode={displayMode}
          onDisplayModeChange={setDisplayMode}
          onToggleCompare={() => {
            if (!compareEnabled) {
              setCompareResolutionA(resolution);
              setCompareResolutionB(resolution);
            }
            setCompareEnabled(!compareEnabled);
          }}
        />

        <div className="app__footer">
          <AppFooter
            modelVersion={modelVersion}
            modelId={modelId}
            modelOptions={modelOptions}
            onModelChange={setModelId}
            compareEnabled={compareEnabled}
            onShareSnapshot={shareSnapshot}
            onDownloadSnapshot={downloadSnapshotAction}
            shareBusy={shareBusy}
            shareDisabled={compareEnabled}
            shareDisabledReason="Snapshots are available in single-map mode."
          />
        </div>
      </main>
    </div>
  );
}
