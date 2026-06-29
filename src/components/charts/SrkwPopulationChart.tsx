import { useEffect, useId, useRef, useState } from "react";
import { line as d3Line, curveMonotoneX } from "d3-shape";
import {
  loadSrkwPopulationCounts,
  type SrkwPopulationPodKey,
  type SrkwPopulationRow,
} from "../../data/srkwPopulation";

type ViewMode = "calendar" | "line";
type PodConfig = { key: SrkwPopulationPodKey; label: string; color: string };
type Margin = { top: number; right: number; bottom: number; left: number };

const PODS: PodConfig[] = [
  { key: "j_pod", label: "J Pod", color: "#2dd4bf" },
  { key: "k_pod", label: "K Pod", color: "#60a5fa" },
  { key: "l_pod", label: "L Pod", color: "#f59e0b" },
];

export function SrkwPopulationChart() {
  const [rows, setRows] = useState<SrkwPopulationRow[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadSrkwPopulationCounts()
      .then((loadedRows) => {
        if (!active) return;
        setRows(loadedRows.sort((a, b) => a.census_year - b.census_year));
      })
      .catch((err) => {
        if (!active) return;
        console.warn("[DataPage] failed to load SRKW population counts", err);
        setRows([]);
        setError(err instanceof Error ? err.message : "Population counts unavailable");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="srkwPopulation">
      <div className="srkwPopulation__header">
        <div>
          <h2>SRKW Pod Population</h2>
          <p className="dataSubtle">Annual pod counts by census year.</p>
        </div>
        <div className="lineageViewToggle srkwPopulation__toggle" role="tablist" aria-label="Population view mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "calendar"}
            aria-label="Calendar plot"
            title="Calendar plot"
            className={viewMode === "calendar" ? "lineageViewToggle__option isActive" : "lineageViewToggle__option"}
            onClick={() => setViewMode("calendar")}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              table_chart
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "line"}
            aria-label="Line plot"
            title="Line plot"
            className={viewMode === "line" ? "lineageViewToggle__option isActive" : "lineageViewToggle__option"}
            onClick={() => setViewMode("line")}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              show_chart
            </span>
          </button>
        </div>
      </div>

      <div className="srkwPopulation__plot">
        {!isLoading && !error && rows.length > 0 && (
          viewMode === "calendar" ? <SrkwPopulationCalendar rows={rows} /> : <SrkwPopulationLine rows={rows} />
        )}
        {(isLoading || error || rows.length === 0) && (
          <div className="srkwPopulation__status">
            {isLoading && "Loading population counts..."}
            {!isLoading && error && "Population counts unavailable"}
            {!isLoading && !error && rows.length === 0 && "No population rows available"}
          </div>
        )}
      </div>
    </div>
  );
}

function SrkwPopulationCalendar({ rows }: { rows: SrkwPopulationRow[] }) {
  const years = rows.map((row) => row.census_year);
  const values = PODS.flatMap((pod) => rows.map((row) => row[pod.key]));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  return (
    <div className="srkwPopulationCalendar" role="img" aria-label="SRKW pod population calendar plot">
      <div className="srkwPopulationCalendar__podLabels" aria-hidden="true">
        {PODS.map((pod) => (
          <div key={pod.key} className="srkwPopulationCalendar__podLabel">
            {pod.label}
          </div>
        ))}
      </div>
      <div
        className="srkwPopulationCalendar__grid"
        style={{ gridTemplateColumns: `repeat(${years.length}, minmax(18px, 1fr))` }}
      >
        {PODS.map((pod) =>
          rows.map((row) => {
            const value = row[pod.key];
            return (
              <div
                key={`${pod.key}-${row.census_year}`}
                className="srkwPopulationCalendar__cell"
                style={{ backgroundColor: colorForValue(pod.color, value, minValue, maxValue) }}
                title={`${pod.label} ${row.census_year}: ${value}`}
                aria-label={`${pod.label} ${row.census_year}: ${value}`}
              >
                <span>{value}</span>
              </div>
            );
          })
        )}
        {years.map((year) => (
          <div key={`year-${year}`} className="srkwPopulationCalendar__year">
            {year}
          </div>
        ))}
      </div>
    </div>
  );
}

function SrkwPopulationLine({ rows }: { rows: SrkwPopulationRow[] }) {
  const clipId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useResizeObserver(wrapRef);
  const width = Math.max(360, Math.floor(size.width || 960));
  const height = Math.max(280, Math.floor(size.height || 360));
  const margin: Margin = { top: 32, right: 34, bottom: 48, left: 58 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const minYear = rows[0]?.census_year ?? 1973;
  const maxYear = rows[rows.length - 1]?.census_year ?? minYear + 1;
  const maxValue = Math.max(1, ...PODS.flatMap((pod) => rows.map((row) => row[pod.key])));
  const yMax = Math.max(1, Math.ceil(maxValue * 1.08));
  const xScale = (year: number) => margin.left + ((year - minYear) / Math.max(1, maxYear - minYear)) * plotWidth;
  const yScale = (value: number) => margin.top + plotHeight - (Math.max(0, value) / yMax) * plotHeight;
  const yTicks = buildTicks(yMax, 4);
  const xTicks = buildYearTicks(rows, 7);

  return (
    <div ref={wrapRef} className="srkwPopulationLine">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" role="img">
        <title>SRKW pod population line plot</title>
        <defs>
          <clipPath id={`clip-${clipId}`}>
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line x1={margin.left} x2={margin.left + plotWidth} y1={y} y2={y} className="srkwPopulation__gridLine" />
              <text x={margin.left - 10} y={y + 4} textAnchor="end" className="srkwPopulation__tick">
                {tick}
              </text>
            </g>
          );
        })}
        {xTicks.map((row) => (
          <text key={row.census_year} x={xScale(row.census_year)} y={height - 16} textAnchor="middle" className="srkwPopulation__tick">
            {row.census_year}
          </text>
        ))}
        <g clipPath={`url(#clip-${clipId})`}>
          {PODS.map((pod) => {
            const path =
              d3Line<SrkwPopulationRow>()
                .x((row) => xScale(row.census_year))
                .y((row) => yScale(row[pod.key]))
                .curve(curveMonotoneX)(rows) ?? "";
            return (
              <path
                key={pod.key}
                d={path}
                fill="none"
                stroke={pod.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </g>
        <g className="srkwPopulationLine__legend">
          {PODS.map((pod, index) => (
            <g key={pod.key} transform={`translate(${margin.left + index * 78} 18)`}>
              <rect width={10} height={10} rx={2} fill={pod.color} />
              <text x={16} y={9} className="srkwPopulation__legendText">
                {pod.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

function useResizeObserver<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ width: Math.floor(cr.width), height: Math.floor(cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

function colorForValue(baseHex: string, value: number, minValue: number, maxValue: number) {
  const t = (value - minValue) / Math.max(1, maxValue - minValue);
  const alpha = 0.18 + t * 0.72;
  const { r, g, b } = hexToRgb(baseHex);
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function buildTicks(maxValue: number, approxIntervals: number) {
  const step = niceStep(maxValue / Math.max(1, approxIntervals));
  const ticks: number[] = [];
  const maxTick = Math.ceil(maxValue / step) * step;
  for (let value = 0; value <= maxTick; value += step) ticks.push(value);
  return ticks;
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  if (frac < 1.5) return pow;
  if (frac < 3) return 2 * pow;
  if (frac < 7) return 5 * pow;
  return 10 * pow;
}

function buildYearTicks(rows: SrkwPopulationRow[], targetCount: number) {
  if (rows.length <= targetCount) return rows;
  const step = Math.max(1, Math.floor((rows.length - 1) / (targetCount - 1)));
  const ticks = rows.filter((_, index) => index % step === 0);
  const last = rows[rows.length - 1];
  if (ticks[ticks.length - 1] !== last) ticks.push(last);
  return ticks.slice(0, targetCount - 1).concat(last);
}
