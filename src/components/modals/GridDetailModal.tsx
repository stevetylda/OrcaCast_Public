import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import {
  getActualsPathForPeriod,
  getForecastPathForPeriod,
  type H3Resolution,
} from "../../config/dataPaths";
import { loadForecast, loadForecastModelIds, loadGrid } from "../../data/forecastIO";
import { getH3CellId } from "../../data/h3";
import type { Period } from "../../data/periods";
import { applyBasemapVisualTuning, DARK_STYLE, VOYAGER_STYLE } from "../ForecastMap/buildLayers";

type GridSeriesPoint = {
  periodKey: string;
  label: string;
  weekLabel: string;
  forecast: number;
  actual: number;
};

type ModelSeries = {
  modelId: string;
  label: string;
  values: number[];
};

type SpreadSeriesPoint = {
  periodKey: string;
  weekLabel: string;
  selected: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  percentile: number;
};

type NeighborhoodSeries = {
  cellId: string;
  label: string;
  forecast: number[];
  actual: number[];
  isSelected: boolean;
  ringIndex: number;
  polygons: number[][][][];
};

type GridDetailPayload = {
  selectedSeries: GridSeriesPoint[];
  modelSeries: ModelSeries[];
  spreadSeries: SpreadSeriesPoint[];
  neighborhoodSeries: NeighborhoodSeries[];
  neighborhoodContextPolygons: number[][][][];
};

type Props = {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  cellId: string | null;
  periods: Period[];
  resolution: H3Resolution;
  modelId: string;
  selectedWeek: number;
  selectedWeekYear: number;
};

