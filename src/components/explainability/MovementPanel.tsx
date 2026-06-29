import { useEffect, useMemo, useRef, useState } from "react";
import type { H3Resolution } from "../../config/dataPaths";
import {
  loadActualActivitySeries,
  loadExpectedCountSeries,
  type ActualActivityPoint,
  type ExpectedCountPoint,
} from "../../data/expectedCount";

type Props = {
  resolution: string;
};

type ResidualMode = "raw" | "percent" | "standardized";

type MovementPoint = {
  key: string;
  label: string;
  expected: number | null;
  actual: number | null;
};

const EMPTY_EXPECTED_ROWS: ExpectedCountPoint[] = [];
const EMPTY_ACTUAL_ROWS: ActualActivityPoint[] = [];

const RESIDUAL_EPSILON = 0.5;

const RESIDUAL_MODE_OPTIONS: Array<{ key: ResidualMode; label: string; hint: string }> = [
  { key: "raw", label: "Raw", hint: "obs - exp" },
  { key: "percent", label: "Percent", hint: "(obs - exp) / (exp + epsilon)" },
  { key: "standardized", label: "Standardized", hint: "(obs - exp) / sqrt(exp + epsilon)" },
];

function computeResidual(actual: number, expected: number, mode: ResidualMode): number {
  const exp = Math.max(0, expected);
  const delta = actual - exp;
  if (mode === "raw") return delta;
  if (mode === "percent") return delta / (exp + RESIDUAL_EPSILON);
  return delta / Math.sqrt(exp + RESIDUAL_EPSILON);
}

function toResolution(value: string): H3Resolution {
  if (value === "H4" || value === "H5" || value === "H6") return value;
  return "H4";
}

function weekKey(year: number, statWeek: number): string {
  return `${year}-${String(statWeek).padStart(2, "0")}`;
}

function weekLabel(year: number, statWeek: number): string {
  return `${year}-W${String(statWeek).padStart(2, "0")}`;
}

function buildLinePath(
  points: MovementPoint[],
  xScale: (index: number) => number,
  yScale: (value: number) => number,
  select: (point: MovementPoint, index: number) => number | null
): string {
  let path = "";
  let activeSegment = false;

  points.forEach((point, idx) => {
    const value = select(point, idx);
    if (value === null || !Number.isFinite(value)) {
      activeSegment = false;
      return;
    }
    const command = activeSegment ? "L" : "M";
    path += `${command}${xScale(idx)},${yScale(value)} `;
    activeSegment = true;
  });

  return path.trim();
}

