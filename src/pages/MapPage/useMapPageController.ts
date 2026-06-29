import { useEffect, useMemo, useRef, useState } from "react";
import type { ForecastMapHandle } from "../../components/ForecastMap";
import type { GridCellExpandRequest } from "../../components/ForecastMap/types";
import type { ModelInfo } from "../../features/models/data/dummyModels";
import { appConfig } from "../../config/appConfig";
import { normalizeDataLoadError, type DataLoadError } from "../../data/errors";
import {
  buildPeriod,
  readForecastPeriodOverride,
  resolvePeriodsForSelection,
} from "../../config/forecastPeriod";
import { getActualsPathForPeriod, getForecastPathForPeriod } from "../../config/dataPaths";
import type { H3Resolution } from "../../config/dataPaths";
import {
  isoWeekFromDate,
  isoWeekToDateRange,
  isoWeekYearFromDate,
} from "../../core/time/forecastPeriodToIsoWeek";
import { loadActualActivitySeries, loadExpectedCountSeries } from "../../data/expectedCount";
import { loadForecast, loadForecastModelIds, loadGrid } from "../../data/forecastIO";
import { getH3CellId } from "../../data/h3";
import { buildPeriodsUrl, loadPeriods, resetPeriodsCache, type Period } from "../../data/periods";
import { DEFAULT_PALETTE_ID } from "../../constants/palettes";
import {
  DEFAULT_DELTA_LEGEND,
  LruCache,
  buildDeltaCacheKey,
  buildDeltaFillExpr,
  computeDeltaPercentilesByCell,
} from "../../map/deltaMap";
import { useMenu } from "../../state/MenuContext";
import { useMapState } from "../../state/MapStateContext";
import { createCompareOption, getComparePath, type CompareOption } from "./compareSources";
import type { DeltaMapData } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCellValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value === 0) return "0";
  if (Math.abs(value) >= 0.1) return value.toFixed(3);
  if (Math.abs(value) >= 0.01) return value.toFixed(4);
  return value.toFixed(5);
}