export function GridDetailModal({
  open,
  onClose,
  darkMode,
  cellId,
  periods,
  resolution,
  modelId,
  selectedWeek,
  selectedWeekYear,
}: Props) {
  const cacheRef = useRef<Map<string, GridDetailPayload>>(new Map());
  const [payload, setPayload] = useState<GridDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailKey = `${cellId ?? "none"}|${resolution}|${modelId}`;
  const [activeTabState, setActiveTabState] = useState<{
    key: string;
    tab: "forecast" | "models" | "spread" | "neighbors";
  }>({ key: detailKey, tab: "forecast" });
  const activeTab = activeTabState.key === detailKey ? activeTabState.tab : "forecast";
  const setActiveTab = (tab: "forecast" | "models" | "spread" | "neighbors") => {
    setActiveTabState({ key: detailKey, tab });
  };

  useEffect(() => {
    if (!open || !cellId || periods.length === 0) return;
    const cacheKey = `${resolution}|${modelId}|${cellId}|${periods.map((period) => period.periodKey).join("|")}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPayload(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setPayload(null);
    setLoading(true);
    setError(null);

    (async () => {
      const firstForecastPath = getForecastPathForPeriod(resolution, periods[0].fileId);
      const availableModelIds = (
        await loadForecastModelIds(resolution, {
          kind: "explicit",
          explicitPath: firstForecastPath,
        }).catch(() => [])
      ).filter((candidate) => candidate !== "consensus");
      const modelSeriesSeed = new Map<string, ModelSeries>(
        availableModelIds.map((candidate) => [
          candidate,
          {
            modelId: candidate,
            label: toModelLabel(candidate),
            values: [],
          },
        ])
      );
      const grid = await loadGrid(resolution).catch(() => null);
      const neighborhoodSeed = buildNeighborhoodSeed(cellId, grid);
      const neighborhoodContextPolygons = buildNeighborhoodContextPolygons(neighborhoodSeed, grid);
      const neighborhoodForecastSeries = new Map<string, number[]>();
      const neighborhoodActualSeries = new Map<string, number[]>();
      neighborhoodSeed.forEach((neighbor) => {
        neighborhoodForecastSeries.set(neighbor.cellId, []);
        neighborhoodActualSeries.set(neighbor.cellId, []);
      });

      const seriesRows = await Promise.all(
        periods.map(async (period) => {
          const forecastPath = getForecastPathForPeriod(resolution, period.fileId);
          const [focusedForecastPayload, actualPayload] = await Promise.all([
            loadForecast(resolution, {
              kind: "explicit",
              explicitPath: forecastPath,
              modelId,
            }).catch(() => ({ values: {} })),
            loadForecast(resolution, {
              kind: "explicit",
              explicitPath: getActualsPathForPeriod(resolution, period.fileId),
            }).catch(() => ({ values: {} })),
          ]);
          const forecastValues = focusedForecastPayload.values as Record<string, number>;
          const actualValues = actualPayload.values as Record<string, number>;
          neighborhoodSeed.forEach((neighbor) => {
            neighborhoodForecastSeries.get(neighbor.cellId)?.push(Number(forecastValues[neighbor.cellId] ?? 0));
            neighborhoodActualSeries.get(neighbor.cellId)?.push(Number(actualValues[neighbor.cellId] ?? 0));
          });
          const candidateSeries = await Promise.all(
            availableModelIds.map(async (candidate) => {
              const candidatePayload = await loadForecast(resolution, {
                kind: "explicit",
                explicitPath: forecastPath,
                modelId: candidate,
              }).catch(() => ({ values: {} }));
              const candidateValues = candidatePayload.values as Record<string, number>;
              const value = Number(candidateValues[cellId] ?? 0);
              const targetSeries = modelSeriesSeed.get(candidate);
              targetSeries?.values.push(value);
              return value;
            })
          );
          const rankedValues = Object.values(forecastValues)
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => a - b);
          const selectedValue = Number(forecastValues[cellId] ?? 0);

          return {
            point: {
              periodKey: period.periodKey,
              label: period.label,
              weekLabel: `${period.year}-W${String(period.stat_week).padStart(2, "0")}`,
              forecast: selectedValue,
              actual: Number(actualValues[cellId] ?? 0),
            } satisfies GridSeriesPoint,
            spread: {
              periodKey: period.periodKey,
              weekLabel: `${period.year}-W${String(period.stat_week).padStart(2, "0")}`,
              selected: selectedValue,
              min: quantile(candidateSeries, 0),
              max: quantile(candidateSeries, 1),
              p25: quantile(candidateSeries, 0.25),
              p75: quantile(candidateSeries, 0.75),
              percentile: computePercentile(selectedValue, rankedValues),
            } satisfies SpreadSeriesPoint,
          };
        })
      );
      const selectedSeries = seriesRows.map((row) => row.point);
      const spreadSeries = seriesRows.map((row) => row.spread);
      const neighborhoodSeries = neighborhoodSeed.map((neighbor) => ({
        cellId: neighbor.cellId,
        label: neighbor.label,
        isSelected: neighbor.isSelected,
        ringIndex: neighbor.ringIndex,
        polygons: neighbor.polygons,
        forecast: neighborhoodForecastSeries.get(neighbor.cellId) ?? [],
        actual: neighborhoodActualSeries.get(neighbor.cellId) ?? [],
      }));

      return {
        selectedSeries,
        modelSeries: Array.from(modelSeriesSeed.values()),
        spreadSeries,
        neighborhoodSeries,
        neighborhoodContextPolygons,
      } satisfies GridDetailPayload;
    })()
      .then((nextSeries) => {
        if (!active) return;
        cacheRef.current.set(cacheKey, nextSeries);
        setPayload(nextSeries);
        setLoading(false);
      })
      .catch((nextError) => {
        if (!active) return;
        setLoading(false);
        setError(nextError instanceof Error ? nextError.message : "Unable to load grid detail");
      });

    return () => {
      active = false;
    };
  }, [cellId, modelId, open, periods, resolution]);

  const selectedPeriodKey = `${selectedWeekYear}-W${String(selectedWeek).padStart(2, "0")}`;
  const selectedIndex = useMemo(
    () => payload?.selectedSeries.findIndex((point) => point.weekLabel === selectedPeriodKey) ?? -1,
    [payload, selectedPeriodKey]
  );
  if (!open || !cellId) return null;

  return (
    <div
      className={`overlay overlay--blur${darkMode ? "" : " overlay--light"}`}
      onClick={onClose}
      role="presentation"
    >
      <section
        className={`modal modal--gridDetail${darkMode ? "" : " modal--light"}`}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Expanded view for grid ${cellId}`}
      >
        <div className="modal__header gridDetail__header">
          <div>
            <div className="modal__title">Grid Detail</div>
            <div className="modal__subtitle">
              Cell {cellId} · {resolution} · {payload?.selectedSeries.length ?? periods.length} forecast periods
            </div>
          </div>
          <button className="iconBtn iconBtn--ghost" onClick={onClose} aria-label="Close expanded grid view">
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>
        <div className="modal__body gridDetail__body">
          <div className="gridDetail__tabs" role="tablist" aria-label="Grid detail views">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "forecast"}
              className={`gridDetail__tab${activeTab === "forecast" ? " gridDetail__tab--active" : ""}`}
              onClick={() => setActiveTab("forecast")}
            >
              Forecast vs Actuals
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "models"}
              className={`gridDetail__tab${activeTab === "models" ? " gridDetail__tab--active" : ""}`}
              onClick={() => setActiveTab("models")}
            >
              Model Overlap
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "spread"}
              className={`gridDetail__tab${activeTab === "spread" ? " gridDetail__tab--active" : ""}`}
              onClick={() => setActiveTab("spread")}
            >
              Spread And Percentile
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "neighbors"}
              className={`gridDetail__tab${activeTab === "neighbors" ? " gridDetail__tab--active" : ""}`}
              onClick={() => setActiveTab("neighbors")}
            >
              Neighborhood
            </button>
          </div>

          {activeTab === "forecast" && payload?.selectedSeries && payload.selectedSeries.length > 0 && (
            <div className="gridDetail__chartShell">
              <div className="gridDetail__chartTitle">
                Forecast And Actuals: {toModelLabel(modelId)}
              </div>
              <div className="gridDetail__chartSubtitle">
                Forecast probability and observed sighting counts across the full forecast window
              </div>
              <GridDetailChart points={payload.selectedSeries} selectedIndex={selectedIndex} darkMode={darkMode} />
            </div>
          )}

          {activeTab === "models" &&
            payload?.modelSeries &&
            payload.modelSeries.length > 0 &&
            payload.selectedSeries.length > 0 && (
            <div className="gridDetail__chartShell">
              <div className="gridDetail__chartTitle">Model Overlap</div>
              <div className="gridDetail__chartSubtitle">Week of year vs forecast probability by model</div>
              <ModelOverlapChart
                points={payload.selectedSeries}
                modelSeries={payload.modelSeries}
                selectedIndex={selectedIndex}
                activeModelId={modelId}
                darkMode={darkMode}
              />
            </div>
          )}

          {activeTab === "spread" && payload?.spreadSeries && payload.spreadSeries.length > 0 && (
            <div className="gridDetail__chartShell">
              <div className="gridDetail__chartTitle">Model Spread And Grid Percentile</div>
              <div className="gridDetail__chartSubtitle">
                Spread band across models with selected-model percentile among all grids
              </div>
              <SpreadPercentileChart points={payload.spreadSeries} selectedIndex={selectedIndex} darkMode={darkMode} />
            </div>
          )}

          {activeTab === "neighbors" && payload?.neighborhoodSeries && payload.neighborhoodSeries.length > 0 && (
            <div className="gridDetail__chartShell">
              <div className="gridDetail__chartTitle">Neighborhood Comparison</div>
              <div className="gridDetail__chartSubtitle">
                Center cell and six nearest neighbors across the full forecast window
              </div>
              <NeighborhoodComparisonPanel
                periods={payload.selectedSeries}
                series={payload.neighborhoodSeries}
                contextPolygons={payload.neighborhoodContextPolygons}
                selectedIndex={selectedIndex}
                darkMode={darkMode}
              />
            </div>
          )}

          {loading && <div className="gridDetail__loading">Loading full-period grid history…</div>}
          {!loading && error && <div className="gridDetail__loading">{error}</div>}
          {!loading && !error && (!payload || payload.selectedSeries.length === 0) && (
            <div className="gridDetail__loading">No time-series data available for this grid.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function GridDetailChart({
  points,
  selectedIndex,
  darkMode,
}: {
  points: GridSeriesPoint[];
  selectedIndex: number;
  darkMode: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useResizeObserver(wrapRef);
  const width = Math.max(760, Math.floor(size.width || 980));
  const height = 390;
  const margin = { top: 28, right: 70, bottom: 100, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const forecastMax = Math.max(0.01, ...points.map((point) => point.forecast));
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xFor = (index: number) => margin.left + index * xStep;
  const yForecast = (value: number) => margin.top + plotHeight * (1 - value / forecastMax);
  const yActual = margin.top;
  const forecastPath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yForecast(point.forecast).toFixed(1)}`)
    .join(" ");
  const xTicks = buildTickIndexes(points.length);
  const leftTicks = buildLinearTicks(forecastMax, 4);
  const selectedX = selectedIndex >= 0 ? xFor(selectedIndex) : null;
  const axisText = darkMode ? "rgba(255,255,255,0.82)" : "rgba(18,44,78,0.84)";
  const gridStroke = darkMode ? "rgba(255,255,255,0.08)" : "rgba(26,58,96,0.14)";
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const activeIndex = hoverIndex ?? (selectedIndex >= 0 ? selectedIndex : null);
  const activePoint = activeIndex !== null ? points[activeIndex] ?? null : null;
  const actualDotColor = darkMode ? "#cbd5e1" : "#334155";

  const updateTooltipPosition = (clientX: number, clientY: number) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooltipWidth = 360;
    setTooltipPos({
      x: Math.min(rect.width - tooltipWidth - 12, Math.max(18, clientX - rect.left + 12)),
      y: Math.min(rect.height - 18, Math.max(18, clientY - rect.top - 16)),
    });
  };

  return (
    <div ref={panelRef} className="gridDetail__chartPanel">
      {activePoint && tooltipPos && (
        <div className="gridDetail__tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <span>{activePoint.weekLabel}</span>
          <span>Forecast: {formatForecastValue(activePoint.forecast)}</span>
          <span>Actual observation: {formatObservedFlag(activePoint.actual)}</span>
        </div>
      )}
      <div
        ref={wrapRef}
        className="gridDetail__chartScroller"
        onMouseLeave={() => {
          setHoverIndex(null);
          setTooltipPos(null);
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Grid detail chart">
        {leftTicks.map((tick) => {
          const y = yForecast(tick);
          return (
            <g key={`left-${tick}`}>
              <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} stroke={gridStroke} strokeWidth={1} />
              <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill={axisText}>
                {formatForecastValue(tick)}
              </text>
            </g>
          );
        })}
        <text x={width - margin.right + 10} y={yActual + 4} textAnchor="start" fontSize="11" fill={axisText}>
          1
        </text>
        {selectedX !== null && (
          <line
            x1={selectedX}
            x2={selectedX}
            y1={margin.top}
            y2={height - margin.bottom}
            stroke="rgba(255, 166, 43, 0.9)"
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        )}
        <path d={forecastPath} fill="none" stroke="#19f0d7" strokeWidth={2.5} />
        {points.map((point, index) => {
          if (!isObservedActual(point.actual)) return null;
          const isActive = activeIndex === index;
          return (
            <circle
              key={`${point.periodKey}-actual`}
              cx={xFor(index)}
              cy={yActual}
              r={isActive ? 5 : 4}
              fill={actualDotColor}
              stroke={darkMode ? "rgba(8,18,44,0.92)" : "rgba(255,255,255,0.98)"}
              strokeWidth={isActive ? 2 : 1.5}
            />
          );
        })}
        {activeIndex !== null && (
          <>
            <circle cx={xFor(activeIndex)} cy={yForecast(points[activeIndex].forecast)} r={4} fill="#19f0d7" />
            {isObservedActual(points[activeIndex].actual) && (
              <circle
                cx={xFor(activeIndex)}
                cy={yActual}
                r={5}
                fill={actualDotColor}
                stroke={darkMode ? "rgba(8,18,44,0.92)" : "rgba(255,255,255,0.98)"}
                strokeWidth={2}
              />
            )}
          </>
        )}
        {xTicks.map((index) => (
          <g key={`x-${index}`}>
            <line
              x1={xFor(index)}
              x2={xFor(index)}
              y1={height - margin.bottom}
              y2={height - margin.bottom + 6}
              stroke={gridStroke}
              strokeWidth={1}
            />
            <text
              x={xFor(index)}
              y={height - margin.bottom + 20}
              textAnchor="middle"
              fontSize="11"
              fill={axisText}
            >
              {points[index].weekLabel}
            </text>
          </g>
        ))}
        <text x={margin.left} y={14} fontSize="12" fill="#19f0d7" fontWeight="700">
          Forecast value
        </text>
        <text x={width - margin.right} y={height - 53} textAnchor="end" fontSize="12" fill="#f59e0b" fontWeight="700">
          Observed sighting week
        </text>
        <text x={width - margin.right} y={height - 37} textAnchor="end" fontSize="11" fill={axisText}>
          Observed weeks shown as top dots
        </text>
        <text
          x={margin.left + plotWidth / 2}
          y={height - 18}
          textAnchor="middle"
          fontSize="12"
          fill={axisText}
          fontWeight="600"
        >
          Forecast period
        </text>
        <text
          x={18}
          y={margin.top + plotHeight / 2}
          transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`}
          textAnchor="middle"
          fontSize="12"
          fill="#19f0d7"
          fontWeight="700"
        >
          Forecast probability
        </text>
        {points.map((point, index) => {
          const hitWidth = Math.max(12, plotWidth / Math.max(points.length, 24));
          const x = xFor(index) - hitWidth / 2;
          return (
            <rect
              key={point.periodKey}
              x={x}
              y={margin.top}
              width={hitWidth}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={(event) => {
                setHoverIndex(index);
                updateTooltipPosition(event.clientX, event.clientY);
              }}
              onMouseMove={(event) => {
                setHoverIndex(index);
                updateTooltipPosition(event.clientX, event.clientY);
              }}
            />
          );
        })}
      </svg>
      </div>
    </div>
  );
}

function ModelOverlapChart({
  points,
  modelSeries,
  selectedIndex,
  activeModelId,
  darkMode,
}: {
  points: GridSeriesPoint[];
  modelSeries: ModelSeries[];
  selectedIndex: number;
  activeModelId: string;
  darkMode: boolean;
}) {
  const visibleSeries = modelSeries.filter((series) => series.values.some((value) => value > 0));
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useResizeObserver(wrapRef);
  const width = Math.max(760, Math.floor(size.width || 980));
  const height = 400;
  const margin = { top: 28, right: 70, bottom: 100, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xFor = (index: number) => margin.left + index * xStep;
  const maxY = Math.max(0.01, ...visibleSeries.flatMap((series) => series.values));
  const yFor = (value: number) => margin.top + plotHeight * (1 - value / maxY);
  const selectedX = selectedIndex >= 0 ? xFor(selectedIndex) : null;
  const yTicks = buildLinearTicks(maxY, 4);
  const xTicks = buildTickIndexes(points.length);
  const axisText = darkMode ? "rgba(255,255,255,0.82)" : "rgba(18,44,78,0.84)";
  const gridStroke = darkMode ? "rgba(255,255,255,0.08)" : "rgba(26,58,96,0.14)";
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const activeIndex = hoverIndex ?? (selectedIndex >= 0 ? selectedIndex : null);
  const activePoint = activeIndex !== null ? points[activeIndex] ?? null : null;
  const actualDotColor = darkMode ? "#cbd5e1" : "#334155";
  const tooltipRows =
    activeIndex === null
      ? []
      : visibleSeries.map((series, index) => ({
          label: series.label,
          color: getModelColor(index),
          value: series.values[activeIndex] ?? 0,
          active: series.modelId === activeModelId,
        }));

  const updateTooltipPosition = (clientX: number, clientY: number) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooltipWidth = 440;
    setTooltipPos({
      x: Math.min(rect.width - tooltipWidth - 12, Math.max(18, clientX - rect.left + 12)),
      y: Math.min(rect.height - 18, Math.max(18, clientY - rect.top - 16)),
    });
  };

  return (
    <>
      <div ref={panelRef} className="gridDetail__chartPanel">
        {activePoint && tooltipPos && (
          <div className="gridDetail__tooltip gridDetail__tooltip--models" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
            <span>{activePoint.weekLabel}</span>
            <span>Actual observation: {formatObservedFlag(activePoint.actual)}</span>
            {tooltipRows.map((row) => (
              <span key={row.label} style={{ color: row.color, fontWeight: row.active ? 700 : 500 }}>
                {row.label}: {formatForecastValue(row.value)}
              </span>
            ))}
          </div>
        )}
        <div
          ref={wrapRef}
          className="gridDetail__chartScroller"
          onMouseLeave={() => {
            setHoverIndex(null);
            setTooltipPos(null);
          }}
        >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label="Overlapped model probability chart"
        >
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line x1={margin.left} x2={width - margin.right} y1={yFor(tick)} y2={yFor(tick)} stroke={gridStroke} strokeWidth={1} />
              <text x={margin.left - 10} y={yFor(tick) + 4} textAnchor="end" fontSize="11" fill={axisText}>
                {formatForecastValue(tick)}
              </text>
            </g>
          ))}
          {selectedX !== null && (
            <line
              x1={selectedX}
              x2={selectedX}
              y1={margin.top}
              y2={height - margin.bottom}
              stroke="rgba(255, 166, 43, 0.9)"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          )}
          {visibleSeries.map((series, index) => {
            const color = getModelColor(index);
            const isActive = series.modelId === activeModelId;
            const path = series.values
              .map((value, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${xFor(pointIndex).toFixed(1)} ${yFor(value).toFixed(1)}`)
              .join(" ");
            return (
              <path
                key={series.modelId}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={isActive ? 3.2 : 1.9}
                strokeOpacity={hoverIndex !== null ? (isActive ? 1 : 0.18) : isActive ? 1 : 0.72}
              />
            );
          })}
          {points.map((point, index) => {
            if (!isObservedActual(point.actual)) return null;
            const isActive = activeIndex === index;
            return (
              <circle
                key={`${point.periodKey}-model-actual`}
                cx={xFor(index)}
                cy={margin.top}
                r={isActive ? 5 : 4}
                fill={actualDotColor}
                stroke={darkMode ? "rgba(8,18,44,0.92)" : "rgba(255,255,255,0.98)"}
                strokeWidth={isActive ? 2 : 1.5}
              />
            );
          })}
          {activeIndex !== null &&
            visibleSeries.map((series, index) => (
              <circle
                key={`${series.modelId}-dot`}
                cx={xFor(activeIndex)}
                cy={yFor(series.values[activeIndex] ?? 0)}
                r={series.modelId === activeModelId ? 4 : 3}
                fill={getModelColor(index)}
                opacity={0.95}
              />
            ))}
          {activeIndex !== null && isObservedActual(points[activeIndex].actual) && (
            <circle
              cx={xFor(activeIndex)}
              cy={margin.top}
              r={5}
              fill={actualDotColor}
              stroke={darkMode ? "rgba(8,18,44,0.92)" : "rgba(255,255,255,0.98)"}
              strokeWidth={2}
            />
          )}
          {xTicks.map((index) => (
            <g key={`mx-${index}`}>
              <line
                x1={xFor(index)}
                x2={xFor(index)}
                y1={height - margin.bottom}
                y2={height - margin.bottom + 6}
                stroke={gridStroke}
                strokeWidth={1}
              />
              <text x={xFor(index)} y={height - margin.bottom + 20} textAnchor="middle" fontSize="11" fill={axisText}>
                {points[index].weekLabel}
              </text>
            </g>
          ))}
          <text
            x={margin.left + plotWidth / 2}
            y={height - 18}
            textAnchor="middle"
            fontSize="12"
            fill={axisText}
            fontWeight="600"
          >
            Forecast period
          </text>
          <text
            x={18}
            y={margin.top + plotHeight / 2}
            transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`}
            textAnchor="middle"
            fontSize="12"
            fill={axisText}
            fontWeight="700"
          >
            Forecast probability
          </text>
          <text x={width - margin.right} y={height - 40} textAnchor="end" fontSize="11" fill={axisText}>
            Observed weeks shown as top dots
          </text>
          {points.map((point, index) => {
            const hitWidth = Math.max(12, plotWidth / Math.max(points.length, 24));
            const x = xFor(index) - hitWidth / 2;
            return (
              <rect
                key={`hover-${point.periodKey}`}
                x={x}
                y={margin.top}
                width={hitWidth}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={(event) => {
                  setHoverIndex(index);
                  updateTooltipPosition(event.clientX, event.clientY);
                }}
                onMouseMove={(event) => {
                  setHoverIndex(index);
                  updateTooltipPosition(event.clientX, event.clientY);
                }}
              />
            );
          })}
        </svg>
        </div>
      </div>
      <div className="gridDetail__legend">
        {visibleSeries.map((series, index) => {
          const isActive = series.modelId === activeModelId;
          return (
            <div className={`gridDetail__legendItem${isActive ? " gridDetail__legendItem--active" : ""}`} key={series.modelId}>
              <span className="gridDetail__legendSwatch" style={{ background: getModelColor(index) }} />
              <span>{series.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SpreadPercentileChart({
  points,
  selectedIndex,
  darkMode,
}: {
  points: SpreadSeriesPoint[];
  selectedIndex: number;
  darkMode: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useResizeObserver(wrapRef);
  const width = Math.max(760, Math.floor(size.width || 980));
  const height = 380;
  const margin = { top: 28, right: 70, bottom: 72, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xFor = (index: number) => margin.left + index * xStep;
  const maxSpread = Math.max(0.01, ...points.map((point) => point.max));
  const ySpread = (value: number) => margin.top + plotHeight * (1 - value / maxSpread);
  const yPct = (value: number) => margin.top + plotHeight * (1 - value);
  const xTicks = buildTickIndexes(points.length);
  const leftTicks = buildLinearTicks(maxSpread, 4);
  const selectedX = selectedIndex >= 0 ? xFor(selectedIndex) : null;
  const axisText = darkMode ? "rgba(255,255,255,0.82)" : "rgba(18,44,78,0.84)";
  const gridStroke = darkMode ? "rgba(255,255,255,0.08)" : "rgba(26,58,96,0.14)";
  const bandPath = buildBandPath(points, xFor, ySpread);
  const selectedPath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${ySpread(point.selected).toFixed(1)}`)
    .join(" ");
  const pctPath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yPct(point.percentile).toFixed(1)}`)
    .join(" ");

  return (
    <div ref={wrapRef} className="gridDetail__chartScroller">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Model spread and percentile chart">
        {leftTicks.map((tick) => (
          <g key={`spread-${tick}`}>
            <line x1={margin.left} x2={width - margin.right} y1={ySpread(tick)} y2={ySpread(tick)} stroke={gridStroke} strokeWidth={1} />
            <text x={margin.left - 10} y={ySpread(tick) + 4} textAnchor="end" fontSize="11" fill={axisText}>
              {formatForecastValue(tick)}
            </text>
          </g>
        ))}
        {selectedX !== null && (
          <line x1={selectedX} x2={selectedX} y1={margin.top} y2={height - margin.bottom} stroke="rgba(255,166,43,0.9)" strokeWidth={2} strokeDasharray="5 4" />
        )}
        <path d={bandPath} fill="rgba(96,165,250,0.16)" stroke="none" />
        <path d={selectedPath} fill="none" stroke="#19f0d7" strokeWidth={2.8} />
        <path d={pctPath} fill="none" stroke="#a78bfa" strokeWidth={2.4} strokeDasharray="6 5" />
        {xTicks.map((index) => (
          <g key={`spread-x-${index}`}>
            <line x1={xFor(index)} x2={xFor(index)} y1={height - margin.bottom} y2={height - margin.bottom + 6} stroke={gridStroke} strokeWidth={1} />
            <text x={xFor(index)} y={height - margin.bottom + 20} textAnchor="middle" fontSize="11" fill={axisText}>
              {points[index].weekLabel}
            </text>
          </g>
        ))}
        <text x={margin.left} y={14} fontSize="12" fill="#60a5fa" fontWeight="700">Model spread</text>
        <text x={width - margin.right} y={14} textAnchor="end" fontSize="12" fill="#a78bfa" fontWeight="700">Grid percentile</text>
        <text x={margin.left + plotWidth / 2} y={height - 18} textAnchor="middle" fontSize="12" fill={axisText} fontWeight="600">
          Forecast period
        </text>
        <text x={18} y={margin.top + plotHeight / 2} transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`} textAnchor="middle" fontSize="12" fill="#60a5fa" fontWeight="700">
          Forecast probability
        </text>
        <text x={width - 14} y={margin.top + plotHeight / 2} transform={`rotate(90 ${width - 14} ${margin.top + plotHeight / 2})`} textAnchor="middle" fontSize="12" fill="#a78bfa" fontWeight="700">
          Percentile
        </text>
      </svg>
      <div className="gridDetail__legend">
        <div className="gridDetail__legendItem"><span className="gridDetail__legendSwatch" style={{ background: "#60a5fa" }} />IQR and min-max spread</div>
        <div className="gridDetail__legendItem"><span className="gridDetail__legendSwatch" style={{ background: "#19f0d7" }} />Selected model value</div>
        <div className="gridDetail__legendItem"><span className="gridDetail__legendSwatch" style={{ background: "#a78bfa" }} />Selected-model percentile</div>
      </div>
    </div>
  );
}

function NeighborhoodComparisonPanel({
  periods,
  series,
  contextPolygons,
  selectedIndex,
  darkMode,
}: {
  periods: GridSeriesPoint[];
  series: NeighborhoodSeries[];
  contextPolygons: number[][][][];
  selectedIndex: number;
  darkMode: boolean;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useResizeObserver(wrapRef);
  const width = Math.max(760, Math.floor(size.width || 980));
  const height = 340;
  const margin = { top: 34, right: 122, bottom: 72, left: 64 };
  const plotHeight = height - margin.top - margin.bottom;
  const plotWidth = width - margin.left - margin.right;
  const xStep = periods.length > 1 ? plotWidth / (periods.length - 1) : 0;
  const xFor = (index: number) => margin.left + index * xStep;
  const axisText = darkMode ? "rgba(255,255,255,0.82)" : "rgba(18,44,78,0.84)";
  const gridStroke = darkMode ? "rgba(255,255,255,0.08)" : "rgba(26,58,96,0.14)";
  const selectedX = selectedIndex >= 0 ? xFor(selectedIndex) : null;
  const xTicks = buildTickIndexes(periods.length);
  const [scaledMode, setScaledMode] = useState(false);
  const displaySeries = useMemo(
    () =>
      series.map((entry) => ({
        ...entry,
        displayForecast: scaledMode ? minMaxScale(entry.forecast) : entry.forecast,
      })),
    [scaledMode, series]
  );
  const displayForecastMax = scaledMode
    ? 1
    : Math.max(0.01, ...displaySeries.flatMap((entry) => entry.displayForecast));
  const yForecast = (value: number) => margin.top + plotHeight * (1 - value / displayForecastMax);
  const forecastTicks = buildLinearTicks(displayForecastMax, 4);
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const activeSeries = displaySeries.find((entry) => entry.cellId === activeCellId) ?? null;
  const activePointIndex = selectedIndex >= 0 ? selectedIndex : null;

  const updateTooltipPosition = (clientX: number, clientY: number) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooltipWidth = 280;
    setTooltipPos({
      x: Math.min(rect.width - tooltipWidth - 12, Math.max(18, clientX - rect.left + 12)),
      y: Math.min(rect.height - 18, Math.max(18, clientY - rect.top - 16)),
    });
  };

  return (
    <div ref={panelRef} className="gridDetail__neighbors">
      {activeSeries && tooltipPos && activePointIndex !== null && periods[activePointIndex] && (
        <div className="gridDetail__tooltip gridDetail__tooltip--neighbors" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <span>{activeSeries.label}</span>
          <span>{periods[activePointIndex].weekLabel}</span>
          <span>
            Forecast: {formatForecastValue(activeSeries.forecast[activePointIndex] ?? 0)}
            {scaledMode ? ` · scaled ${formatScaledValue(activeSeries.displayForecast[activePointIndex] ?? 0)}` : ""}
          </span>
          <span>Actual: {formatCount(activeSeries.actual[activePointIndex] ?? 0)}</span>
        </div>
      )}
      <div className="gridDetail__neighborHeader">
        <div className="gridDetail__neighborHeaderCopy">
          <div className="gridDetail__neighborTitle">Forecasts with actual-event dots at max</div>
          <div className="gridDetail__neighborControls">
            <button
              type="button"
              className={`gridDetail__viewToggle${scaledMode ? "" : " gridDetail__viewToggle--active"}`}
              onClick={() => setScaledMode(false)}
            >
              Absolute
            </button>
            <button
              type="button"
              className={`gridDetail__viewToggle${scaledMode ? " gridDetail__viewToggle--active" : ""}`}
              onClick={() => setScaledMode(true)}
            >
              Min/Max Scaled
            </button>
          </div>
        </div>
        <NeighborMiniMap
          series={series}
          contextPolygons={contextPolygons}
          activeCellId={activeCellId}
          darkMode={darkMode}
          onActivate={setActiveCellId}
        />
      </div>
      <div
        ref={wrapRef}
        className="gridDetail__chartScroller"
        onMouseLeave={() => {
          setTooltipPos(null);
          setActiveCellId(null);
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Neighbor comparison chart">
          {forecastTicks.map((tick) => (
            <g key={`nf-${tick}`}>
              <line x1={margin.left} x2={width - margin.right} y1={yForecast(tick)} y2={yForecast(tick)} stroke={gridStroke} strokeWidth={1} />
              <text x={margin.left - 10} y={yForecast(tick) + 4} textAnchor="end" fontSize="11" fill={axisText}>
                {formatForecastValue(tick)}
              </text>
            </g>
          ))}
          {selectedX !== null && (
            <line
              x1={selectedX}
              x2={selectedX}
              y1={margin.top}
              y2={height - margin.bottom}
              stroke="rgba(255, 166, 43, 0.9)"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          )}
          {displaySeries.map((entry) => {
            const color = getNeighborColor(entry.ringIndex);
            const isActive = activeCellId === entry.cellId;
            const forecastPath = entry.displayForecast
              .map((value, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${xFor(pointIndex).toFixed(1)} ${yForecast(value).toFixed(1)}`)
              .join(" ");
            const opacity = activeCellId ? (isActive ? 1 : 0.22) : 0.88;
            return (
              <g key={entry.cellId}>
                <path
                  d={forecastPath}
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? 3.4 : 2.1}
                  strokeOpacity={opacity}
                  onMouseMove={(event) => {
                    setActiveCellId(entry.cellId);
                    updateTooltipPosition(event.clientX, event.clientY);
                  }}
                />
                {entry.actual.map((value, pointIndex) => {
                  if (!isObservedActual(value)) return null;
                  return (
                    <circle
                      key={`${entry.cellId}-actual-${pointIndex}`}
                      cx={xFor(pointIndex)}
                      cy={yForecast(displayForecastMax)}
                      r={isActive ? 4.6 : 3.2}
                      fill={color}
                      opacity={opacity}
                      onMouseMove={(event) => {
                        setActiveCellId(entry.cellId);
                        updateTooltipPosition(event.clientX, event.clientY);
                      }}
                    />
                  );
                })}
                {activePointIndex !== null && (
                  <>
                    {isObservedActual(entry.actual[activePointIndex] ?? 0) && (
                      <circle
                        cx={xFor(activePointIndex)}
                        cy={yForecast(displayForecastMax)}
                        r={isActive ? 5.2 : 3.8}
                        fill={color}
                        opacity={opacity}
                      />
                    )}
                    <circle cx={xFor(activePointIndex)} cy={yForecast(entry.displayForecast[activePointIndex] ?? 0)} r={isActive ? 4.8 : 3.1} fill={color} opacity={opacity} />
                  </>
                )}
              </g>
            );
          })}
          {xTicks.map((index) => (
            <g key={`nx-${index}`}>
              <line x1={xFor(index)} x2={xFor(index)} y1={height - margin.bottom} y2={height - margin.bottom + 6} stroke={gridStroke} strokeWidth={1} />
              <text x={xFor(index)} y={height - margin.bottom + 20} textAnchor="middle" fontSize="11" fill={axisText}>
                {periods[index].weekLabel}
              </text>
            </g>
          ))}
          <text x={margin.left} y={16} fontSize="12" fill={axisText} fontWeight="700">
            {scaledMode ? "Min/Max scaled forecasts with actual-event dots at max" : "Forecasts with actual-event dots at max"}
          </text>
          <text x={margin.left + plotWidth / 2} y={height - 18} textAnchor="middle" fontSize="12" fill={axisText} fontWeight="600">
            Forecast period
          </text>
        </svg>
      </div>
      <div className="gridDetail__legend">
        {series.map((entry) => {
          const isActive = activeCellId === entry.cellId;
          return (
            <button
              type="button"
              key={entry.cellId}
              className={`gridDetail__legendButton${isActive ? " gridDetail__legendButton--active" : ""}`}
              onMouseEnter={() => setActiveCellId(entry.cellId)}
              onFocus={() => setActiveCellId(entry.cellId)}
            >
              <span className="gridDetail__legendSwatch" style={{ background: getNeighborColor(entry.ringIndex) }} />
              <span>{entry.label}</span>
            </button>
          );
        })}
      </div>
      <div className={`gridDetail__neighborNote${darkMode ? "" : " gridDetail__neighborNote--light"}`}>
        Hover a line or mini-map cell to isolate that neighbor. The center cell and six nearest neighbors share the same colors in both the chart and the mini-map.
      </div>
    </div>
  );
}

function buildTickIndexes(length: number): number[] {
  if (length <= 1) return [0];
  const step = Math.max(1, Math.ceil(length / 8));
  const ticks: number[] = [];
  for (let index = 0; index < length; index += step) ticks.push(index);
  if (ticks[ticks.length - 1] !== length - 1) ticks.push(length - 1);
  return ticks;
}

function buildLinearTicks(maxValue: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, index) => (maxValue * index) / count);
}

function buildBandPath(
  points: SpreadSeriesPoint[],
  xFor: (index: number) => number,
  yFor: (value: number) => number
): string {
  if (points.length === 0) return "";
  const upper = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yFor(point.max).toFixed(1)}`)
    .join(" ");
  const lower = [...points]
    .reverse()
    .map((point, reverseIndex) => {
      const index = points.length - 1 - reverseIndex;
      return `L${xFor(index).toFixed(1)} ${yFor(point.min).toFixed(1)}`;
    })
    .join(" ");
  return `${upper} ${lower} Z`;
}

function formatForecastValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 0.1) return value.toFixed(3);
  if (value >= 0.01) return value.toFixed(4);
  return value.toFixed(5);
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 10) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(1);
  return value.toFixed(0);
}

function formatObservedFlag(value: number): string {
  return isObservedActual(value) ? "present" : "not observed";
}

function toModelLabel(value: string): string {
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

function getModelColor(index: number): string {
  const palette = ["#19f0d7", "#f59e0b", "#60a5fa", "#f472b6", "#34d399", "#a78bfa", "#fb7185", "#facc15"];
  return palette[index % palette.length];
}

function getNeighborColor(ringIndex: number): string {
  const palette = ["#f97316", "#22d3ee", "#facc15", "#a78bfa", "#34d399", "#fb7185", "#60a5fa"];
  return palette[Math.max(0, Math.min(palette.length - 1, ringIndex))];
}

function minMaxScale(values: number[]): number[] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return values.map(() => 0);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;
  if (range <= Number.EPSILON) return values.map(() => 0.5);
  return values.map((value) => (Number.isFinite(value) ? (value - min) / range : 0));
}

function formatScaledValue(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function quantile(values: number[], q: number): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function computePercentile(value: number, rankedValues: number[]): number {
  if (rankedValues.length === 0) return 0;
  let count = 0;
  for (const ranked of rankedValues) {
    if (ranked <= value) count += 1;
  }
  return count / rankedValues.length;
}

function buildNeighborhoodSeed(
  cellId: string,
  grid: Awaited<ReturnType<typeof loadGrid>> | null
): Array<{ cellId: string; label: string; isSelected: boolean; ringIndex: number; polygons: number[][][][] }> {
  const cells = (grid?.features ?? [])
    .map((feature) => {
      const props = (feature.properties as Record<string, unknown> | null) ?? null;
      const featureCellId = getH3CellId(props);
      const centroid = computeFeatureCentroid(feature.geometry);
      const polygons = extractFeaturePolygons(feature.geometry);
      if (!featureCellId || !centroid || polygons.length === 0) return null;
      return { cellId: featureCellId, centroid, polygons };
    })
    .filter((entry): entry is { cellId: string; centroid: [number, number]; polygons: number[][][][] } => entry !== null);
  const selected = cells.find((entry) => entry.cellId === cellId);
  if (!selected) {
    return [{ cellId, label: "Center", isSelected: true, ringIndex: 0, polygons: [] }];
  }
  const nearest = cells
    .filter((entry) => entry.cellId !== cellId)
    .map((entry) => ({
      ...entry,
      distance: squaredDistance(selected.centroid, entry.centroid),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
  const rows = [selected, ...nearest];
  return rows.map((entry, index) => ({
    cellId: entry.cellId,
    label: index === 0 ? "Center" : `Neighbor ${index}`,
    isSelected: index === 0,
    ringIndex: index,
    polygons: entry.polygons,
  }));
}

function NeighborMiniMap({
  series,
  contextPolygons,
  activeCellId,
  darkMode,
  onActivate,
}: {
  series: NeighborhoodSeries[];
  contextPolygons: number[][][][];
  activeCellId: string | null;
  darkMode: boolean;
  onActivate: (cellId: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const bounds = useMemo(
    () => getNeighborhoodBounds(series, contextPolygons, 0.03),
    [series, contextPolygons]
  );
  const styleUrl = darkMode ? DARK_STYLE : VOYAGER_STYLE;
  const geojson = useMemo(
    () => buildNeighborhoodMiniMapGeoJson(series, contextPolygons, activeCellId),
    [series, contextPolygons, activeCellId]
  );
  const geojsonRef = useRef(geojson);
  const boundsRef = useRef(bounds);

  useEffect(() => {
    geojsonRef.current = geojson;
  }, [geojson]);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style: styleUrl,
      attributionControl: false,
      interactive: false,
      boxZoom: false,
      dragPan: false,
      dragRotate: false,
      doubleClickZoom: false,
      keyboard: false,
      scrollZoom: false,
      touchZoomRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.on("load", () => {
      applyBasemapVisualTuning(map, darkMode);
      syncNeighborhoodMiniMap(map, geojsonRef.current, boundsRef.current);
    });
    map.on("styledata", () => {
      if (!map.isStyleLoaded()) return;
      applyBasemapVisualTuning(map, darkMode);
      syncNeighborhoodMiniMap(map, geojsonRef.current, boundsRef.current);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl, darkMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncNeighborhoodMiniMap(map, geojson, bounds);
  }, [geojson, bounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = (event: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["neighbor-focus-fill"] })[0];
      const cellId = String((feature?.properties as Record<string, unknown> | undefined)?.cellId ?? "");
      if (cellId) onActivate(cellId);
    };
    const onLeave = () => onActivate(null);
    map.on("mousemove", onMove);
    map.on("mouseleave", onLeave);
    return () => {
      map.off("mousemove", onMove);
      map.off("mouseleave", onLeave);
    };
  }, [onActivate, series]);

  return <div ref={containerRef} className="gridDetail__neighborMiniMap" aria-label="Neighbor minimap" />;
}

function getNeighborhoodBounds(
  series: NeighborhoodSeries[],
  contextPolygons: number[][][][],
  expandRatio = 0
) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  contextPolygons.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(([x, y]) => {
        minX = Math.min(minX, Number(x));
        maxX = Math.max(maxX, Number(x));
        minY = Math.min(minY, Number(y));
        maxY = Math.max(maxY, Number(y));
      });
    });
  });
  series.forEach((entry) => {
    entry.polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach(([x, y]) => {
          minX = Math.min(minX, Number(x));
          maxX = Math.max(maxX, Number(x));
          minY = Math.min(minY, Number(y));
          maxY = Math.max(maxY, Number(y));
        });
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  const padX = Math.max((maxX - minX) * expandRatio, 1e-6);
  const padY = Math.max((maxY - minY) * expandRatio, 1e-6);
  return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
}

function buildNeighborhoodMiniMapGeoJson(
  series: NeighborhoodSeries[],
  contextPolygons: number[][][][],
  activeCellId: string | null
): FeatureCollection {
  const contextFeatures: Array<Feature<Polygon | MultiPolygon>> = contextPolygons.map((polygon, index) => ({
    type: "Feature",
    properties: {
      kind: "context",
      cellId: `context-${index}`,
      fill: "rgba(148, 163, 184, 0.16)",
      line: "rgba(96, 124, 164, 0.22)",
      opacity: 0.28,
      lineWidth: 1,
    },
    geometry:
      polygon.length === 1
        ? ({ type: "Polygon", coordinates: polygon } as unknown as Polygon)
        : ({ type: "MultiPolygon", coordinates: polygon } as unknown as MultiPolygon),
  }));
  const neighborFeatures: Array<Feature<Polygon | MultiPolygon>> = series.map((entry) => ({
    type: "Feature",
    properties: {
      kind: "neighbor",
      cellId: entry.cellId,
      fill: getNeighborColor(entry.ringIndex),
      line: entry.isSelected ? "#f8fafc" : "rgba(255,255,255,0.85)",
      opacity: activeCellId ? (activeCellId === entry.cellId ? 0.92 : 0.5) : 0.76,
      lineWidth: activeCellId === entry.cellId ? 3.2 : 1.8,
    },
    geometry:
      entry.polygons.length === 1
        ? ({ type: "Polygon", coordinates: entry.polygons[0] } as unknown as Polygon)
        : ({ type: "MultiPolygon", coordinates: entry.polygons } as unknown as MultiPolygon),
  }));
  return { type: "FeatureCollection", features: [...contextFeatures, ...neighborFeatures] };
}

function syncNeighborhoodMiniMap(
  map: MapLibreMap,
  data: FeatureCollection,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
) {
  const sourceId = "neighbor-mini-map";
  const fillId = "neighbor-focus-fill";
  const lineId = "neighbor-focus-line";
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(sourceId, { type: "geojson", data });
  }
  if (!map.getLayer(fillId)) {
    map.addLayer({
      id: fillId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": ["coalesce", ["get", "fill"], "rgba(0,0,0,0)"],
        "fill-opacity": ["coalesce", ["get", "opacity"], 0.5],
      },
    });
  } else {
    map.setPaintProperty(fillId, "fill-color", ["coalesce", ["get", "fill"], "rgba(0,0,0,0)"]);
    map.setPaintProperty(fillId, "fill-opacity", ["coalesce", ["get", "opacity"], 0.5]);
  }
  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": ["coalesce", ["get", "line"], "rgba(255,255,255,0.5)"],
        "line-width": ["coalesce", ["get", "lineWidth"], 1],
        "line-opacity": 0.96,
      },
    });
  } else {
    map.setPaintProperty(lineId, "line-color", ["coalesce", ["get", "line"], "rgba(255,255,255,0.5)"]);
    map.setPaintProperty(lineId, "line-width", ["coalesce", ["get", "lineWidth"], 1]);
  }
  map.fitBounds(
    [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.maxY],
    ],
    { padding: 12, duration: 0, maxZoom: 14 }
  );
}

function buildNeighborhoodContextPolygons(
  neighborhoodSeed: Array<{ cellId: string; label: string; isSelected: boolean; ringIndex: number; polygons: number[][][][] }>,
  grid: Awaited<ReturnType<typeof loadGrid>> | null
): number[][][][] {
  if (!grid || neighborhoodSeed.length === 0) return [];
  const neighborhoodIds = new Set(neighborhoodSeed.map((entry) => entry.cellId));
  const bounds = getSeedBounds(neighborhoodSeed);
  const padX = Math.max((bounds.maxX - bounds.minX) * 0.55, 1e-6);
  const padY = Math.max((bounds.maxY - bounds.minY) * 0.55, 1e-6);
  const minX = bounds.minX - padX;
  const maxX = bounds.maxX + padX;
  const minY = bounds.minY - padY;
  const maxY = bounds.maxY + padY;
  return (grid.features ?? [])
    .map((feature) => {
      const props = (feature.properties as Record<string, unknown> | null) ?? null;
      const featureCellId = getH3CellId(props);
      if (!featureCellId || neighborhoodIds.has(featureCellId)) return null;
      const centroid = computeFeatureCentroid(feature.geometry);
      const polygons = extractFeaturePolygons(feature.geometry);
      if (!centroid || polygons.length === 0) return null;
      if (centroid[0] < minX || centroid[0] > maxX || centroid[1] < minY || centroid[1] > maxY) return null;
      return polygons;
    })
    .filter((entry): entry is number[][][][] => entry !== null)
    .flat();
}

function getSeedBounds(
  neighborhoodSeed: Array<{ polygons: number[][][][] }>
) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  neighborhoodSeed.forEach((entry) => {
    entry.polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach(([x, y]) => {
          minX = Math.min(minX, Number(x));
          maxX = Math.max(maxX, Number(x));
          minY = Math.min(minY, Number(y));
          maxY = Math.max(maxY, Number(y));
        });
      });
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  return { minX, maxX, minY, maxY };
}

function extractFeaturePolygons(
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
    | { type: string }
    | null
    | undefined
): number[][][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon" && "coordinates" in geometry) {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiPolygon" && "coordinates" in geometry) {
    return geometry.coordinates;
  }
  return [];
}

function computeFeatureCentroid(
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
    | { type: string }
    | null
    | undefined
): [number, number] | null {
  if (!geometry) return null;
  const coords: number[][] = [];
  if (geometry.type === "Polygon" && "coordinates" in geometry) {
    for (const ring of geometry.coordinates) coords.push(...ring);
  } else if (geometry.type === "MultiPolygon" && "coordinates" in geometry) {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) coords.push(...ring);
    }
  } else {
    return null;
  }
  if (coords.length === 0) return null;
  const sum = coords.reduce<[number, number]>((acc, pair) => [acc[0] + Number(pair[0] ?? 0), acc[1] + Number(pair[1] ?? 0)], [0, 0]);
  return [sum[0] / coords.length, sum[1] / coords.length];
}

function squaredDistance(a: [number, number], b: [number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function isObservedActual(value: number): boolean {
  return Number.isFinite(value) && value >= 0.999;
}

function useResizeObserver<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