export function MovementPanel({ resolution }: Props) {
  const resolvedResolution = toResolution(resolution);
  const [seriesState, setSeriesState] = useState<{
    resolution: H3Resolution;
    expectedRows: ExpectedCountPoint[];
    actualRows: ActualActivityPoint[];
    loading: boolean;
    error: string | null;
  }>({
    resolution: resolvedResolution,
    expectedRows: [],
    actualRows: [],
    loading: true,
    error: null,
  });
  const [viewportState, setViewportState] = useState<{
    key: string;
    value: { start: number; end: number } | null;
  }>({ key: "", value: null });
  const [brushState, setBrushState] = useState<{
    key: string;
    value: { startX: number; currentX: number } | null;
  }>({ key: "", value: null });
  const [hoverIndexState, setHoverIndexState] = useState<{
    key: string;
    value: number | null;
  }>({ key: "", value: null });
  const [residualMode, setResidualMode] = useState<ResidualMode>("raw");
  const brushRef = useRef<{ startX: number; currentX: number } | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      loadExpectedCountSeries(resolvedResolution),
      loadActualActivitySeries(resolvedResolution),
    ])
      .then(([expected, actual]) => {
        if (!active) return;
        setSeriesState({
          resolution: resolvedResolution,
          expectedRows: expected,
          actualRows: actual,
          loading: false,
          error: null,
        });
      })
      .catch(() => {
        if (!active) return;
        setSeriesState({
          resolution: resolvedResolution,
          expectedRows: [],
          actualRows: [],
          loading: false,
          error: "Could not load active-grid time-series data.",
        });
      });

    return () => {
      active = false;
    };
  }, [resolvedResolution]);

  const loading = seriesState.resolution !== resolvedResolution || seriesState.loading;
  const error = seriesState.resolution !== resolvedResolution ? null : seriesState.error;
  const expectedRows =
    seriesState.resolution !== resolvedResolution ? EMPTY_EXPECTED_ROWS : seriesState.expectedRows;
  const actualRows =
    seriesState.resolution !== resolvedResolution ? EMPTY_ACTUAL_ROWS : seriesState.actualRows;

  const points = useMemo(() => {
    const expectedKeys: Array<{ key: string; year: number; statWeek: number }> = [];
    const expectedByKey = new Map<string, number>();
    const actualByKey = new Map<string, number>();

    expectedRows.forEach((row) => {
      const key = weekKey(row.year, row.stat_week);
      expectedKeys.push({ key, year: row.year, statWeek: row.stat_week });
      expectedByKey.set(key, row.expected_count);
    });

    actualRows.forEach((row) => {
      const key = weekKey(row.year, row.stat_week);
      actualByKey.set(key, row.actual_count);
    });

    return expectedKeys
      .sort((a, b) => (a.year - b.year) || (a.statWeek - b.statWeek))
      .map(({ key, year, statWeek }) => ({
        key,
        label: weekLabel(year, statWeek),
        expected: expectedByKey.get(key) ?? null,
        actual: actualByKey.get(key) ?? null,
      }));
  }, [actualRows, expectedRows]);

  const interactionKey = `${resolvedResolution}:${points.length}`;
  useEffect(() => {
    brushRef.current = null;
  }, [interactionKey]);
  const viewport = viewportState.key === interactionKey ? viewportState.value : null;
  const brush = brushState.key === interactionKey ? brushState.value : null;
  const hoverIndex = hoverIndexState.key === interactionKey ? hoverIndexState.value : null;

  const setViewport = (value: { start: number; end: number } | null) => {
    setViewportState({ key: interactionKey, value });
  };

  const setBrush = (value: { startX: number; currentX: number } | null) => {
    setBrushState({ key: interactionKey, value });
  };

  const setHoverIndex = (value: number | null) => {
    setHoverIndexState({ key: interactionKey, value });
  };

  const visibleRange = useMemo(() => {
    if (!viewport || points.length === 0) return { start: 0, end: Math.max(0, points.length - 1) };
    return {
      start: Math.max(0, Math.min(viewport.start, points.length - 1)),
      end: Math.max(0, Math.min(viewport.end, points.length - 1)),
    };
  }, [points.length, viewport]);

  const visiblePoints = useMemo(
    () => points.slice(visibleRange.start, visibleRange.end + 1),
    [points, visibleRange.end, visibleRange.start]
  );

  const { width, height, margin, yTicks, xTickIndices, expectedPath, actualPath, yMax } = useMemo(() => {
    const widthValue = 960;
    const heightValue = 360;
    const marginValue = { top: 18, right: 24, bottom: 70, left: 60 };
    const plotWidth = widthValue - marginValue.left - marginValue.right;
    const plotHeight = heightValue - marginValue.top - marginValue.bottom;
    const maxIndex = Math.max(1, visiblePoints.length - 1);

    const numericValues = visiblePoints.flatMap((point) => {
      const values: number[] = [];
      if (point.expected !== null) values.push(point.expected);
      if (point.actual !== null) values.push(point.actual);
      return values;
    });
    const maxValue = Math.max(1, ...numericValues);

    const xScale = (index: number) => marginValue.left + (index / maxIndex) * plotWidth;
    const yScale = (value: number) =>
      marginValue.top + plotHeight - (Math.max(0, value) / maxValue) * plotHeight;

    const expectedLine = buildLinePath(visiblePoints, xScale, yScale, (point) => point.expected);
    const actualLine = buildLinePath(visiblePoints, xScale, yScale, (point) => point.actual);

    const yTickValues = Array.from({ length: 5 }, (_, idx) => (maxValue * idx) / 4);
    const step = Math.max(1, Math.ceil(visiblePoints.length / 8));
    const indices = visiblePoints
      .map((_, idx) => idx)
      .filter((idx) => idx % step === 0 || idx === visiblePoints.length - 1);

    return {
      width: widthValue,
      height: heightValue,
      margin: marginValue,
      yTicks: yTickValues,
      xTickIndices: indices,
      expectedPath: expectedLine,
      actualPath: actualLine,
      yMax: maxValue,
    };
  }, [visiblePoints]);

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xScale = (index: number) => margin.left + (index / Math.max(1, visiblePoints.length - 1)) * plotWidth;
  const yScale = (value: number) => margin.top + plotHeight - (Math.max(0, value) / Math.max(1, yMax)) * plotHeight;
  const isZoomed = points.length > 0 && (visibleRange.start !== 0 || visibleRange.end !== points.length - 1);

  const residuals = useMemo(
    () =>
      visiblePoints.map((point) => ({
        label: point.label,
        residual: (() => {
          if (point.actual === null || point.expected === null) return null;
          return computeResidual(point.actual, point.expected, residualMode);
        })(),
      })),
    [visiblePoints, residualMode]
  );

  const residualMaxAbs = useMemo(() => {
    const values = residuals
      .map((row) => row.residual)
      .filter((value): value is number => value !== null && Number.isFinite(value))
      .map((value) => Math.abs(value));
    return Math.max(1, ...values);
  }, [residuals]);

  const residualYScale = (value: number) =>
    margin.top + plotHeight - ((value + residualMaxAbs) / (2 * residualMaxAbs)) * plotHeight;

  const residualTicks = useMemo(
    () => [-residualMaxAbs, -residualMaxAbs / 2, 0, residualMaxAbs / 2, residualMaxAbs],
    [residualMaxAbs]
  );

  const residualAxisLabel =
    residualMode === "raw"
      ? "Residual (obs - exp)"
      : residualMode === "percent"
        ? "Percent residual ((obs - exp) / (exp + epsilon))"
        : "Standardized residual ((obs - exp) / sqrt(exp + epsilon))";

  const formatResidualValue = (value: number) => {
    if (residualMode === "percent") return `${(value * 100).toFixed(1)}%`;
    return value.toFixed(2);
  };

  const formatResidualTick = (value: number) => {
    if (residualMode === "percent") return `${(value * 100).toFixed(0)}%`;
    return value.toFixed(1);
  };

  const toSvgX = (clientX: number, svgRect: DOMRect) => {
    const px = clientX - svgRect.left;
    const ratio = svgRect.width > 0 ? px / svgRect.width : 0;
    return ratio * width;
  };

  const toLocalIndex = (svgX: number) => {
    const x = Math.max(margin.left, Math.min(margin.left + plotWidth, svgX));
    const t = (x - margin.left) / Math.max(1, plotWidth);
    return Math.round(t * Math.max(1, visiblePoints.length - 1));
  };

  const hoveredPoint = hoverIndex !== null ? visiblePoints[hoverIndex] : null;
  const hoveredX = hoverIndex !== null ? xScale(hoverIndex) : null;
  const hoveredExpectedY =
    hoverIndex !== null && hoveredPoint !== null && hoveredPoint.expected !== null ? yScale(hoveredPoint.expected) : null;
  const hoveredActualY =
    hoverIndex !== null && hoveredPoint !== null && hoveredPoint.actual !== null ? yScale(hoveredPoint.actual) : null;
  const hoveredResidual =
    hoverIndex !== null && residuals[hoverIndex] ? residuals[hoverIndex].residual : null;

  return (
    <section className="pageSection explainabilityPanel explainabilityPanel--activeGrids">
      <div className="explainabilityPanel__head">
        <h3>Active Grids</h3>
        <p className="pageNote activeGridsNote">Drag across the chart to zoom into a date/statweek range.</p>
        {isZoomed && (
          <div className="activeGridsActions">
            <button type="button" className="btn btn--ghost activeGridsResetBtn" onClick={() => setViewport(null)}>
              Reset zoom
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="explainabilityEmptyState">
          <p className="pageNote">Loading active-grid time series...</p>
        </div>
      )}

      {!loading && error && (
        <div className="explainabilityEmptyState">
          <p className="pageNote">{error}</p>
        </div>
      )}

      {!loading && !error && points.length === 0 && (
        <div className="explainabilityEmptyState">
          <p className="pageNote">No active-grid time-series rows are available for this resolution.</p>
        </div>
      )}

      {!loading && !error && visiblePoints.length > 0 && (
        <>
          <section className="activeGridsChartCard">
            <div className="activeGridsChartCard__head">
              <h4>Active H3 Cells</h4>
              <div className="activeGridsLegendRow" aria-label="Series legend">
                <span className="activeGridsLegendChip">
                  <i className="activeGridsLegendSwatch activeGridsLegendSwatch--expected" />
                  Expected
                </span>
                <span className="activeGridsLegendChip">
                  <i className="activeGridsLegendSwatch activeGridsLegendSwatch--actual" />
                  Actual
                </span>
              </div>
            </div>
            <div className="explainabilityPlotWrap">
            <svg
              className="explainabilityPlot activeGridsPlot"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="Active grids comparison chart"
              onMouseDown={(event) => {
                if (event.button !== 0 || visiblePoints.length < 2) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                const x = Math.max(margin.left, Math.min(margin.left + plotWidth, toSvgX(event.clientX, rect)));
                const nextBrush = { startX: x, currentX: x };
                brushRef.current = nextBrush;
                setBrush(nextBrush);
                setHoverIndex(null);
              }}
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = Math.max(margin.left, Math.min(margin.left + plotWidth, toSvgX(event.clientX, rect)));
                if (brushRef.current && (event.buttons & 1) === 1) {
                  const nextBrush = { ...brushRef.current, currentX: x };
                  brushRef.current = nextBrush;
                  setBrush(nextBrush);
                  return;
                }
                const idx = toLocalIndex(x);
                setHoverIndex(idx);
              }}
              onMouseUp={(event) => {
                const activeBrush = brushRef.current;
                if (!activeBrush || visiblePoints.length < 2) {
                  brushRef.current = null;
                  setBrush(null);
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                const localA = toLocalIndex(activeBrush.startX);
                const localB = toLocalIndex(toSvgX(event.clientX, rect));
                const minLocal = Math.min(localA, localB);
                const maxLocal = Math.max(localA, localB);
                if (maxLocal - minLocal >= 1) {
                  setViewport({
                    start: visibleRange.start + minLocal,
                    end: visibleRange.start + maxLocal,
                  });
                }
                brushRef.current = null;
                setBrush(null);
              }}
              onMouseLeave={() => {
                brushRef.current = null;
                setBrush(null);
                setHoverIndex(null);
              }}
              style={{ cursor: brush ? "col-resize" : "crosshair" }}
            >
            <line
              x1={margin.left}
              y1={margin.top + plotHeight}
              x2={margin.left + plotWidth}
              y2={margin.top + plotHeight}
              className="explainabilityPlot__axis"
            />
            <line
              x1={margin.left}
              y1={margin.top}
              x2={margin.left}
              y2={margin.top + plotHeight}
              className="explainabilityPlot__axis"
            />

            {yTicks.map((tick) => {
              const y = yScale(tick);
              return (
                <g key={`y-${tick}`}>
                  <line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} className="explainabilityPlot__rowLine" />
                  <text x={margin.left - 8} y={y + 4} textAnchor="end" className="explainabilityPlot__tickLabel">
                    {Math.round(tick)}
                  </text>
                </g>
              );
            })}

            {xTickIndices.map((idx) => (
              <text key={`x-${idx}`} x={xScale(idx)} y={margin.top + plotHeight + 18} textAnchor="middle" className="explainabilityPlot__tickLabel">
                {visiblePoints[idx]?.label}
              </text>
            ))}

            <path d={expectedPath} fill="none" className="activeGridsLine activeGridsLine--expected" />
            <path d={actualPath} fill="none" className="activeGridsLine activeGridsLine--actual" />

            {hoveredX !== null && (
              <line
                x1={hoveredX}
                y1={margin.top}
                x2={hoveredX}
                y2={margin.top + plotHeight}
                className="activeGridsHoverLine"
              />
            )}

            {hoveredX !== null && hoveredExpectedY !== null && (
              <circle cx={hoveredX} cy={hoveredExpectedY} r={4.6} className="activeGridsDot activeGridsDot--expected" />
            )}

            {hoveredX !== null && hoveredActualY !== null && (
              <circle cx={hoveredX} cy={hoveredActualY} r={4.6} className="activeGridsDot activeGridsDot--actual" />
            )}

            <text x={width / 2} y={height - 12} textAnchor="middle" className="explainabilityPlot__axisLabel">
              Year-Statweek
            </text>
            <text
              x={16}
              y={margin.top + plotHeight / 2}
              transform={`rotate(-90 16 ${margin.top + plotHeight / 2})`}
              textAnchor="middle"
              className="explainabilityPlot__axisLabel"
            >
              Cells (count)
            </text>

            {hoveredPoint && hoveredX !== null && (
              <g>
                <rect
                  x={hoveredX > width - 240 ? hoveredX - 196 : hoveredX + 12}
                  y={margin.top + 8}
                  width={184}
                  height={84}
                  rx={8}
                  className="activeGridsTooltip"
                />
                <text
                  x={hoveredX > width - 240 ? hoveredX - 186 : hoveredX + 22}
                  y={margin.top + 26}
                  className="explainabilityPlot__legendLabel activeGridsTooltipText activeGridsTooltipText--week"
                >
                  {hoveredPoint.label}
                </text>
                <text
                  x={hoveredX > width - 240 ? hoveredX - 186 : hoveredX + 22}
                  y={margin.top + 42}
                  className="explainabilityPlot__legendLabel activeGridsTooltipText activeGridsTooltipText--expected"
                >
                  {`Expected (E[cells]): ${hoveredPoint.expected === null ? "n/a" : hoveredPoint.expected.toFixed(2)}`}
                </text>
                <text
                  x={hoveredX > width - 240 ? hoveredX - 186 : hoveredX + 22}
                  y={margin.top + 58}
                  className="explainabilityPlot__legendLabel activeGridsTooltipText activeGridsTooltipText--actual"
                >
                  {`Observed (cells): ${hoveredPoint.actual === null ? "n/a" : hoveredPoint.actual.toFixed(2)}`}
                </text>
                <text
                  x={hoveredX > width - 240 ? hoveredX - 186 : hoveredX + 22}
                  y={margin.top + 74}
                  className="explainabilityPlot__legendLabel activeGridsTooltipText"
                >
                  {`Delta (obs - exp): ${
                    hoveredPoint.expected === null || hoveredPoint.actual === null
                      ? "n/a"
                      : (hoveredPoint.actual - hoveredPoint.expected).toFixed(2)
                  }`}
                </text>
              </g>
            )}

            {brush && (
              <rect
                x={Math.min(brush.startX, brush.currentX)}
                y={margin.top}
                width={Math.max(1, Math.abs(brush.currentX - brush.startX))}
                height={plotHeight}
                className="activeGridsBrush"
              />
            )}
            </svg>
          </div>
          </section>

          <section className="activeGridsChartCard activeGridsChartCard--residual">
            <div className="activeGridsChartCard__head">
              <h4>Residuals</h4>
              <div className="activeGridsLegendRow" aria-label="Residual legend">
                <span className="activeGridsLegendChip">
                  <i className="activeGridsLegendSwatch activeGridsLegendSwatch--resPos" />
                  Above expected
                </span>
                <span className="activeGridsLegendChip">
                  <i className="activeGridsLegendSwatch activeGridsLegendSwatch--resNeg" />
                  Below expected
                </span>
              </div>
            </div>
            <div className="explainabilityPlotWrap">
            <svg
              className="explainabilityPlot activeGridsPlot"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="Active grids residuals chart"
              onMouseMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = Math.max(margin.left, Math.min(margin.left + plotWidth, toSvgX(event.clientX, rect)));
                const idx = toLocalIndex(x);
                setHoverIndex(idx);
              }}
              onMouseLeave={() => {
                setHoverIndex(null);
              }}
              style={{ cursor: "crosshair" }}
            >
              <line
                x1={margin.left}
                y1={margin.top + plotHeight}
                x2={margin.left + plotWidth}
                y2={margin.top + plotHeight}
                className="explainabilityPlot__axis"
              />
              <line
                x1={margin.left}
                y1={margin.top}
                x2={margin.left}
                y2={margin.top + plotHeight}
                className="explainabilityPlot__axis"
              />
              <line
                x1={margin.left}
                y1={residualYScale(0)}
                x2={margin.left + plotWidth}
                y2={residualYScale(0)}
                className="activeGridsResidualZero"
              />

              {residualTicks.map((tick) => {
                const y = residualYScale(tick);
                return (
                  <g key={`res-y-${tick}`}>
                    <line x1={margin.left} y1={y} x2={margin.left + plotWidth} y2={y} className="explainabilityPlot__rowLine" />
                    <text x={margin.left - 8} y={y + 4} textAnchor="end" className="explainabilityPlot__tickLabel">
                      {formatResidualTick(tick)}
                    </text>
                  </g>
                );
              })}

              {xTickIndices.map((idx) => (
                <text key={`res-x-${idx}`} x={xScale(idx)} y={margin.top + plotHeight + 18} textAnchor="middle" className="explainabilityPlot__tickLabel">
                  {visiblePoints[idx]?.label}
                </text>
              ))}

              {hoveredX !== null && (
                <line
                  x1={hoveredX}
                  y1={margin.top}
                  x2={hoveredX}
                  y2={margin.top + plotHeight}
                  className="activeGridsHoverLine"
                />
              )}

              {residuals.map((row, idx) => {
                if (row.residual === null) return null;
                const xCenter = xScale(idx);
                const barWidth = Math.max(3, Math.min(20, (plotWidth / Math.max(1, visiblePoints.length)) * 0.7));
                const yZero = residualYScale(0);
                const yValue = residualYScale(row.residual);
                const y = Math.min(yZero, yValue);
                const h = Math.max(1, Math.abs(yValue - yZero));
                const active = hoverIndex === idx;
                const className = row.residual >= 0
                  ? `activeGridsResidualBar activeGridsResidualBar--pos${active ? " isActive" : ""}`
                  : `activeGridsResidualBar activeGridsResidualBar--neg${active ? " isActive" : ""}`;
                return <rect key={`res-bar-${idx}`} x={xCenter - barWidth / 2} y={y} width={barWidth} height={h} className={className} />;
              })}

              <text x={width / 2} y={height - 12} textAnchor="middle" className="explainabilityPlot__axisLabel">
                Year-Statweek
              </text>
              <text
                x={16}
                y={margin.top + plotHeight / 2}
                transform={`rotate(-90 16 ${margin.top + plotHeight / 2})`}
                textAnchor="middle"
                className="explainabilityPlot__axisLabel"
              >
                {residualAxisLabel}
              </text>
              {hoveredPoint && hoveredX !== null && hoveredResidual !== null && (
                <g>
                  <rect
                    x={hoveredX > width - 248 ? hoveredX - 204 : hoveredX + 12}
                    y={margin.top + 8}
                    width={192}
                    height={84}
                    rx={8}
                    className="activeGridsTooltip"
                  />
                  <text
                    x={hoveredX > width - 248 ? hoveredX - 194 : hoveredX + 22}
                    y={margin.top + 26}
                    className="explainabilityPlot__legendLabel activeGridsTooltipText activeGridsTooltipText--week"
                  >
                    {hoveredPoint.label}
                  </text>
                  <text
                    x={hoveredX > width - 248 ? hoveredX - 194 : hoveredX + 22}
                    y={margin.top + 42}
                    className={`explainabilityPlot__legendLabel activeGridsTooltipText ${
                      hoveredResidual >= 0 ? "activeGridsTooltipText--resPos" : "activeGridsTooltipText--resNeg"
                    }`}
                  >
                    {`${
                      residualMode === "raw"
                        ? "Delta (obs - exp)"
                        : residualMode === "percent"
                          ? "Percent residual"
                          : "Standardized residual"
                    }: ${formatResidualValue(hoveredResidual)}`}
                  </text>
                  <text
                    x={hoveredX > width - 248 ? hoveredX - 194 : hoveredX + 22}
                    y={margin.top + 58}
                    className="explainabilityPlot__legendLabel activeGridsTooltipText activeGridsTooltipText--expected"
                  >
                    {`Expected (E[cells]): ${hoveredPoint.expected === null ? "n/a" : hoveredPoint.expected.toFixed(2)}`}
                  </text>
                  <text
                    x={hoveredX > width - 248 ? hoveredX - 194 : hoveredX + 22}
                    y={margin.top + 74}
                    className="explainabilityPlot__legendLabel activeGridsTooltipText activeGridsTooltipText--actual"
                  >
                    {`Observed (cells): ${hoveredPoint.actual === null ? "n/a" : hoveredPoint.actual.toFixed(2)}`}
                  </text>
                </g>
              )}
            </svg>
            </div>
            <div className="activeGridsResidualControls" aria-label="Residual mode controls">
              <div className="lineageViewToggle activeGridsResidualModeToggle" role="tablist" aria-label="Residual mode">
                {RESIDUAL_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="tab"
                    aria-selected={residualMode === option.key}
                    className={residualMode === option.key ? "lineageViewToggle__option isActive" : "lineageViewToggle__option"}
                    onClick={() => setResidualMode(option.key)}
                    title={option.hint}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
