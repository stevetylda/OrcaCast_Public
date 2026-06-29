import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CompareRow,
  GlobalImportanceRow,
  InteractionSampleRow,
  ShapSampleRow,
} from "../../features/explainability/types";

export type DependenceRow = {
  sample_id: string;
  time: string;
  x: number;
  y: number;
  color: number | null;
};

type TrendPoint = {
  x: number;
  median: number;
  q25: number;
  q75: number;
};

type SummaryProps = {
  samples: ShapSampleRow[];
  ranking: GlobalImportanceRow[];
  topN: number;
  featureLabelByName: Map<string, string>;
  featureTypeByName?: Map<string, string>;
  impactAxisLabel?: string;
  renderMode?: "dense" | "crisp";
  onRenderModeChange?: (mode: "dense" | "crisp") => void;
  selectedFeature?: string | null;
  onFeatureSelect?: (featureName: string) => void;
};

const SHAP_SUMMARY_LAYOUT = {
  width: 1120,
  rowHeight: 36,
  margin: {
    top: 46,
    right: 42,
    bottom: 88,
    left: 240,
  },
  innerPadding: {
    x: 18,
  },
  legend: {
    inset: 14,
    narrowBreakpoint: 900,
  },
} as const;

function colorFromGradient(value: number, min: number, max: number): string {
  if (!Number.isFinite(value)) return "rgba(139, 152, 173, 0.75)";
  const t = max <= min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  // Vivid cyan -> neon violet gradient.
  const low = { r: 0, g: 224, b: 255 };
  const high = { r: 196, g: 78, b: 255 };
  const r = Math.round(low.r + t * (high.r - low.r));
  const g = Math.round(low.g + t * (high.g - low.g));
  const b = Math.round(low.b + t * (high.b - low.b));
  return `rgba(${r}, ${g}, ${b}, 0.95)`;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1) return value.toFixed(1);
  return value.toFixed(2).replace(/\.00$/, "");
}

function stableAxisMax(maxAbs: number): number {
  const ladder = [0.4, 0.8, 1.2, 1.6, 2.4, 3.2, 4.8, 6.4];
  for (const step of ladder) {
    if (maxAbs <= step) return step;
  }
  return Math.ceil(maxAbs);
}

function normalizeFeatureType(value?: string): string {
  if (!value) return "Other";
  const normalized = value.toLowerCase();
  if (normalized.includes("temporal") || normalized.includes("lag")) return "Lag";
  if (normalized.includes("spatial") || normalized.includes("distance")) return "Static";
  if (normalized.includes("environment") || normalized.includes("climate")) return "Baseline";
  if (normalized.includes("human")) return "Human";
  if (normalized.includes("prey")) return "Prey";
  return value;
}

function estimateLabelPad(topFeatures: string[], featureLabelByName: Map<string, string>): number {
  const maxChars = topFeatures.reduce((currentMax, featureName) => {
    const label = featureLabelByName.get(featureName) ?? featureName;
    return Math.max(currentMax, label.length);
  }, 0);
  return Math.max(SHAP_SUMMARY_LAYOUT.margin.left, Math.min(460, Math.round(maxChars * 7.2) + 24));
}

type LegendPillProps = {
  position: "bottom-right" | "top-right";
};

function LegendPill({ position }: LegendPillProps) {
  return (
    <div className={`explainabilityLegendPill explainabilityLegendPill--${position}`} aria-hidden="true">
      <div className="explainabilityLegendPill__title">Feature value</div>
      <div className="explainabilityLegendPill__scale">
        <span className="explainabilityLegendPill__label">Low</span>
        <span className="explainabilityLegendPill__barWrap">
          <span className="explainabilityLegendPill__bar" />
        </span>
        <span className="explainabilityLegendPill__label">High</span>
      </div>
    </div>
  );
}

