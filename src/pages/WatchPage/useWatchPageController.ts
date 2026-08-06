import { useEffect, useMemo, useRef, useState } from "react";
import type { ForecastMapHandle } from "../../features/map";
import type { GridCellExpandRequest } from "../../features/map/types";
import {
  buildPeriod,
  readForecastPeriodOverride,
  resolvePeriodsForSelection,
} from "../../shared/config/forecastPeriod";
import {
  getForecastPathForPeriod,
  getSmoothedForecastPath,
  getSmoothedForecastTilePath,
  type H3Resolution,
} from "../../shared/config/dataPaths";
import {
  DEFAULT_FORECAST_ECOTYPE_ID,
  DEFAULT_FORECAST_MODEL_ID,
  FORECAST_ECOTYPES,
  getForecastDirectory,
  getForecastModelsForEcotype,
  type ForecastEcotypeId,
} from "../../shared/config/forecastModels";
import {
  isoWeekFromDate,
  isoWeekToDateRange,
  isoWeekYearFromDate,
} from "../../shared/time/forecastPeriodToIsoWeek";
import {
  normalizeDataLoadError,
  type DataLoadError,
} from "../../shared/data/errors";
import {
  loadActualActivitySeries,
  loadExpectedCountSeries,
} from "../../shared/data/expectedCount";
import {
  loadForecast,
  resetForecastCache,
  type ForecastDataset,
} from "../../shared/data/forecastIO";
import {
  buildPeriodsUrl,
  loadPeriodsForResolution,
  resetPeriodsCache,
  type Period,
} from "../../shared/data/periods";
import { DEFAULT_PALETTE_ID } from "../../shared/geo/palettes";
import { useMenu } from "../../shared/state/MenuContext";
import { useMapState } from "../../shared/state/MapStateContext";
import { useSuggestedPlaces } from "../../features/locations/useSuggestedPlaces";
import type { SuggestedPlace } from "../../features/locations/types";
import { resolveWatchForecastPeriods } from "./watchForecastSelection";

export type WatchPageController = ReturnType<typeof useWatchPageController>;
export type WatchForecastSelection = {
  status: "selected" | "fallback" | "unavailable";
  requestedPeriod: Period | null;
  displayedPeriod: Period | null;
  jsonPath: string | null;
  smoothedRasterPath: string | null;
  smoothedTilePath: string | null;
  dataset: ForecastDataset | null;
};

function summarizeForecastPattern(values: Record<string, number>) {
  const positiveValues = Object.values(values)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);
  const totalMass = positiveValues.reduce((sum, value) => sum + value, 0);
  if (positiveValues.length === 0 || totalMass <= 0) return "Unavailable";
  const topCellCount = Math.max(1, Math.ceil(positiveValues.length * 0.1));
  const topShare =
    positiveValues
      .slice(0, topCellCount)
      .reduce((sum, value) => sum + value, 0) / totalMass;
  if (topShare >= 0.62) return "Concentrated";
  if (topShare >= 0.38) return "Clustered";
  return "Dispersed";
}

