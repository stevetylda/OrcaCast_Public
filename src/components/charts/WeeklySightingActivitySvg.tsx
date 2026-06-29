import { useEffect, useId, useMemo, useRef, useState } from "react";
import { area as d3Area, curveCatmullRom } from "d3-shape";

type WeeklyActivityRow = {
  decade: number;
  stat_week: number;
  active_grids: number;
};

type Props = {
  rows: WeeklyActivityRow[];
  currentWeek: number;
  darkMode: boolean;
};

/**
 * Purple → pink palette (older decades darker; recent decades brighter).
//  */
// const PALETTE: Record<number, string> = {
//   1980: "#5B2A86", // deep purple
//   1990: "#6D28D9", // violet
//   2000: "#A855F7", // purple-pink
//   2010: "#EC4899", // hot pink
//   2020: "#F9A8D4", // soft pink
// };
const PALETTE: Record<number, string> = {
  1980: "#22C55E", // green
  1990: "#06B6D4", // cyan
  2000: "#3B82F6", // blue
  2010: "#A855F7", // violet
  2020: "#F472B6", // pink
};
// const PALETTE: Record<number, string> = {
//   1980: "#60A5FA", // light blue
//   1990: "#34D399", // mint
//   2000: "#FBBF24", // amber
//   2010: "#F472B6", // pink
//   2020: "#C4B5FD", // lavender
// };


const MARKER_COLOR = "#F59E0B"; // orange-amber

// Area fill/stroke styling
const FILL_ALPHA = 0.32;
const STROKE_ALPHA = 0.6;
const STROKE_WIDTH = 2;

type Margin = { top: number; right: number; bottom: number; left: number };

type ChartState = {
  decades: number[];
  weeks: number[];
  valuesByDecade: Map<number, number[]>;
  maxY: number;
};