export function ShapSummaryPlot({
  samples,
  ranking,
  topN,
  featureLabelByName,
  featureTypeByName,
  impactAxisLabel = "Impact (logit)",
  renderMode = "dense",
  onRenderModeChange,
  selectedFeature,
  onFeatureSelect,
}: SummaryProps) {
  const plotWrapRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(SHAP_SUMMARY_LAYOUT.width);
  const topFeatures = ranking.slice(0, topN).map((row) => row.feature_name);

  const data = useMemo(() => {
    const filtered = samples.filter((row) => topFeatures.includes(row.feature_name));
    const byFeature = new Map<string, ShapSampleRow[]>();
    for (const row of filtered) {
      const list = byFeature.get(row.feature_name) ?? [];
      list.push(row);
      byFeature.set(row.feature_name, list);
    }
    const maxAbs = Math.max(...filtered.map((row) => Math.abs(row.shap_value)), 1e-6);
    return { byFeature, maxAbs };
  }, [samples, topFeatures]);

  useEffect(() => {
    const node = plotWrapRef.current;
    if (!node) return;
    const update = () => setContainerWidth(node.clientWidth || SHAP_SUMMARY_LAYOUT.width);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  if (topFeatures.length === 0 || samples.length === 0) {
    return <p className="pageNote">No SHAP samples available for this selection.</p>;
  }

  const rowHeight = SHAP_SUMMARY_LAYOUT.rowHeight;
  const leftPad = estimateLabelPad(topFeatures, featureLabelByName);
  const topPad = SHAP_SUMMARY_LAYOUT.margin.top;
  const bottomPad = SHAP_SUMMARY_LAYOUT.margin.bottom;
  const rightPad = SHAP_SUMMARY_LAYOUT.margin.right;
  const width = SHAP_SUMMARY_LAYOUT.width;
  const height = topPad + topFeatures.length * rowHeight + bottomPad;
  const axisMax = stableAxisMax(data.maxAbs);
  const plotLeft = leftPad + SHAP_SUMMARY_LAYOUT.innerPadding.x;
  const plotRight = width - rightPad - SHAP_SUMMARY_LAYOUT.innerPadding.x;
  const plotWidth = plotRight - plotLeft;
  const modeToggleX = width - rightPad - 52;
  const ticks = [-1, -0.5, 0, 0.5, 1].map((factor) => factor * axisMax);
  const axisY = height - bottomPad + 8;
  const narrowLayout = containerWidth < SHAP_SUMMARY_LAYOUT.legend.narrowBreakpoint;
  const legendPosition = narrowLayout ? "bottom-right" : "top-right";
  const modeToggleY = narrowLayout ? topPad - 34 : height - 42;

  return (
    <div ref={plotWrapRef} className="explainabilityPlotWrap explainabilityPlotWrap--summary">
      <svg className="explainabilityPlot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Global SHAP summary beeswarm">
        <defs>
          <linearGradient id="violinGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00E0FF" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#C44EFF" stopOpacity="0.96" />
          </linearGradient>
        </defs>

        {ticks.map((tick) => {
          const x = plotLeft + ((tick + axisMax) / (2 * axisMax)) * plotWidth;
          return (
            <g key={tick}>
              <line x1={x} y1={topPad - 2} x2={x} y2={axisY} className="explainabilityPlot__tickLine" />
              <text x={x} y={axisY + 18} textAnchor="middle" className="explainabilityPlot__tickLabel">
                {formatTick(tick)}
              </text>
            </g>
          );
        })}

        <line
          x1={plotLeft + plotWidth / 2}
          y1={topPad - 12}
          x2={plotLeft + plotWidth / 2}
          y2={axisY}
          className="explainabilityPlot__zero"
        />
        <text x={plotLeft + plotWidth / 2 - 16} y={topPad - 16} textAnchor="end" className="explainabilityPlot__zeroLabel">
          ↓ lowers prediction
        </text>
        <text x={plotLeft + plotWidth / 2 + 16} y={topPad - 16} textAnchor="start" className="explainabilityPlot__zeroLabel">
          ↑ raises prediction
        </text>

        {topFeatures.map((feature, featureIdx) => {
          const fullLabel = featureLabelByName.get(feature) ?? feature;
          const featureType = normalizeFeatureType(featureTypeByName?.get(feature));
          const rows = data.byFeature.get(feature) ?? [];
          const rowTop = topPad + featureIdx * rowHeight;
          const centerY = rowTop + rowHeight / 2;
          const values = rows
            .map((row) => (row.feature_value == null ? Number.NaN : Number(row.feature_value)))
            .filter(Number.isFinite);
          const valueMin = values.length > 0 ? Math.min(...values) : -1;
          const valueMax = values.length > 0 ? Math.max(...values) : 1;
          return (
            <g key={feature} className={selectedFeature === feature ? "explainabilityPlot__row isActive" : "explainabilityPlot__row"}>
              <rect
                x={plotLeft}
                y={rowTop + 1}
                width={plotWidth}
                height={rowHeight - 2}
                className={selectedFeature === feature ? "explainabilityPlot__rowHighlight isActive" : "explainabilityPlot__rowHighlight"}
                onClick={() => onFeatureSelect?.(feature)}
              />
              <line x1={plotLeft} y1={centerY} x2={plotRight} y2={centerY} className="explainabilityPlot__rowLine" />
              <text
                x={leftPad - 10}
                y={centerY + 4}
                textAnchor="end"
                className={selectedFeature === feature ? "explainabilityPlot__feature isActive" : "explainabilityPlot__feature"}
                onClick={() => onFeatureSelect?.(feature)}
              >
                {fullLabel}
                <title>{`${fullLabel}\nType: ${featureType}`}</title>
              </text>
              {renderMode === "crisp" && (() => {
                const bins = 52;
                const counts = new Array<number>(bins).fill(0);
                for (const row of rows) {
                  const bounded = Math.max(-axisMax, Math.min(axisMax, row.shap_value));
                  const t = (bounded + axisMax) / (2 * axisMax);
                  const idx = Math.max(0, Math.min(bins - 1, Math.floor(t * bins)));
                  counts[idx] += 1;
                }
                const smoothed = counts.map((_, idx) => {
                  const c0 = counts[Math.max(0, idx - 2)] ?? 0;
                  const c1 = counts[Math.max(0, idx - 1)] ?? 0;
                  const c2 = counts[idx] ?? 0;
                  const c3 = counts[Math.min(bins - 1, idx + 1)] ?? 0;
                  const c4 = counts[Math.min(bins - 1, idx + 2)] ?? 0;
                  return (c0 + 2 * c1 + 3 * c2 + 2 * c3 + c4) / 9;
                });
                const maxCount = Math.max(...smoothed, 1);
                const topPoints: string[] = [];
                const bottomPoints: string[] = [];
                for (let idx = 0; idx < bins; idx += 1) {
                  const x = plotLeft + ((idx + 0.5) / bins) * plotWidth;
                  const widthScale = (smoothed[idx] / maxCount) * (rowHeight * 0.46);
                  topPoints.push(`${x},${centerY - widthScale}`);
                  bottomPoints.push(`${x},${centerY + widthScale}`);
                }
                const points = [...topPoints, ...bottomPoints.reverse()].join(" ");
                return <polygon points={points} className="explainabilityPlot__violin" />;
              })()}
              {renderMode === "dense" &&
                rows.map((row, dotIdx) => {
                  const bounded = Math.max(-axisMax, Math.min(axisMax, row.shap_value));
                  const x = plotLeft + ((bounded + axisMax) / (2 * axisMax)) * plotWidth;
                  const jitter = ((Math.sin(dotIdx * 12.9898 + featureIdx * 31.127) * 43758.5453) % 1) * 16 - 8;
                  const y = centerY + jitter;
                  const fill =
                    row.feature_value == null
                      ? "rgba(152, 165, 189, 0.72)"
                      : colorFromGradient(Number(row.feature_value), valueMin, valueMax);
                  return (
                    <circle
                      key={`${row.sample_id}-${feature}-${dotIdx}`}
                      cx={x}
                      cy={y}
                      r={2.2}
                      fill={fill}
                      className={selectedFeature === feature ? "explainabilityPlot__dot isFeatureActive" : "explainabilityPlot__dot"}
                    >
                      <title>{`${fullLabel}\nType: ${featureType}\nSHAP: ${row.shap_value.toFixed(4)}\nFeature value: ${
                        row.feature_value == null ? "n/a" : Number(row.feature_value).toFixed(4)
                      }\nTime: ${row.time}`}</title>
                    </circle>
                  );
                })}
            </g>
          );
        })}

        <line x1={plotLeft} y1={axisY} x2={plotRight} y2={axisY} className="explainabilityPlot__axis" />
        <text x={plotLeft + plotWidth / 2} y={axisY + 32} textAnchor="middle" className="explainabilityPlot__axisLabel">
          {impactAxisLabel}
        </text>
        {onRenderModeChange && (
          <g transform={`translate(${modeToggleX}, ${modeToggleY})`}>
            <rect x={0} y={0} width={44} height={16} rx={8} className="explainabilityPlot__modeRail" />
            <g
              transform="translate(2,2)"
              className={renderMode === "dense" ? "explainabilityPlot__modeBtn isActive" : "explainabilityPlot__modeBtn"}
              onClick={() => onRenderModeChange("dense")}
            >
              <rect x={0} y={0} width={20} height={12} rx={6} />
              <circle cx={6} cy={6} r={1.1} />
              <circle cx={10} cy={5} r={1.1} />
              <circle cx={13} cy={7} r={1.1} />
              <circle cx={16} cy={4.8} r={1.1} />
            </g>
            <g
              transform="translate(22,2)"
              className={renderMode === "crisp" ? "explainabilityPlot__modeBtn isActive" : "explainabilityPlot__modeBtn"}
              onClick={() => onRenderModeChange("crisp")}
            >
              <rect x={0} y={0} width={20} height={12} rx={6} />
              <path d="M3.5 6 C6 3.4, 9.6 3.4, 12.2 6 C9.6 8.6, 6 8.6, 3.5 6 Z" />
              <line x1={12.2} y1={6} x2={16.5} y2={6} />
            </g>
          </g>
        )}
      </svg>
      <LegendPill position={legendPosition} />
    </div>
  );
}

type DependencePlotProps = {
  rows: DependenceRow[];
  xLabel: string;
  colorLabel: string;
  showTrend?: boolean;
  showBand?: boolean;
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function buildTrend(rows: DependenceRow[]): TrendPoint[] {
  if (rows.length < 20) return [];
  const sortedRows = [...rows].sort((a, b) => a.x - b.x);
  const n = sortedRows.length;
  const bins = Math.max(12, Math.min(36, Math.round(Math.sqrt(n))));
  const binSize = Math.max(8, Math.floor(n / bins));
  const trend: TrendPoint[] = [];
  for (let start = 0; start < n; start += binSize) {
    const chunk = sortedRows.slice(start, Math.min(n, start + binSize));
    if (chunk.length < 6) continue;
    const xs = chunk.map((row) => row.x).sort((a, b) => a - b);
    const ys = chunk.map((row) => row.y).sort((a, b) => a - b);
    trend.push({
      x: quantile(xs, 0.5),
      median: quantile(ys, 0.5),
      q25: quantile(ys, 0.25),
      q75: quantile(ys, 0.75),
    });
  }
  return trend;
}

export function FeatureDependencePlot({
  rows,
  xLabel,
  colorLabel,
  showTrend = true,
  showBand = true,
}: DependencePlotProps) {
  if (rows.length === 0) {
    return <p className="pageNote">No dependence samples available for this feature.</p>;
  }

  const width = 980;
  const height = 380;
  const leftPad = 58;
  const rightPad = 20;
  const topPad = 16;
  const bottomPad = 42;
  const plotWidth = width - leftPad - rightPad;
  const plotHeight = height - topPad - bottomPad;

  const xMin = Math.min(...rows.map((row) => row.x));
  const xMax = Math.max(...rows.map((row) => row.x));
  const yMin = Math.min(...rows.map((row) => row.y));
  const yMax = Math.max(...rows.map((row) => row.y));
  const colorValues = rows.map((row) => row.color).filter((value): value is number => Number.isFinite(value as number));
  const cMin = colorValues.length > 0 ? Math.min(...colorValues) : -1;
  const cMax = colorValues.length > 0 ? Math.max(...colorValues) : 1;

  const toX = (value: number) => leftPad + ((value - xMin) / Math.max(xMax - xMin, 1e-9)) * plotWidth;
  const toY = (value: number) => topPad + (1 - (value - yMin) / Math.max(yMax - yMin, 1e-9)) * plotHeight;
  const trend = buildTrend(rows);
  const trendPath =
    trend.length > 1
      ? trend
          .map((point, idx) => `${idx === 0 ? "M" : "L"} ${toX(point.x)} ${toY(point.median)}`)
          .join(" ")
      : "";
  const ribbonPoints =
    trend.length > 2
      ? [
          ...trend.map((point) => `${toX(point.x)},${toY(point.q75)}`),
          ...[...trend].reverse().map((point) => `${toX(point.x)},${toY(point.q25)}`),
        ].join(" ")
      : "";

  return (
    <div className="explainabilityPlotWrap">
      <svg className="explainabilityPlot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Feature dependence plot">
        <line x1={leftPad} y1={height - bottomPad} x2={width - rightPad} y2={height - bottomPad} className="explainabilityPlot__axis" />
        <line x1={leftPad} y1={topPad} x2={leftPad} y2={height - bottomPad} className="explainabilityPlot__axis" />
        {showBand && ribbonPoints && <polygon points={ribbonPoints} className="explainabilityPlot__trendBand" />}
        {rows.map((row, idx) => (
          <circle
            key={`${row.sample_id}-${idx}`}
            cx={toX(row.x)}
            cy={toY(row.y)}
            r={2.3}
            fill={row.color == null ? "rgba(152, 165, 189, 0.7)" : colorFromGradient(row.color, cMin, cMax)}
            opacity={0.86}
          />
        ))}
        {showTrend && trendPath && <path d={trendPath} className="explainabilityPlot__trendLine" />}
        <text x={width / 2} y={height - 10} textAnchor="middle" className="explainabilityPlot__axisLabel">
          {xLabel}
        </text>
        <text x={12} y={height / 2} textAnchor="middle" className="explainabilityPlot__axisLabel" transform={`rotate(-90 12 ${height / 2})`}>
          SHAP impact
        </text>
        <text x={width - 12} y={topPad + 12} textAnchor="end" className="explainabilityPlot__legendLabel">
          Color by: {colorLabel}
        </text>
      </svg>
    </div>
  );
}

type InteractionPlotProps = {
  rows: InteractionSampleRow[];
  mode: "effect" | "interaction";
};

export function InteractionScatterPlot({ rows, mode }: InteractionPlotProps) {
  if (rows.length === 0) {
    return <p className="pageNote">No interaction samples for this pair.</p>;
  }

  const width = 980;
  const height = 420;
  const leftPad = 56;
  const rightPad = 26;
  const topPad = 18;
  const bottomPad = 34;
  const plotWidth = width - leftPad - rightPad;
  const plotHeight = height - topPad - bottomPad;

  const xMin = Math.min(...rows.map((row) => row.value_a));
  const xMax = Math.max(...rows.map((row) => row.value_a));
  const yValues = mode === "interaction" ? rows.map((row) => row.interaction_value ?? 0) : rows.map((row) => row.shap_a);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const cMin = Math.min(...rows.map((row) => row.value_b));
  const cMax = Math.max(...rows.map((row) => row.value_b));

  const toX = (value: number) => leftPad + ((value - xMin) / Math.max(xMax - xMin, 1e-9)) * plotWidth;
  const toY = (value: number) => topPad + (1 - (value - yMin) / Math.max(yMax - yMin, 1e-9)) * plotHeight;

  return (
    <div className="explainabilityPlotWrap">
      <svg className="explainabilityPlot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Interaction dependence plot">
        <line x1={leftPad} y1={height - bottomPad} x2={width - rightPad} y2={height - bottomPad} className="explainabilityPlot__axis" />
        <line x1={leftPad} y1={topPad} x2={leftPad} y2={height - bottomPad} className="explainabilityPlot__axis" />
        {rows.map((row, idx) => (
          <circle
            key={`${row.time}-${idx}`}
            cx={toX(row.value_a)}
            cy={toY(mode === "interaction" ? row.interaction_value ?? 0 : row.shap_a)}
            r={2.8}
            fill={colorFromGradient(row.value_b, cMin, cMax)}
          >
            <title>{`${row.feature_a}: ${row.value_a.toFixed(3)}\n${
              mode === "interaction" ? "Interaction" : "SHAP(A)"
            }: ${(mode === "interaction" ? row.interaction_value ?? 0 : row.shap_a).toFixed(4)}\n${row.feature_b}: ${row.value_b.toFixed(3)}`}</title>
          </circle>
        ))}
        <text x={width / 2} y={height - 8} textAnchor="middle" className="explainabilityPlot__axisLabel">
          {rows[0]?.feature_a ?? "Feature A"} value
        </text>
        <text x={12} y={height / 2} textAnchor="middle" className="explainabilityPlot__axisLabel" transform={`rotate(-90 12 ${height / 2})`}>
          {mode === "interaction" ? "Interaction value" : "SHAP(A)"}
        </text>
      </svg>
    </div>
  );
}

type DeltaProps = {
  rows: CompareRow[];
};

export function DeltaBarChart({ rows }: DeltaProps) {
  if (rows.length === 0) {
    return <p className="pageNote">No overlapping SHAP samples for the selected windows.</p>;
  }

  const visible = rows.slice(0, 18);
  const maxAbs = Math.max(...visible.map((row) => Math.abs(row.delta)), 1e-9);
  const width = 920;
  const rowHeight = 30;
  const leftPad = 230;
  const rightPad = 24;
  const topPad = 16;
  const height = topPad + visible.length * rowHeight + 20;
  const plotWidth = width - leftPad - rightPad;

  return (
    <div className="explainabilityPlotWrap">
      <svg className="explainabilityPlot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Delta mean absolute SHAP by feature">
        <line
          x1={leftPad + plotWidth / 2}
          y1={topPad - 8}
          x2={leftPad + plotWidth / 2}
          y2={height - 8}
          className="explainabilityPlot__zero"
        />
        {visible.map((row, idx) => {
          const centerY = topPad + idx * rowHeight + rowHeight / 2;
          const px = (Math.abs(row.delta) / maxAbs) * (plotWidth / 2);
          const x = row.delta >= 0 ? leftPad + plotWidth / 2 : leftPad + plotWidth / 2 - px;
          return (
            <g key={row.feature_name}>
              <text x={leftPad - 8} y={centerY + 4} textAnchor="end" className="explainabilityPlot__feature">
                {row.feature_name}
              </text>
              <rect
                x={x}
                y={centerY - 8}
                width={px}
                height={16}
                rx={4}
                className={row.delta >= 0 ? "explainabilityPlot__barPos" : "explainabilityPlot__barNeg"}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
