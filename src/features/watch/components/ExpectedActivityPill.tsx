import { useEffect, useMemo, useRef, useState } from "react";

type Trend = "up" | "down" | "steady" | "none";

type Props = {
  currentCount: number | null;
  vsPriorWeek: number | null;
  vs12WeekAvg: number | null;
  trend: Trend;
  chart: {
    actualValues: Array<number | null>;
    forecastValues: Array<number | null>;
    forecastValue: number | null;
    predictionIndex: number;
  };
};

type Point = { x: number; y: number; value: number; index: number };

function formatCount(value: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return "--";
  return Math.round(value as number).toLocaleString();
}

function formatVs12WeekAvg(current: number | null, vs12WeekAvg: number | null): string {
  if (!Number.isFinite(current ?? NaN) || !Number.isFinite(vs12WeekAvg ?? NaN)) {
    return "12w avg: -- · Δ: --";
  }
  const avg = Math.round(vs12WeekAvg as number);
  const delta = Math.round((current as number) - (vs12WeekAvg as number));
  return `12w avg: ${avg.toLocaleString()} · Δ: ${delta > 0 ? "+" : ""}${delta.toLocaleString()}`;
}

function formatVsPriorWeek(current: number | null, vsPriorWeek: number | null): string {
  if (!Number.isFinite(current ?? NaN) || !Number.isFinite(vsPriorWeek ?? NaN)) {
    return "vs prior week: --";
  }
  const delta = Math.round((current as number) - (vsPriorWeek as number));
  return `vs prior week: ${delta > 0 ? "+" : ""}${delta.toLocaleString()}`;
}

function trendIcon(trend: Trend): string {
  if (trend === "up") return "arrow_upward";
  if (trend === "down") return "arrow_downward";
  if (trend === "steady") return "trending_flat";
  return "remove";
}

function buildLinePath(points: Point[]) {
  return points
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
}

function computeSeriesModel(
  actualValues: Array<number | null>,
  forecastValues: Array<number | null>
) {
  const width = 238;
  const height = 96;
  const padLeft = 32;
  const padRight = 10;
  const padTop = 8;
  const padBottom = 14;
  const chartWidth = width - padLeft - padRight;
  const chartHeight = height - padTop - padBottom;
  const values = [...actualValues, ...forecastValues].filter((v): v is number => Number.isFinite(v ?? NaN));
  const pointCount = Math.max(actualValues.length, forecastValues.length);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = Math.max(1, maxV - minV);

  const pointFor = (value: number, idx: number): Point => {
    const x = padLeft + (pointCount <= 1 ? 0 : (idx / (pointCount - 1)) * chartWidth);
    const y = padTop + ((maxV - value) / range) * chartHeight;
    return { x, y, value, index: idx };
  };

  const actualPoints = actualValues
    .map((value, idx) => (Number.isFinite(value ?? NaN) ? pointFor(value as number, idx) : null))
    .filter((point): point is Point => point !== null);
  const forecastPoints = forecastValues
    .map((value, idx) => (Number.isFinite(value ?? NaN) ? pointFor(value as number, idx) : null))
    .filter((point): point is Point => point !== null);

  return {
    width,
    height,
    padLeft,
    padTop,
    chartHeight,
    minV,
    maxV,
    midV: Math.round((minV + maxV) / 2),
    actualPoints,
    forecastPoints,
  };
}