function toLabel(value: string): string {
  return value
    .split("_")
    .map((part) => {
      const lowered = part.toLowerCase();
      if (lowered === "srkw") return "SRKW";
      if (lowered === "kw") return "KW";
      if (lowered === "idw") return "IDW";
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

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
    setSelectedCompareH3,
  } = useMapState();

  const { setMenuOpen } = useMenu();

  const [infoOpen, setInfoOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [timeseriesOpen, setTimeseriesOpen] = useState(false);
  const [gridDetailOpen, setGridDetailOpen] = useState(false);
  const [gridDetailCellId, setGridDetailCellId] = useState<string | null>(null);
  const [gridDetailResolution, setGridDetailResolution] = useState<H3Resolution>(resolution);
  const [gridDetailModelId, setGridDetailModelId] = useState(modelId);
  const [gridDetailSelectedWeek, setGridDetailSelectedWeek] = useState<number | null>(null);
  const [gridDetailSelectedWeekYear, setGridDetailSelectedWeekYear] = useState<number | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [hotspotTotalCells, setHotspotTotalCells] = useState<number | null>(null);
  const [poiFilters, setPoiFilters] = useState({ Park: false, Marina: false, Ferry: false });
  const [modelOptions, setModelOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [compareModelOptions, setCompareModelOptions] = useState<CompareOption[]>([]);
  const [compareModelA, setCompareModelA] = useState("");
  const [compareModelB, setCompareModelB] = useState("");
  const [comparePeriodA, setComparePeriodA] = useState("");
  const [comparePeriodB, setComparePeriodB] = useState("");
  const [compareResolutionA, setCompareResolutionA] = useState<H3Resolution>(resolution);
  const [compareResolutionB, setCompareResolutionB] = useState<H3Resolution>(resolution);
  const [compareViewState, setCompareViewState] = useState<{
    center: [number, number];
    zoom: number;
    bearing: number;
    pitch: number;
  } | null>(null);
  const [mapResetNonce, setMapResetNonce] = useState(0);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [pageLoadError, setPageLoadError] = useState<DataLoadError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [deltaMapData, setDeltaMapData] = useState<DeltaMapData | null>(null);
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
  const deltaCacheRef = useRef(new LruCache<string, DeltaMapData>(20));
  const primaryMapRef = useRef<ForecastMapHandle | null>(null);
  const modelVersion = useMemo(() => "vPhase2", []);
  const showLastWeek = lastWeekMode !== "none";

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
        setPageLoadError(null);
        setPeriods(resolved.periods);
        if (!didInitializeForecastIndexRef.current) {
          didInitializeForecastIndexRef.current = true;
          defaultForecastIndexRef.current = resolved.selectedIndex;
          setForecastIndex(resolved.selectedIndex);
        } else if (resolved.periods.length > 0) {
          setForecastIndex((idx) => (idx >= resolved.periods.length ? resolved.periods.length - 1 : idx));
        }
      })
      .catch((err) => {
        if (!active) return;
        setPeriods([]);
        setPageLoadError(normalizeDataLoadError(err, buildPeriodsUrl()));
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
  const forecastPeriodText = useMemo(
    () => selectedForecast?.label ?? fallbackPeriod.label,
    [fallbackPeriod.label, selectedForecast]
  );
  const forecastPath = useMemo(
    () => (selectedForecast ? getForecastPathForPeriod(resolution, selectedForecast.fileId) : undefined),
    [resolution, selectedForecast]
  );
  const latestForecastPath = useMemo(() => {
    if (periods.length === 0) return undefined;
    const latest = periods[periods.length - 1];
    return getForecastPathForPeriod(resolution, latest.fileId);
  }, [periods, resolution]);

  const actualsPathCandidates = useMemo(() => {
    const seen = new Set<string>();
    const candidates: string[] = [];
    const pushPath = (period: Period | null | undefined) => {
      if (!period) return;
      const path = getActualsPathForPeriod(resolution, period.fileId);
      if (seen.has(path)) return;
      seen.add(path);
      candidates.push(path);
    };
    pushPath(selectedForecast);
    for (let idx = periods.length - 1; idx >= 0; idx -= 1) {
      pushPath(periods[idx]);
    }
    return candidates;
  }, [resolution, selectedForecast, periods]);

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
    const keyFor = (year: number, statWeek: number) => `${year}-${String(statWeek).padStart(2, "0")}`;
    const lookup = new Map<
      string,
      { expected_count: number; lower_ci?: number; upper_ci?: number; typical_error?: number }
    >();
    expectedSeries.forEach((row) => {
      lookup.set(keyFor(row.year, row.stat_week), {
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
    const selectedForecastRow = lookup.get(selectedKey);
    const current = selectedForecastRow?.expected_count ?? null;
    const previous = shiftIsoWeek(selectedPeriodYear, selectedPeriodWeek, -1);
    const previousValue = actualLookup.get(keyFor(previous.year, previous.statWeek)) ?? null;
    const baselineWeeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      .map((n) => shiftIsoWeek(selectedPeriodYear, selectedPeriodWeek, -n))
      .map((wk) => actualLookup.get(keyFor(wk.year, wk.statWeek)))
      .filter((v): v is number => v !== undefined);
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

    const chartWeeks = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((n) =>
      shiftIsoWeek(selectedPeriodYear, selectedPeriodWeek, -n)
    );
    const actualChartValues = chartWeeks.map((wk) => actualLookup.get(keyFor(wk.year, wk.statWeek)) ?? null);
    const forecastChartValues = chartWeeks.map((_, idx) => (idx === chartWeeks.length - 1 ? current : null));
    return {
      current,
      vsPriorWeek: previousValue,
      vs12WeekAvg,
      trend,
      actualChartValues,
      forecastChartValues,
      predictionIndex: forecastChartValues.length - 1,
      ciLow: current !== null ? Math.max(0, current - 6) : undefined,
      ciHigh: current !== null ? current + 6 : undefined,
    };
  }, [actualSeries, expectedSeries, selectedPeriodWeek, selectedPeriodYear]);

  useEffect(() => {
    let active = true;

    const loadModels = async () => {
      try {
        let forecastIds: string[] = [];
        let actualIds: string[] = [];
        let hasForecastForSelectedPeriod: boolean | null = null;

        if (forecastPath) {
          try {
            forecastIds = await loadForecastModelIds(resolution, {
              kind: "explicit",
              explicitPath: forecastPath,
            });
            hasForecastForSelectedPeriod = true;
          } catch {
            hasForecastForSelectedPeriod = false;
          }
        }
        if (forecastIds.length === 0 && latestForecastPath && latestForecastPath !== forecastPath) {
          try {
            forecastIds = await loadForecastModelIds(resolution, {
              kind: "explicit",
              explicitPath: latestForecastPath,
            });
          } catch {
            forecastIds = [];
          }
        }

        for (const candidatePath of actualsPathCandidates) {
          try {
            const ids = await loadForecastModelIds(resolution, {
              kind: "explicit",
              explicitPath: candidatePath,
            });
            if (ids.length > 0) {
              actualIds = ids;
              break;
            }
          } catch {
            // keep trying older periods
          }
        }

        if (!active) return;
        setSelectedPeriodHasForecast(hasForecastForSelectedPeriod);
        const forecastUnique = Array.from(new Set(forecastIds.filter((id) => Boolean(id?.trim()))));
        const actualUnique = Array.from(new Set(actualIds.filter((id) => Boolean(id?.trim()))));
        const forecastOptions = forecastUnique.map((id) => ({ value: id, label: toLabel(id) }));
        const compareOptions = [
          ...forecastUnique.map((id) => createCompareOption("forecast", id, toLabel(id))),
          ...actualUnique.map((id) => createCompareOption("actual", id, toLabel(id))),
        ];

        setModelOptions(forecastOptions);
        setCompareModelOptions(compareOptions);

        if (forecastOptions.length > 0 && !forecastOptions.some((opt) => opt.value === modelId)) {
          const best = forecastOptions.find((opt) => opt.value === appConfig.bestModelId);
          setModelId(best?.value ?? forecastOptions[0].value);
        }
      } catch {
        if (!active) return;
        setSelectedPeriodHasForecast(false);
        setModelOptions([]);
        setCompareModelOptions([]);
      }
    };

    loadModels();
    return () => {
      active = false;
    };
  }, [forecastPath, latestForecastPath, actualsPathCandidates, resolution, modelId, setModelId]);

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
    const timeoutId = window.setTimeout(() => {
      setShowNoForecastNotice(false);
    }, 3200);
    return () => window.clearTimeout(timeoutId);
  }, [selectedPeriodHasForecast, selectedPeriodKeyForNotice]);

  const usingFallbackForecast = selectedPeriodHasForecast === false;

  const compareModels = useMemo<ModelInfo[]>(
    () =>
      compareModelOptions.map((option) => ({
        id: option.value,
        name: option.label,
        family: "baseline",
        tags: [],
        hero: { label: "", value: "" },
        rows: [],
        blurb: "",
      })),
    [compareModelOptions]
  );

  useEffect(() => {
    if (compareModelOptions.length === 0) return;
    setCompareModelA((prev) => prev || compareModelOptions[0].value);
    setCompareModelB((prev) => prev || compareModelOptions[Math.min(1, compareModelOptions.length - 1)].value);
  }, [compareModelOptions]);

  useEffect(() => {
    if (periods.length === 0) return;
    setComparePeriodA((prev) => prev || periods[periods.length - 1].periodKey);
    setComparePeriodB((prev) => prev || periods[Math.max(0, periods.length - 2)].periodKey);
  }, [periods]);

  useEffect(() => {
    if (compareEnabled) return;
    setCompareResolutionA(resolution);
    setCompareResolutionB(resolution);
  }, [compareEnabled, resolution]);

  const periodOptions = useMemo(() => periods.map((p) => p.periodKey), [periods]);
  const compareDisabled = compareModelOptions.length === 0 || periods.length === 0;
  const compareDisabledReason = compareDisabled ? "Compare will enable after compare options load" : undefined;
  const compareModelIds = useMemo(() => compareModelOptions.map((option) => option.value), [compareModelOptions]);
  const compareOptionByValue = useMemo(
    () => new Map(compareModelOptions.map((option) => [option.value, option])),
    [compareModelOptions]
  );
  const resolvedCompareModelA = useMemo(() => {
    if (compareModelIds.length === 0) return "";
    if (compareModelIds.includes(compareModelA)) return compareModelA;
    const currentForecastOption = compareModelOptions.find(
      (option) => option.source === "forecast" && option.modelId === modelId
    );
    if (currentForecastOption) return currentForecastOption.value;
    return compareModelIds[0];
  }, [compareModelIds, compareModelOptions, compareModelA, modelId]);
  const resolvedCompareModelB = useMemo(() => {
    if (compareModelIds.length === 0) return "";
    if (compareModelIds.includes(compareModelB)) return compareModelB;
    return compareModelIds.length > 1 && compareModelIds[1] !== resolvedCompareModelA
      ? compareModelIds[1]
      : compareModelIds[0];
  }, [compareModelIds, compareModelB, resolvedCompareModelA]);
  const resolvedComparePeriodA = useMemo(() => {
    if (periodOptions.length === 0) return "";
    if (periodOptions.includes(comparePeriodA)) return comparePeriodA;
    return periodOptions[periodOptions.length - 1];
  }, [periodOptions, comparePeriodA]);
  const resolvedComparePeriodB = useMemo(() => {
    if (periodOptions.length === 0) return "";
    if (periodOptions.includes(comparePeriodB)) return comparePeriodB;
    return periodOptions[Math.max(0, periodOptions.length - 2)];
  }, [periodOptions, comparePeriodB]);

  useEffect(() => {
    if (resolvedCompareModelA && compareModelA !== resolvedCompareModelA) setCompareModelA(resolvedCompareModelA);
  }, [compareModelA, resolvedCompareModelA]);

  useEffect(() => {
    if (resolvedCompareModelB && compareModelB !== resolvedCompareModelB) setCompareModelB(resolvedCompareModelB);
  }, [compareModelB, resolvedCompareModelB]);

  useEffect(() => {
    if (resolvedComparePeriodA && comparePeriodA !== resolvedComparePeriodA) setComparePeriodA(resolvedComparePeriodA);
  }, [comparePeriodA, resolvedComparePeriodA]);

  useEffect(() => {
    if (resolvedComparePeriodB && comparePeriodB !== resolvedComparePeriodB) setComparePeriodB(resolvedComparePeriodB);
  }, [comparePeriodB, resolvedComparePeriodB]);

  const resolveComparePathByPeriodKey = (
    periodKey: string,
    targetResolution: H3Resolution,
    compareOption: CompareOption | undefined
  ) => {
    const period = periods.find((item) => item.periodKey === periodKey);
    if (!period || !compareOption) return undefined;
    return getComparePath(compareOption, targetResolution, period.fileId);
  };
  const resolvedCompareOptionA = compareOptionByValue.get(resolvedCompareModelA);
  const resolvedCompareOptionB = compareOptionByValue.get(resolvedCompareModelB);
  const resolvedCompareModelIdA = resolvedCompareOptionA?.modelId ?? modelId;
  const resolvedCompareModelIdB = resolvedCompareOptionB?.modelId ?? modelId;

  const currentWeek = useMemo(
    () => selectedForecast?.stat_week ?? fallbackPeriod.stat_week,
    [fallbackPeriod.stat_week, selectedForecast]
  );
  const currentWeekYear = useMemo(
    () => selectedForecast?.year ?? fallbackPeriod.year,
    [fallbackPeriod.year, selectedForecast]
  );

  const comparePeriodAObj =
    periods.find((p) => p.periodKey === resolvedComparePeriodA) ?? selectedForecast ?? fallbackPeriod;
  const comparePeriodBObj =
    periods.find((p) => p.periodKey === resolvedComparePeriodB) ?? selectedForecast ?? fallbackPeriod;
  const deltaMode = compareEnabled && compareSettings.showDelta;
  const effectiveCompareResolutionB = deltaMode ? compareResolutionA : compareResolutionB;
  const comparePathA = resolveComparePathByPeriodKey(
    comparePeriodAObj.periodKey,
    compareResolutionA,
    resolvedCompareOptionA
  );
  const comparePathB = resolveComparePathByPeriodKey(
    comparePeriodBObj.periodKey,
    effectiveCompareResolutionB,
    resolvedCompareOptionB
  );
  const deltaFillExpr = useMemo(() => buildDeltaFillExpr("delta_pctl"), []);
  const compareRenderMode: "single" | "dual" | "delta" = compareEnabled
    ? deltaMode
      ? "delta"
      : compareSettings.dualMapMode
        ? "dual"
        : "single"
    : "single";
  const syncEnabled = true;

  const deltaCellPopupHtmlBuilder = useMemo(() => {
    if (!deltaMapData) return undefined;
    return (cellId: string) => {
      const valueA = Number(deltaMapData.valueAByCell[cellId] ?? 0);
      const valueB = Number(deltaMapData.valueBByCell[cellId] ?? 0);
      const pA = Number(deltaMapData.percentileAByCell[cellId] ?? 0.5);
      const pB = Number(deltaMapData.percentileBByCell[cellId] ?? 0.5);
      const delta = Number(deltaMapData.deltaByCell[cellId] ?? 0);
      const modelA = escapeHtml(resolvedCompareModelIdA);
      const modelB = escapeHtml(resolvedCompareModelIdB);

      return `
        <div class="sparkPopup">
          <div class="sparkPopup__title">Cell ${escapeHtml(cellId)}</div>
          <div class="sparkPopup__meta">A (${modelA}): value ${formatCellValue(valueA)} · percentile ${(pA * 100).toFixed(1)}%</div>
          <div class="sparkPopup__meta">B (${modelB}): value ${formatCellValue(valueB)} · percentile ${(pB * 100).toFixed(1)}%</div>
          <div class="sparkPopup__meta">Δ Percentile (A − B): ${delta.toFixed(3)}</div>
        </div>
      `;
    };
  }, [deltaMapData, resolvedCompareModelIdA, resolvedCompareModelIdB]);

  useEffect(() => {
    if (compareEnabled && deltaMode && compareResolutionB !== compareResolutionA) {
      setCompareResolutionB(compareResolutionA);
    }
  }, [compareEnabled, compareResolutionA, compareResolutionB, deltaMode]);

  useEffect(() => {
    if (!compareEnabled || !deltaMode) {
      setDeltaMapData(null);
      return;
    }

    let active = true;

    const computeDelta = async () => {
      const cacheKey = buildDeltaCacheKey({
        weekA: comparePeriodAObj.periodKey,
        weekB: comparePeriodBObj.periodKey,
        resolutionA: compareResolutionA,
        resolutionB: effectiveCompareResolutionB,
        modelA: resolvedCompareModelA,
        modelB: resolvedCompareModelB,
      });

      const cached = deltaCacheRef.current.get(cacheKey);
      if (cached) {
        setDeltaMapData(cached);
        return;
      }

      const [gridA, forecastA, forecastB] = await Promise.all([
        loadGrid(compareResolutionA),
        comparePathA
          ? loadForecast(compareResolutionA, {
              kind: "explicit",
              explicitPath: comparePathA,
              modelId: resolvedCompareModelIdA,
            }).catch(() => ({ values: {} }))
          : Promise.resolve({ values: {} }),
        comparePathB
          ? loadForecast(effectiveCompareResolutionB, {
              kind: "explicit",
              explicitPath: comparePathB,
              modelId: resolvedCompareModelIdB,
            }).catch(() => ({ values: {} }))
          : Promise.resolve({ values: {} }),
      ]);

      if (!active) return;

      const valuesA = forecastA.values ?? {};
      const valuesB = forecastB.values ?? {};
      const domainCellIds = new Set<string>();
      (gridA.features ?? []).forEach((feature) => {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const cellId = getH3CellId(props);
        if (cellId) domainCellIds.add(cellId);
      });
      Object.keys(valuesA).forEach((id) => domainCellIds.add(id));
      Object.keys(valuesB).forEach((id) => domainCellIds.add(id));

      const delta = computeDeltaPercentilesByCell(valuesA, valuesB, Array.from(domainCellIds));
      const result: DeltaMapData = {
        deltaByCell: delta.deltaByCell,
        valueAByCell: valuesA,
        valueBByCell: valuesB,
        percentileAByCell: delta.percentileA,
        percentileBByCell: delta.percentileB,
        domainSize: delta.domainSize,
        deltaMin: delta.deltaMin,
        deltaMax: delta.deltaMax,
      };
      deltaCacheRef.current.set(cacheKey, result);
      setDeltaMapData(result);
    };

    computeDelta().catch((err) => {
      if (!active) return;
      console.warn("[DeltaMap] Failed to compute delta layer", err);
      setDeltaMapData(null);
    });

    return () => {
      active = false;
    };
  }, [
    compareEnabled,
    comparePathA,
    comparePathB,
    comparePeriodAObj.periodKey,
    comparePeriodBObj.periodKey,
    compareResolutionA,
    effectiveCompareResolutionB,
    deltaMode,
    resolvedCompareModelA,
    resolvedCompareModelIdA,
    resolvedCompareModelB,
    resolvedCompareModelIdB,
  ]);

  const handleResetMap = () => {
    setCompareEnabled(false);
    setCompareViewState(null);
    setToolsOpen(false);
    setTimeseriesOpen(false);
    setGridDetailOpen(false);
    setGridDetailCellId(null);
    setGridDetailSelectedWeek(null);
    setGridDetailSelectedWeekYear(null);
    setResolution("H4");
    setModelId(appConfig.bestModelId);
    setLastWeekMode("none");
    setHotspotsEnabled(false);
    setHotspotMode("modeled");
    setHotspotPercentile(1);
    setSelectedPaletteId(DEFAULT_PALETTE_ID);
    setDisplayMode("hex");
    setPoiFilters({ Park: false, Marina: false, Ferry: false });
    setSelectedCompareH3(null);
    setCompareModelA("");
    setCompareModelB("");
    setComparePeriodA("");
    setComparePeriodB("");
    setCompareResolutionA("H4");
    setCompareResolutionB("H4");
    setForecastIndex(
      periods.length > 0
        ? Math.max(0, Math.min(defaultForecastIndexRef.current, periods.length - 1))
        : 0
    );
    setMapResetNonce((prev) => prev + 1);
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
    if (shareBusy || compareEnabled) return;
    setShareBusy(true);
    try {
      const blob = await primaryMapRef.current?.captureSnapshot();
      if (!blob) throw new Error("Snapshot not available");

      const fileName = `orcacast_${currentWeekYear}-W${String(currentWeek).padStart(2, "0")}_${resolution}_${toFileSafeToken(modelId)}.png`;
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
    if (shareBusy || compareEnabled) return;
    setShareBusy(true);
    try {
      const blob = await primaryMapRef.current?.captureSnapshot();
      if (!blob) throw new Error("Snapshot not available");
      const fileName = `orcacast_${currentWeekYear}-W${String(currentWeek).padStart(2, "0")}_${resolution}_${toFileSafeToken(modelId)}.png`;
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
    infoOpen,
    setInfoOpen,
    toolsOpen,
    setToolsOpen,
    timeseriesOpen,
    setTimeseriesOpen,
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
    modelOptions,
    compareModels,
    compareModelA,
    setCompareModelA,
    compareModelB,
    setCompareModelB,
    comparePeriodA,
    setComparePeriodA,
    comparePeriodB,
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
    forecastPeriodText,
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
  };
}