export function useWatchPageController() {
  const {
    darkMode,
    unitsMode,
    setUnitsMode,
    surfaceMode,
    setSurfaceMode,
    resolution,
    setResolution,
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
  const [forecastEcotypeId, setForecastEcotypeId] = useState<ForecastEcotypeId>(
    DEFAULT_FORECAST_ECOTYPE_ID,
  );
  const [modelId, setModelId] = useState(DEFAULT_FORECAST_MODEL_ID);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [gridDetailOpen, setGridDetailOpen] = useState(false);
  const [gridDetailCellId, setGridDetailCellId] = useState<string | null>(null);
  const [gridDetailResolution, setGridDetailResolution] =
    useState<H3Resolution>(resolution);
  const [gridDetailModelId, setGridDetailModelId] = useState(modelId);
  const [gridDetailSelectedWeek, setGridDetailSelectedWeek] = useState<
    number | null
  >(null);
  const [gridDetailSelectedWeekYear, setGridDetailSelectedWeekYear] = useState<
    number | null
  >(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [hotspotTotalCells, setHotspotTotalCells] = useState<number | null>(
    null,
  );
  const [poiFilters, setPoiFilters] = useState({
    Park: false,
    Marina: false,
    Ferry: false,
  });
  const [mapResetNonce, setMapResetNonce] = useState(0);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [pageLoadError, setPageLoadError] = useState<DataLoadError | null>(
    null,
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [forecastDataset, setForecastDataset] =
    useState<ForecastDataset | null>(null);
  const [forecastPattern, setForecastPattern] = useState("Loading");
  const [shareBusy, setShareBusy] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
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
  const forecastModels = useMemo(
    () => getForecastModelsForEcotype(forecastEcotypeId),
    [forecastEcotypeId],
  );
  const forecastDirectory = useMemo(
    () => getForecastDirectory(forecastEcotypeId, modelId),
    [forecastEcotypeId, modelId],
  );

  const setForecastEcotype = (ecotypeId: ForecastEcotypeId) => {
    const firstModel = getForecastModelsForEcotype(ecotypeId)[0];
    setForecastPlaybackPlaying(false);
    setForecastEcotypeId(ecotypeId);
    if (firstModel) setModelId(firstModel.id);
  };

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
    loadPeriodsForResolution(resolution, forecastDirectory)
      .then((list) => {
        if (!active) return;
        const resolved = resolvePeriodsForSelection(
          list,
          override,
          fallbackPeriod,
        );
        setPeriods(resolved.periods);
        if (!didInitializeForecastIndexRef.current) {
          didInitializeForecastIndexRef.current = true;
          defaultForecastIndexRef.current = resolved.selectedIndex;
          setForecastIndex(resolved.selectedIndex);
        } else if (resolved.periods.length > 0) {
          setForecastIndex((idx) =>
            idx >= resolved.periods.length ? resolved.periods.length - 1 : idx,
          );
        }
      })
      .catch((error) => {
        if (!active) return;
        setPeriods([]);
        setPageLoadError(
          normalizeDataLoadError(error, buildPeriodsUrl(forecastDirectory)),
        );
      });

    return () => {
      active = false;
    };
  }, [
    fallbackPeriod,
    forecastDirectory,
    reloadToken,
    resolution,
    setForecastIndex,
  ]);

  useEffect(() => {
    if (periods.length === 0) return;
    setForecastIndex((idx) =>
      idx >= periods.length ? periods.length - 1 : idx,
    );
  }, [periods, setForecastIndex]);

  const periodSelection = useMemo(
    () => resolveWatchForecastPeriods(periods, forecastIndex),
    [forecastIndex, periods],
  );
  const selectedForecast = periodSelection.requestedPeriod;
  const displayedForecast = periodSelection.displayedPeriod;
  const usingFallbackForecast = periodSelection.status === "fallback";
  const selectedPeriodYear = displayedForecast?.year ?? fallbackPeriod.year;
  const selectedPeriodWeek =
    displayedForecast?.stat_week ?? fallbackPeriod.stat_week;
  const forecastPath = useMemo(
    () =>
      displayedForecast
        ? getForecastPathForPeriod(
            resolution,
            displayedForecast.fileId,
            forecastDirectory,
          )
        : undefined,
    [displayedForecast, forecastDirectory, resolution],
  );
  const smoothedForecastPath = useMemo(() => {
    if (!displayedForecast) return undefined;
    const periodStart = isoWeekToDateRange(
      displayedForecast.year,
      displayedForecast.stat_week,
    ).start;
    return getSmoothedForecastPath(forecastDirectory, periodStart);
  }, [displayedForecast, forecastDirectory]);
  const smoothedForecastTilePath = useMemo(() => {
    if (!displayedForecast) return undefined;
    const periodStart = isoWeekToDateRange(
      displayedForecast.year,
      displayedForecast.stat_week,
    ).start;
    return getSmoothedForecastTilePath(forecastDirectory, periodStart);
  }, [displayedForecast, forecastDirectory]);

  const {
    places: suggestedPlaces,
    isLoading: suggestedPlacesLoading,
    error: suggestedPlacesError,
  } = useSuggestedPlaces({
    resolution,
    activityValues: forecastDataset?.values ?? null,
    enabled: forecastDataset !== null,
    limit: 25,
    poiFilters,
  });

  useEffect(() => {
    if (
      selectedPlaceId &&
      !suggestedPlaces.some(
        (place: SuggestedPlace) => place.id === selectedPlaceId,
      )
    ) {
      setSelectedPlaceId(null);
    }
  }, [selectedPlaceId, suggestedPlaces]);

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
      {
        expected_count: number;
        lower_ci?: number;
        upper_ci?: number;
        typical_error?: number;
      }
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
    const previousValue =
      actualLookup.get(keyFor(previous.year, previous.statWeek)) ?? null;
    const baselineWeeks = Array.from({ length: 12 }, (_, index) =>
      shiftIsoWeek(selectedPeriodYear, selectedPeriodWeek, -(index + 1)),
    )
      .map((week) => actualLookup.get(keyFor(week.year, week.statWeek)))
      .filter((value): value is number => value !== undefined);
    const vs12WeekAvg =
      baselineWeeks.length > 0
        ? baselineWeeks.reduce((sum, value) => sum + value, 0) /
          baselineWeeks.length
        : null;

    let trend: "up" | "down" | "steady" | "none" = "none";
    if (current !== null && previousValue !== null) {
      if (current > previousValue) trend = "up";
      else if (current < previousValue) trend = "down";
      else trend = "steady";
    }

    const chartWeeks = Array.from({ length: 12 }, (_, index) =>
      shiftIsoWeek(selectedPeriodYear, selectedPeriodWeek, -(11 - index)),
    );
    const actualChartValues = chartWeeks.map(
      (week) => actualLookup.get(keyFor(week.year, week.statWeek)) ?? null,
    );
    const forecastChartValues = chartWeeks.map((_, index) =>
      index === chartWeeks.length - 1 ? current : null,
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
    setForecastDataset(null);
    setForecastPattern(forecastPath ? "Loading" : "Unavailable");
    if (!forecastPath) return () => undefined;
    setPageLoadError(null);
    void loadForecast(resolution, {
      kind: "explicit",
      explicitPath: forecastPath,
      modelId,
    })
      .then((dataset) => {
        if (!active) return;
        setForecastDataset(dataset);
        setForecastPattern(summarizeForecastPattern(dataset.values));
      })
      .catch((error) => {
        if (!active) return;
        setForecastDataset(null);
        setForecastPattern("Unavailable");
        setPageLoadError(normalizeDataLoadError(error, forecastPath));
      });
    return () => {
      active = false;
    };
  }, [forecastPath, modelId, resolution]);

  const forecastSelection: WatchForecastSelection = {
    status: periodSelection.status,
    requestedPeriod: selectedForecast,
    displayedPeriod: displayedForecast,
    jsonPath: forecastPath ?? null,
    smoothedRasterPath: smoothedForecastPath ?? null,
    smoothedTilePath: smoothedForecastTilePath ?? null,
    dataset: forecastDataset,
  };

  const currentWeek = useMemo(
    () => displayedForecast?.stat_week ?? fallbackPeriod.stat_week,
    [displayedForecast, fallbackPeriod.stat_week],
  );
  const currentWeekYear = useMemo(
    () => displayedForecast?.year ?? fallbackPeriod.year,
    [displayedForecast, fallbackPeriod.year],
  );

  const handleResetMap = () => {
    setToolsOpen(false);
    setGridDetailOpen(false);
    setGridDetailCellId(null);
    setGridDetailSelectedWeek(null);
    setGridDetailSelectedWeekYear(null);
    setResolution("H6");
    setForecastEcotypeId(DEFAULT_FORECAST_ECOTYPE_ID);
    setModelId(DEFAULT_FORECAST_MODEL_ID);
    setHotspotsEnabled(false);
    setHotspotMode("modeled");
    setHotspotPercentile(1);
    setSelectedPaletteId(DEFAULT_PALETTE_ID);
    setPoiFilters({ Park: false, Marina: false, Ferry: false });
    setForecastIndex(
      periods.length > 0
        ? Math.max(
            0,
            Math.min(defaultForecastIndexRef.current, periods.length - 1),
          )
        : 0,
    );
    setSelectedPlaceId(null);
    setMapResetNonce((value) => value + 1);
  };

  const retryPageLoad = () => {
    resetPeriodsCache();
    resetForecastCache();
    didInitializeForecastIndexRef.current = false;
    defaultForecastIndexRef.current = 0;
    setPeriods([]);
    setForecastDataset(null);
    setPageLoadError(null);
    setForecastIndex(0);
    setGridDetailOpen(false);
    setGridDetailCellId(null);
    setGridDetailSelectedWeek(null);
    setGridDetailSelectedWeekYear(null);
    setReloadToken((value) => value + 1);
    setSelectedPlaceId(null);
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

      const fileName = `orcacast_${currentWeekYear}-W${String(
        currentWeek,
      ).padStart(2, "0")}_${resolution}_${toFileSafeToken(modelId)}.png`;
      const snapshotFile = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      const canNativeShareFiles =
        typeof nav.share === "function" &&
        (typeof nav.canShare !== "function" ||
          nav.canShare({ files: [snapshotFile] }));

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
      const fileName = `orcacast_${currentWeekYear}-W${String(
        currentWeek,
      ).padStart(2, "0")}_${resolution}_${toFileSafeToken(modelId)}.png`;
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
    unitsMode,
    setUnitsMode,
    surfaceMode,
    setSurfaceMode,
    resolution,
    setResolution,
    modelId,
    setModelId,
    forecastEcotypeId,
    setForecastEcotype,
    forecastEcotypes: FORECAST_ECOTYPES,
    forecastModels,
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
    usingFallbackForecast,
    forecastSelection,
    expectedSummary,
    forecastPattern,
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
  };
}
