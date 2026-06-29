import { useEffect, useMemo, useRef, useState } from "react";
import type { ForecastMapHandle } from "../../components/ForecastMap";
import type { GridCellExpandRequest } from "../../components/ForecastMap/types";
import { appConfig } from "../../config/appConfig";
import {
  buildPeriod,
  readForecastPeriodOverride,
  resolvePeriodsForSelection,
} from "../../config/forecastPeriod";
import { getForecastPathForPeriod, type H3Resolution } from "../../config/dataPaths";
import {
  isoWeekFromDate,
  isoWeekToDateRange,
  isoWeekYearFromDate,
} from "../../core/time/forecastPeriodToIsoWeek";
import { normalizeDataLoadError, type DataLoadError } from "../../data/errors";
import { loadActualActivitySeries, loadExpectedCountSeries } from "../../data/expectedCount";
import { loadForecast } from "../../data/forecastIO";
import { buildPeriodsUrl, loadPeriods, resetPeriodsCache, type Period } from "../../data/periods";
import { DEFAULT_PALETTE_ID } from "../../constants/palettes";
import { useMenu } from "../../state/MenuContext";
import { useMapState } from "../../state/MapStateContext";

export type MapPageController = ReturnType<typeof useMapPageController>;

export function useMapPageController() {
  const {
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
    hotspotsEnabled,
    setHotspotsEnabled,
    hotspotMode,
    setHotspotMode,
    hotspotPercentile,
    setHotspotPercentile,
    selectedPaletteId,
    setSelectedPaletteId,
  } = useMapState();

  const { setMenuOpen } = useMenu();

  const [infoOpen, setInfoOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [gridDetailOpen, setGridDetailOpen] = useState(false);
  const [gridDetailCellId, setGridDetailCellId] = useState<string | null>(null);
  const [gridDetailResolution, setGridDetailResolution] = useState<H3Resolution>(resolution);
  const [gridDetailModelId, setGridDetailModelId] = useState(modelId);
  const [gridDetailSelectedWeek, setGridDetailSelectedWeek] = useState<number | null>(null);
  const [gridDetailSelectedWeekYear, setGridDetailSelectedWeekYear] = useState<number | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [hotspotTotalCells, setHotspotTotalCells] = useState<number | null>(null);
  const [poiFilters, setPoiFilters] = useState({ Park: false, Marina: false, Ferry: false });
  const [mapResetNonce, setMapResetNonce] = useState(0);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [pageLoadError, setPageLoadError] = useState<DataLoadError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedPeriodHasForecast, setSelectedPeriodHasForecast] = useState<boolean | null>(null);
  const [showNoForecastNotice, setShowNoForecastNotice] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [expectedSeries, setExpectedSeries] = useState<
    Array<{
      year: number;
      stat_week: number;
      expected_count: number;
      lower_ci?: number;
      upper_ci?: number;
      typical_error?: number;
    }>
  >([]);
  const [actualSeries, setActualSeries] = useState<
    Array<{ year: number; stat_week: number; actual_count: number }>
  >([]);

  const lastMissingNoticePeriodKeyRef = useRef<string | null>(null);
  const didInitializeForecastIndexRef = useRef(false);
  const defaultForecastIndexRef = useRef(0);
  const primaryMapRef = useRef<ForecastMapHandle | null>(null);
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

  const fallbackPeriod = useMemo<Period>(() => {
    const now = new Date();
    return buildPeriod(isoWeekYearFromDate(now), isoWeekFromDate(now));
  }, []);

  const shiftIsoWeek = (year: number, statWeek: number, weekOffset: number) => {
    const start = isoWeekToDateRange(year, statWeek).start;
    const baseDate = new Date(`${start}T00:00:00Z`);
    baseDate.setUTCDate(baseDate.getUTCDate() + weekOffset * 7);
    return {
      year: isoWeekYearFromDate(baseDate),
      statWeek: isoWeekFromDate(baseDate),
    };
  };

  useEffect(() => {
    const seen = localStorage.getItem("orcacast.welcome.seen");
    if (!seen) {
      setWelcomeOpen(true);
      localStorage.setItem("orcacast.welcome.seen", "true");
    }
  }, []);

  useEffect(() => {
    let active = true;
    const override = readForecastPeriodOverride();
    setPageLoadError(null);
    loadPeriods()
      .then((list) => {
        if (!active) return;
        const resolved = resolvePeriodsForSelection(list, override, fallbackPeriod);
        setPeriods(resolved.periods);
        if (!didInitializeForecastIndexRef.current) {
          didInitializeForecastIndexRef.current = true;
          defaultForecastIndexRef.current = resolved.selectedIndex;
          setForecastIndex(resolved.selectedIndex);
        } else if (resolved.periods.length > 0) {
          setForecastIndex((idx) =>
            idx >= resolved.periods.length ? resolved.periods.length - 1 : idx
          );
        }
      })
      .catch((error) => {
        if (!active) return;
        setPeriods([]);
        setPageLoadError(normalizeDataLoadError(error, buildPeriodsUrl()));
      });

    return () => {
      active = false;
    };
  }, [fallbackPeriod, reloadToken, setForecastIndex]);

  useEffect(() => {
    if (periods.length === 0) return;
    setForecastIndex((idx) => (idx >= periods.length ? periods.length - 1 : idx));
  }, [periods, setForecastIndex]);

  const selectedForecast = useMemo(
    () => (forecastIndex >= 0 && forecastIndex < periods.length ? periods[forecastIndex] : null),
    [forecastIndex, periods]
  );
  const selectedPeriodKeyForNotice = selectedForecast?.periodKey ?? fallbackPeriod.periodKey;
  const selectedPeriodYear = selectedForecast?.year ?? fallbackPeriod.year;
  const selectedPeriodWeek = selectedForecast?.stat_week ?? fallbackPeriod.stat_week;
  const forecastPath = useMemo(
    () => (selectedForecast ? getForecastPathForPeriod(resolution, selectedForecast.fileId) : undefined),
    [resolution, selectedForecast]
  );
  const latestForecastPath = useMemo(() => {
    if (periods.length === 0) return undefined;
    const latest = periods[periods.length - 1];
    return getForecastPathForPeriod(resolution, latest.fileId);
  }, [periods, resolution]);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadExpectedCountSeries(resolution).catch(() => []),
      loadActualActivitySeries(resolution).catch(() => []),
    ])
      .then(([expectedRows, actualRows]) => {
        if (!active) return;
        setExpectedSeries(expectedRows);
        setActualSeries(actualRows);
      })
      .catch(() => {
        if (!active) return;
        setExpectedSeries([]);
        setActualSeries([]);
      });
    return () => {
      active = false;
    };
  }, [resolution]);

  const expectedSummary = useMemo(() => {
    const keyFor = (year: number, statWeek: number) =>
      `${year}-${String(statWeek).padStart(2, "0")}`;
    const expectedLookup = new Map<
      string,
      { expected_count: number; lower_ci?: number; upper_ci?: number; typical_error?: number }
    >();
    expectedSeries.forEach((row) => {
      expectedLookup.set(keyFor(row.year, row.stat_week), {
        expected_count: row.expected_count,
        lower_ci: row.lower_ci,
        upper_ci: row.upper_ci,
        typical_error: row.typical_error,
      });
    });
    const actualLookup = new Map<string, number>();
    actualSeries.forEach((row) => {
      actualLookup.set(keyFor(row.year, row.stat_week), row.actual_count);
    });

    const selectedKey = keyFor(selectedPeriodYear, selectedPeriodWeek);
    const current = expectedLookup.get(selectedKey)?.expected_count ?? null;
    const previous = shiftIsoWeek(selectedPeriodYear, selectedPeriodWeek, -1);
    const previousValue = actualLookup.get(keyFor(previous.year, previous.statWeek)) ?? null;
    const baselineWeeks = Array.from({ length: 12 }, (_, index) =>
      shiftIsoWeek(selectedPeriodYear, selectedPeriodWeek, -(index + 1))
    )
      .map((week) => actualLookup.get(keyFor(week.year, week.statWeek)))
      .filter((value): value is number => value !== undefined);
    const vs12WeekAvg =
      baselineWeeks.length > 0
        ? baselineWeeks.reduce((sum, value) => sum + value, 0) / baselineWeeks.length
        : null;

    let trend: "up" | "down" | "steady" | "none" = "none";
    if (current !== null && previousValue !== null) {
      if (current > previousValue) trend = "up";
      else if (current < previousValue) trend = "down";
      else trend = "steady";
    }

    const chartWeeks = Array.from({ length: 12 }, (_, index) =>
      shiftIsoWeek(selectedPeriodYear, selectedPeriodWeek, -(11 - index))
    );
    const actualChartValues = chartWeeks.map(
      (week) => actualLookup.get(keyFor(week.year, week.statWeek)) ?? null
    );
    const forecastChartValues = chartWeeks.map((_, index) =>
      index === chartWeeks.length - 1 ? current : null
    );

    return {
      current,
      vsPriorWeek: previousValue,
      vs12WeekAvg,
      trend,
      actualChartValues,
      forecastChartValues,
      predictionIndex: forecastChartValues.length - 1,
    };
  }, [actualSeries, expectedSeries, selectedPeriodWeek, selectedPeriodYear]);

  useEffect(() => {
    let active = true;

    const loadModels = async () => {
      try {
        let hasForecastForSelectedPeriod: boolean | null = null;

        if (forecastPath) {
          try {
            await loadForecast(resolution, {
              kind: "explicit",
              explicitPath: forecastPath,
              modelId: appConfig.compositeModelId,
            });
            hasForecastForSelectedPeriod = true;
          } catch {
            hasForecastForSelectedPeriod = false;
          }
        }

        if (hasForecastForSelectedPeriod === false && latestForecastPath && latestForecastPath !== forecastPath) {
          await loadForecast(resolution, {
            kind: "explicit",
            explicitPath: latestForecastPath,
            modelId: appConfig.compositeModelId,
          }).catch(() => undefined);
        }

        if (!active) return;
        setSelectedPeriodHasForecast(hasForecastForSelectedPeriod);
        if (modelId !== appConfig.compositeModelId) {
          setModelId(appConfig.compositeModelId);
        }
      } catch {
        if (!active) return;
        setSelectedPeriodHasForecast(false);
      }
    };

    void loadModels();
    return () => {
      active = false;
    };
  }, [forecastPath, latestForecastPath, modelId, resolution, setModelId]);

  useEffect(() => {
    if (selectedPeriodHasForecast === true) {
      lastMissingNoticePeriodKeyRef.current = null;
      setShowNoForecastNotice(false);
      return;
    }
    if (selectedPeriodHasForecast !== false) {
      setShowNoForecastNotice(false);
      return;
    }
    if (lastMissingNoticePeriodKeyRef.current === selectedPeriodKeyForNotice) return;
    lastMissingNoticePeriodKeyRef.current = selectedPeriodKeyForNotice;
    setShowNoForecastNotice(true);
    const timeoutId = window.setTimeout(() => setShowNoForecastNotice(false), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [selectedPeriodHasForecast, selectedPeriodKeyForNotice]);

  const usingFallbackForecast = selectedPeriodHasForecast === false;

  const currentWeek = useMemo(
    () => selectedForecast?.stat_week ?? fallbackPeriod.stat_week,
    [fallbackPeriod.stat_week, selectedForecast]
  );
  const currentWeekYear = useMemo(
    () => selectedForecast?.year ?? fallbackPeriod.year,
    [fallbackPeriod.year, selectedForecast]
  );

  const handleResetMap = () => {
    setToolsOpen(false);
    setGridDetailOpen(false);
    setGridDetailCellId(null);
    setGridDetailSelectedWeek(null);
    setGridDetailSelectedWeekYear(null);
    setResolution("H4");
    setModelId(appConfig.compositeModelId);
    setHotspotsEnabled(false);
    setHotspotMode("modeled");
    setHotspotPercentile(1);
    setSelectedPaletteId(DEFAULT_PALETTE_ID);
    setPoiFilters({ Park: false, Marina: false, Ferry: false });
    setForecastIndex(
      periods.length > 0
        ? Math.max(0, Math.min(defaultForecastIndexRef.current, periods.length - 1))
        : 0
    );
    setMapResetNonce((value) => value + 1);
  };

  const retryPageLoad = () => {
    resetPeriodsCache();
    didInitializeForecastIndexRef.current = false;
    defaultForecastIndexRef.current = 0;
    lastMissingNoticePeriodKeyRef.current = null;
    setPeriods([]);
    setPageLoadError(null);
    setForecastIndex(0);
    setGridDetailOpen(false);
    setGridDetailCellId(null);
    setGridDetailSelectedWeek(null);
    setGridDetailSelectedWeekYear(null);
    setReloadToken((value) => value + 1);
    setMapResetNonce((value) => value + 1);
  };

  const openGridDetail = (request: GridCellExpandRequest) => {
    setGridDetailCellId(request.h3);
    setGridDetailResolution(request.resolution);
    setGridDetailModelId(request.modelId);
    setGridDetailSelectedWeek(request.selectedWeek);
    setGridDetailSelectedWeekYear(request.selectedWeekYear);
    setGridDetailOpen(true);
  };

  const reportFatalDataError = (error: DataLoadError) => {
    setPageLoadError(error);
  };

  const shareSnapshot = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const blob = await primaryMapRef.current?.captureSnapshot();
      if (!blob) throw new Error("Snapshot not available");

      const fileName = `orcacast_${currentWeekYear}-W${String(currentWeek).padStart(
        2,
        "0"
      )}_${resolution}_${toFileSafeToken(modelId)}.png`;
      const snapshotFile = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      const canNativeShareFiles =
        typeof nav.share === "function" &&
        (typeof nav.canShare !== "function" || nav.canShare({ files: [snapshotFile] }));

      if (canNativeShareFiles) {
        await nav.share({
          title: "OrcaCast snapshot",
          text: `Forecast week ${currentWeekYear}-W${String(currentWeek).padStart(2, "0")}`,
          files: [snapshotFile],
        });
      } else {
        downloadSnapshot(blob, fileName);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("[Share] Snapshot failed", error);
      }
    } finally {
      setShareBusy(false);
    }
  };

  const downloadSnapshotAction = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const blob = await primaryMapRef.current?.captureSnapshot();
      if (!blob) throw new Error("Snapshot not available");
      const fileName = `orcacast_${currentWeekYear}-W${String(currentWeek).padStart(
        2,
        "0"
      )}_${resolution}_${toFileSafeToken(modelId)}.png`;
      downloadSnapshot(blob, fileName);
    } catch (error) {
      console.error("[Download] Snapshot failed", error);
    } finally {
      setShareBusy(false);
    }
  };

  return {
    pageLoadError,
    reportFatalDataError,
    retryPageLoad,
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
    hotspotsEnabled,
    setHotspotsEnabled,
    hotspotMode,
    setHotspotMode,
    hotspotPercentile,
    setHotspotPercentile,
    selectedPaletteId,
    setSelectedPaletteId,
    infoOpen,
    setInfoOpen,
    toolsOpen,
    setToolsOpen,
    gridDetailOpen,
    setGridDetailOpen,
    gridDetailCellId,
    gridDetailResolution,
    gridDetailModelId,
    gridDetailSelectedWeek,
    gridDetailSelectedWeekYear,
    welcomeOpen,
    setWelcomeOpen,
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
  };
}