export function WeeklySightingActivitySvg({ rows, currentWeek, darkMode }: Props) {
  const clipId = useId();

  // NOTE: ref type is HTMLDivElement; hook is generic so this is accepted.
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useResizeObserver(wrapRef);

  const chart = useMemo(() => buildChart(rows), [rows]);
  const chartData = useMemo(
    () => ({
      decades: chart?.decades ?? [],
      weeks: chart?.weeks ?? [],
      valuesByDecade: chart?.valuesByDecade ?? new Map<number, number[]>(),
      maxY: chart?.maxY ?? 1,
    }),
    [chart]
  );
  const { decades, weeks, valuesByDecade, maxY } = chartData;

  // Responsive dimensions
  const width = Math.max(320, Math.floor(size.width || 720));
  const height = Math.max(240, Math.floor(size.height || 360));

  // Layout: legend room below plot
  const margin: Margin = { top: 18, right: 16, bottom: 78, left: 56 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);

  const maxWeek = weeks.length;

  const xScale = (week: number) => {
    const w = clampWeek(week, maxWeek);
    const t = (w - 1) / Math.max(1, maxWeek - 1);
    return margin.left + t * plotWidth;
  };

  const yScale = (value: number) => {
    const v = Math.max(0, value);
    const t = v / Math.max(1, maxY);
    return margin.top + plotHeight - t * plotHeight;
  };

  const baselineY = yScale(0);

  const axisText = darkMode ? "rgba(255,255,255,0.92)" : "rgba(12,30,58,0.90)";
  const tickText = darkMode ? "rgba(255,255,255,0.78)" : "rgba(42,62,93,0.86)";
  const gridStroke = darkMode ? "rgba(255,255,255,0.08)" : "rgba(26,58,96,0.14)";

  // Smooth area generator
  const areaGen = useMemo(() => {
    return d3Area<number>()
      .x((_: number, i: number) => xScale(weeks[i]))
      .y0(() => baselineY)
      .y1((v: number) => yScale(v))
      .curve(curveCatmullRom.alpha(0.55));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, plotWidth, plotHeight, maxY, maxWeek, weeks]);

  const decadePaths = useMemo(() => {
    return decades.map((decade) => {
      const values = valuesByDecade.get(decade) ?? weeks.map(() => 0);
      return { decade, d: areaGen(values) ?? "" };
    });
  }, [decades, valuesByDecade, weeks, areaGen]);

  // Ticks/grid
  const yTicks = buildTicks(maxY, 4);
  const xTicks = buildWeekTicks(maxWeek);

  // Current-week marker
  const clamped = clampWeek(currentWeek, maxWeek);
  const currentX = xScale(clamped);

  // Horizontal label near the top of the line
  const labelText = `Current week (W${clamped})`;
  const labelY = margin.top + 10;
  const labelOnLeft = currentX > margin.left + plotWidth - 160;
  const labelX = labelOnLeft ? currentX - 10 : currentX + 10;
  const labelAnchor: "start" | "end" = labelOnLeft ? "end" : "start";

  if (!chart) return null;

  return (
    <div
      ref={wrapRef}
      className="timeseries__svgWrap"
      aria-label="Weekly sighting activity chart"
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        role="img"
        aria-label="Weekly sighting activity (overlay area chart by decade)"
        style={{ display: "block", flex: "1 1 auto" }}
      >
        {/* no <title> => no hover tooltip */}
        <desc id={`desc-${clipId}`}>Overlay area chart by decade across weekly activity.</desc>

        <defs>
          <clipPath id={`clip-${clipId}`}>
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        {/* Y gridlines + labels */}
        {yTicks.map((t) => {
          const y = yScale(t);
          return (
            <g key={`ygrid-${t}`}>
              <line
                x1={margin.left}
                x2={margin.left + plotWidth}
                y1={y}
                y2={y}
                stroke={gridStroke}
                strokeWidth={1}
              />
              <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="12" fill={tickText}>
                {formatTick(t)}
              </text>
            </g>
          );
        })}

        {/* X-axis tick labels */}
        {xTicks.map((t) => {
          const x = xScale(t);
          return (
            <text
              key={`xtick-${t}`}
              x={x}
              y={margin.top + plotHeight + 18}
              textAnchor="middle"
              fontSize="12"
              fill={tickText}
            >
              {t}
            </text>
          );
        })}

        {/* Axis labels */}
        <text
          x={margin.left + plotWidth / 2}
          y={height - 12}
          textAnchor="middle"
          fontSize="12"
          fill={axisText}
        >
          Week of Year
        </text>

        <text
          x={16}
          y={margin.top + plotHeight / 2}
          transform={`rotate(-90 16 ${margin.top + plotHeight / 2})`}
          textAnchor="middle"
          fontSize="12"
          fill={axisText}
        >
          Total Active Grids
        </text>

        {/* Areas (clipped) */}
        <g clipPath={`url(#clip-${clipId})`}>
          {decadePaths.map(({ decade, d }) => {
            const color = PALETTE[decade] ?? "#A855F7";
            return (
              <g key={decade}>
                {/* Fill */}
                <path d={d} fill={hexToRgba(color, FILL_ALPHA)} stroke="none" />

                {/* Edge stroke (outline) */}
                <path
                  d={d}
                  fill="none"
                  stroke={hexToRgba(color, STROKE_ALPHA)}
                  strokeWidth={STROKE_WIDTH}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </g>

        {/* Current week marker line */}
        <line
          x1={currentX}
          x2={currentX}
          y1={margin.top}
          y2={margin.top + plotHeight}
          stroke={MARKER_COLOR}
          strokeWidth={2}
          strokeDasharray="4 4"
        />

        {/* Horizontal label near the top of the marker line */}
        <text
          x={labelX}
          y={labelY}
          textAnchor={labelAnchor}
          fontSize="12"
          fill={MARKER_COLOR}
          dominantBaseline="hanging"
          paintOrder="stroke"
          stroke={darkMode ? "rgba(10,15,30,0.65)" : "rgba(250,252,255,0.85)"}
          strokeWidth={3}
        >
          {labelText}
        </text>
      </svg>

      {/* Legend */}
      <div
        className="timeseries__legend"
        aria-label="Legend"
        style={{
          display: "flex",
          gap: 18,
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 10,
          paddingBottom: 6,
          fontSize: 12,
          flex: "0 0 auto",
          userSelect: "none",
        }}
      >
        {decades.map((decade) => (
          <div
            key={decade}
            className="timeseries__legendItem"
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <span
              className="timeseries__legendSwatch"
              style={{
                width: 12,
                height: 12,
                borderRadius: 4,
                background: PALETTE[decade] ?? "#A855F7",
                display: "inline-block",
              }}
            />
            <span style={{ color: axisText }}>{`${decade}s`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Build chart state: overlay values by decade; y-domain based on max per-decade (NOT stacked). */
function buildChart(rows: WeeklyActivityRow[]): ChartState | null {
  if (!rows.length) return null;

  const decades = Array.from(new Set(rows.map((r) => r.decade))).sort((a, b) => a - b);
  const maxWeek = Math.max(1, ...rows.map((r) => r.stat_week));
  const weeks = Array.from({ length: maxWeek }, (_, i) => i + 1);

  // (decade, week) -> value; sum duplicates safely
  const byDecadeWeek = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.decade}-${r.stat_week}`;
    byDecadeWeek.set(key, (byDecadeWeek.get(key) ?? 0) + (r.active_grids ?? 0));
  }

  const valuesByDecade = new Map<number, number[]>();
  let maxY = 1;

  for (const decade of decades) {
    const values = weeks.map((w) => byDecadeWeek.get(`${decade}-${w}`) ?? 0);
    valuesByDecade.set(decade, values);
    for (const v of values) maxY = Math.max(maxY, v);
  }

  return { decades, weeks, valuesByDecade, maxY };
}

/** ResizeObserver hook for responsive sizing (generic so it works with div refs, svg refs, etc.) */
function useResizeObserver<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setSize({ width: Math.floor(cr.width), height: Math.floor(cr.height) });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

/** Tick helpers */
function buildTicks(maxValue: number, approxIntervals: number) {
  const step = niceStep(maxValue / Math.max(1, approxIntervals));
  const ticks: number[] = [];
  const maxTick = Math.ceil(maxValue / step) * step;
  for (let v = 0; v <= maxTick; v += step) ticks.push(v);
  return ticks;
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;

  let niceFrac = 1;
  if (frac < 1.5) niceFrac = 1;
  else if (frac < 3) niceFrac = 2;
  else if (frac < 7) niceFrac = 5;
  else niceFrac = 10;

  return niceFrac * pow;
}

/** Avoid "5253" collision: if 53 exists, omit 52. */
function buildWeekTicks(maxWeek: number) {
  if (maxWeek >= 53) return [1, 13, 26, 39, 53];
  return [1, 13, 26, 39, 52].filter((t) => t <= maxWeek);
}

function formatTick(value: number) {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  if (value >= 100) return `${Math.round(value)}`;
  return value.toFixed(0);
}

function clampWeek(week: number, maxWeek: number) {
  if (!Number.isFinite(week)) return 1;
  return Math.min(Math.max(1, Math.round(week)), maxWeek);
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