export function ExpectedActivityPill({
  currentCount,
  vsPriorWeek,
  vs12WeekAvg,
  trend,
  chart,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const disabled = currentCount === null;

  const trendClass = useMemo(() => {
    if (trend === "up") return "expectedPill__trend expectedPill__trend--up";
    if (trend === "down") return "expectedPill__trend expectedPill__trend--down";
    if (trend === "steady") return "expectedPill__trend expectedPill__trend--steady";
    return "expectedPill__trend expectedPill__trend--none";
  }, [trend]);

  const chartModel = useMemo(() => {
    const usableValues = [...chart.actualValues, ...chart.forecastValues].filter((v) => Number.isFinite(v ?? NaN));
    if (usableValues.length < 2) return null;
    const model = computeSeriesModel(chart.actualValues, chart.forecastValues);
    const actualLinePath = buildLinePath(model.actualPoints);
    const predictionPoint =
      model.forecastPoints.find((point) => point.index === chart.predictionIndex) ?? null;
    return {
      ...model,
      actualLinePath,
      actualCount: model.actualPoints.length,
      predictionPoint,
    };
  }, [chart.actualValues, chart.forecastValues, chart.predictionIndex]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="expectedPillWrap">
      <button
        type="button"
        className={`expectedPill${disabled ? " expectedPill--disabled" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Expected activity details"
      >
        <span className="expectedPill__label">Expected Active</span>
        <span className="expectedPill__dot" aria-hidden="true">·</span>
        <span className="expectedPill__count">{formatCount(currentCount)}</span>
        <span className={trendClass} aria-hidden="true">
          <span className="material-symbols-rounded">{trendIcon(trend)}</span>
        </span>
      </button>

      {open && (
        <div className="expectedPopover" role="dialog" aria-label="Expected activity trend">
          <div className="expectedPopover__title">Expected Active Hexes</div>
          <div className="expectedPopover__desc">
            Predicted active hexes for the selected forecast week, compared with recent actual active hexes.
          </div>
          <div className="expectedPopover__summaryGrid">
            <div className="expectedPopover__summaryItem">
              <span className="expectedPopover__summaryLabel">Prediction</span>
              <span className="expectedPopover__value">{formatCount(currentCount)}</span>
            </div>
            <div className="expectedPopover__summaryItem">
              <span className="expectedPopover__summaryLabel">Prior actual week</span>
              <span className="expectedPopover__value expectedPopover__value--secondary">{formatCount(vsPriorWeek)}</span>
            </div>
          </div>
          <div className="expectedPopover__delta">{formatVsPriorWeek(currentCount, vsPriorWeek)}</div>
          <div className="expectedPopover__delta expectedPopover__delta--secondary">
            {formatVs12WeekAvg(currentCount, vs12WeekAvg)}
          </div>
          {chartModel ? (
            <div className="expectedPopover__spark">
              <svg
                className="expectedPopover__sparkSvg"
                viewBox={`0 0 ${chartModel.width} ${chartModel.height}`}
                role="img"
                aria-label="Recent forecast and actual active hex history"
              >
                <line
                  x1={chartModel.padLeft}
                  y1={8}
                  x2={chartModel.padLeft}
                  y2={chartModel.height - 14}
                  className="expectedPopover__axis"
                />
                <text x={2} y={14} className="expectedPopover__axisLabel">
                  {Math.round(chartModel.maxV)}
                </text>
                <text x={2} y={chartModel.padTop + chartModel.chartHeight / 2 + 4} className="expectedPopover__axisLabel">
                  {chartModel.midV}
                </text>
                <text x={2} y={chartModel.height - 8} className="expectedPopover__axisLabel">
                  {Math.round(chartModel.minV)}
                </text>

                <path d={chartModel.actualLinePath} className="expectedPopover__line expectedPopover__line--actual" />
                {chartModel.actualPoints.map((p, idx) => (
                  <circle
                    key={`actual-${p.x}-${idx}`}
                    cx={p.x}
                    cy={p.y}
                    r={2.7}
                    className="expectedPopover__dot"
                  />
                ))}
                {chartModel.predictionPoint && (
                  <circle
                    cx={chartModel.predictionPoint.x}
                    cy={chartModel.predictionPoint.y}
                    r={7.2}
                    className="expectedPopover__dotGlow"
                  />
                )}
                {chartModel.predictionPoint && (
                  <circle
                    cx={chartModel.predictionPoint.x}
                    cy={chartModel.predictionPoint.y}
                    r={3.8}
                    className="expectedPopover__dot expectedPopover__dot--prediction"
                  />
                )}

              </svg>
              <div className="expectedPopover__sparkMeta">
                <span className="expectedPopover__sparkCaption">Past 12 weeks incl. selected week + prediction</span>
                <span className="expectedPopover__legend">
                  <span className="expectedPopover__legendItem">
                    <span className="expectedPopover__legendSwatch expectedPopover__legendSwatch--actual" />
                    Actuals
                  </span>
                  <span className="expectedPopover__legendItem">
                    <span className="expectedPopover__legendSwatch expectedPopover__legendSwatch--prediction" />
                    Prediction
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <div className="expectedPopover__empty">Not enough history to render trend.</div>
          )}
        </div>
      )}
    </div>
  );
}
