import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { line as d3Line, curveMonotoneX } from "d3-shape";
import {
  loadSightingsActivitySummary,
  type SightingsActivityMetric,
  type SightingsActivityRow,
} from "../../data/sightingsActivity";

type ChartPoint = {
  date: Date;
  dateLabel: string;
  value: number;
};

type TimeDomain = {
  min: number;
  max: number;
};

type DragRange = {
  startX: number;
  currentX: number;
};

type HoverPoint = ChartPoint & {
  x: number;
  y: number;
};

const METRIC_OPTIONS: Array<{ value: SightingsActivityMetric; label: string; axis: string }> = [
  { value: "count_sightings", label: "Sightings", axis: "Sightings" },
  { value: "count_active_h6_grids", label: "H6 grids", axis: "Active H6 grids" },
  { value: "count_active_h5_grids", label: "H5 grids", axis: "Active H5 grids" },
  { value: "count_active_h4_grids", label: "H4 grids", axis: "Active H4 grids" },
];

type Margin = { top: number; right: number; bottom: number; left: number };

export function SightingsActivitySummaryChart() {
  const [rows, setRows] = useState<SightingsActivityRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<SightingsActivityMetric>("count_sightings");
  const [zoomDomain, setZoomDomain] = useState<TimeDomain | null>(null);

  useEffect(() => {
    let active = true;
    loadSightingsActivitySummary()
      .then((loadedRows) => {
        if (!active) return;
        setRows(loadedRows);
      })
      .catch((err) => {
        if (!active) return;
        console.warn("[DataPage] failed to load sightings activity summary", err);
        setRows([]);
        setError(err instanceof Error ? err.message : "Activity summary unavailable");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const metricLabel = METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? "Sightings";
  const points = useMemo(
    () =>
      rows
        .filter((row) => row.ecotype.toLowerCase() === "srkw")
        .map((row) => {
          const date = parseActivityDate(row.date);
          return {
            date,
            dateLabel: row.date,
            value: row[metric],
          };
        })
        .filter((point) => Number.isFinite(point.date.getTime()))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [rows, metric]
  );

  return (
    <div className="sightingsActivity">
      <div className="sightingsActivity__header">
        <div>
          <h2>SRKW Sightings Activity</h2>
          <p className="dataSubtle">
            Weekly reported sighting and active grid counts from the activity summary.
          </p>
        </div>
      </div>

      <div className="sightingsActivity__plot">
        <div className="sightingsActivity__controls" aria-label="Sightings activity filters">
          <label className="sightingsActivity__field">
            <span>Count</span>
            <select
              value={metric}
              onChange={(event) => {
                setMetric(event.target.value as SightingsActivityMetric);
                setZoomDomain(null);
              }}
            >
              {METRIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="sightingsActivity__reset"
            onClick={() => setZoomDomain(null)}
            disabled={!zoomDomain}
          >
            Reset
          </button>
        </div>
        {!isLoading && !error && points.length > 0 && (
          <SightingsActivitySvg
            points={points}
            metric={metric}
            metricLabel={metricLabel}
            zoomDomain={zoomDomain}
            onZoomDomainChange={setZoomDomain}
          />
        )}
        {(isLoading || error || points.length === 0) && (
          <div className="sightingsActivity__status">
            {isLoading && "Loading activity summary..."}
            {!isLoading && error && "Activity summary unavailable"}
            {!isLoading && !error && points.length === 0 && "No activity rows for this selection"}
          </div>
        )}
      </div>
    </div>
  );
}

function SightingsActivitySvg({
  points,
  metric,
  metricLabel,
  zoomDomain,
  onZoomDomainChange,
}: {
  points: ChartPoint[];
  metric: SightingsActivityMetric;
  metricLabel: string;
  zoomDomain: TimeDomain | null;
  onZoomDomainChange: (domain: TimeDomain | null) => void;
}) {
  const clipId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragRange, setDragRange] = useState<DragRange | null>(null);
  const [hoverPoint, setHoverPoint] = useState<HoverPoint | null>(null);
  const size = useResizeObserver(wrapRef);
  const width = Math.max(360, Math.floor(size.width || 960));
  const height = Math.max(280, Math.floor(size.height || 380));
  const margin: Margin = { top: 72, right: 28, bottom: 48, left: 64 };
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const plotHeight = Math.max(1, height - margin.top - margin.bottom);
  const fullMinTime = points[0]?.date.getTime() ?? 0;
  const fullMaxTime = points[points.length - 1]?.date.getTime() ?? fullMinTime + 1;
  const minTime = zoomDomain?.min ?? fullMinTime;
  const maxTime = zoomDomain?.max ?? fullMaxTime;
  const visiblePoints = points.filter((point) => {
    const time = point.date.getTime();
    return time >= minTime && time <= maxTime;
  });
  const chartPoints = visiblePoints.length > 0 ? visiblePoints : points;
  const maxValue = Math.max(1, ...chartPoints.map((point) => point.value));
  const yMax = Math.max(1, Math.ceil(maxValue * 1.08));
  const stroke = metric === "count_sightings" ? "#2dd4bf" : "#60a5fa";
  const fill = metric === "count_sightings" ? "rgba(45, 212, 191, 0.12)" : "rgba(96, 165, 250, 0.12)";

  const xScale = (time: number) => {
    const t = (time - minTime) / Math.max(1, maxTime - minTime);
    return margin.left + t * plotWidth;
  };
  const yScale = (value: number) => {
    const t = Math.max(0, value) / yMax;
    return margin.top + plotHeight - t * plotHeight;
  };
  const clampX = (x: number) => Math.min(margin.left + plotWidth, Math.max(margin.left, x));
  const xToTime = (x: number) => {
    const t = (clampX(x) - margin.left) / plotWidth;
    return minTime + t * Math.max(1, maxTime - minTime);
  };
  const eventToSvgX = (event: ReactPointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return margin.left;
    return ((event.clientX - rect.left) / rect.width) * width;
  };
  const handlePointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = clampX(eventToSvgX(event));
    setDragRange({ startX: x, currentX: x });
  };
  const handlePointerMove = (event: ReactPointerEvent<SVGRectElement>) => {
    const x = clampX(eventToSvgX(event));
    if (dragRange) {
      setDragRange({ ...dragRange, currentX: x });
      return;
    }
    setHoverPoint(findNearestPoint(chartPoints, xToTime(x), xScale, yScale));
  };
  const handlePointerUp = (event: ReactPointerEvent<SVGRectElement>) => {
    if (!dragRange) return;
    const currentX = clampX(eventToSvgX(event));
    const startX = dragRange.startX;
    setDragRange(null);
    if (Math.abs(currentX - startX) < 8) return;
    const min = Math.min(xToTime(startX), xToTime(currentX));
    const max = Math.max(xToTime(startX), xToTime(currentX));
    if (max - min < 1000 * 60 * 60 * 24 * 7) return;
    onZoomDomainChange({ min, max });
  };
  const tooltipWidth = 136;
  const tooltipHeight = 52;
  const tooltipX = hoverPoint
    ? Math.min(width - tooltipWidth - 10, Math.max(margin.left + 8, hoverPoint.x + 12))
    : 0;
  const tooltipY = hoverPoint
    ? Math.min(margin.top + plotHeight - tooltipHeight - 8, Math.max(margin.top + 8, hoverPoint.y - 62))
    : 0;

  const path =
    d3Line<ChartPoint>()
      .x((point) => xScale(point.date.getTime()))
      .y((point) => yScale(point.value))
      .curve(curveMonotoneX)(chartPoints) ?? "";

  const areaPath = path ? `${path} L ${xScale(maxTime)} ${yScale(0)} L ${xScale(minTime)} ${yScale(0)} Z` : "";
  const yTicks = buildTicks(yMax, 4);
  const xTicks = buildDateTicks(chartPoints, 5);
  const lastPoint = chartPoints[chartPoints.length - 1];
  const selectionX = dragRange ? Math.min(dragRange.startX, dragRange.currentX) : 0;
  const selectionWidth = dragRange ? Math.abs(dragRange.currentX - dragRange.startX) : 0;

  return (
    <div ref={wrapRef} className="sightingsActivity__svgWrap">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" role="img">
        <title>{`${metricLabel} by week`}</title>
        <desc id={`desc-${clipId}`}>Line chart of weekly sighting activity over time.</desc>
        <defs>
          <clipPath id={`clip-${clipId}`}>
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line x1={margin.left} x2={margin.left + plotWidth} y1={y} y2={y} className="sightingsActivity__gridLine" />
              <text x={margin.left - 10} y={y + 4} textAnchor="end" className="sightingsActivity__tick">
                {formatTick(tick)}
              </text>
            </g>
          );
        })}
        {xTicks.map((point) => {
          const x = xScale(point.date.getTime());
          return (
            <text key={point.dateLabel} x={x} y={height - 16} textAnchor="middle" className="sightingsActivity__tick">
              {formatDateTick(point.date)}
            </text>
          );
        })}
        <text x={16} y={margin.top + plotHeight / 2} transform={`rotate(-90 16 ${margin.top + plotHeight / 2})`} textAnchor="middle" className="sightingsActivity__axisLabel">
          {metricLabel}
        </text>
        <g clipPath={`url(#clip-${clipId})`}>
          <path d={areaPath} fill={fill} />
          <path d={path} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {lastPoint && (
            <circle cx={xScale(lastPoint.date.getTime())} cy={yScale(lastPoint.value)} r={4} fill={stroke} />
          )}
        </g>
        {hoverPoint && !dragRange && (
          <g className="sightingsActivity__hoverLayer">
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={margin.top}
              y2={margin.top + plotHeight}
              className="sightingsActivity__hoverGuide"
            />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={5} className="sightingsActivity__hoverDot" />
            <g transform={`translate(${tooltipX} ${tooltipY})`}>
              <rect width={tooltipWidth} height={tooltipHeight} rx={8} className="sightingsActivity__tooltipBg" />
              <text x={10} y={20} className="sightingsActivity__tooltipLabel">
                {hoverPoint.dateLabel}
              </text>
              <text x={10} y={40} className="sightingsActivity__tooltipValue">
                {formatTick(hoverPoint.value)}
              </text>
            </g>
          </g>
        )}
        {dragRange && selectionWidth > 0 && (
          <rect
            x={selectionX}
            y={margin.top}
            width={selectionWidth}
            height={plotHeight}
            className="sightingsActivity__selection"
          />
        )}
        <rect
          x={margin.left}
          y={margin.top}
          width={plotWidth}
          height={plotHeight}
          className="sightingsActivity__hitArea"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => setDragRange(null)}
          onPointerLeave={() => {
            if (!dragRange) setHoverPoint(null);
          }}
        />
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

function buildDateTicks(points: ChartPoint[], targetCount: number) {
  if (points.length <= targetCount) return points;
  const step = Math.max(1, Math.floor((points.length - 1) / (targetCount - 1)));
  const ticks = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (ticks[ticks.length - 1] !== last) ticks.push(last);
  return ticks.slice(0, targetCount - 1).concat(last);
}

function formatTick(value: number) {
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return Math.round(value).toString();
}

function formatDateTick(date: Date) {
  return date.toLocaleDateString(undefined, { year: "2-digit", month: "short" });
}

function findNearestPoint(
  points: ChartPoint[],
  targetTime: number,
  xScale: (time: number) => number,
  yScale: (value: number) => number
): HoverPoint | null {
  if (!points.length) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].date.getTime() < targetTime) low = mid + 1;
    else high = mid;
  }
  const previous = points[Math.max(0, low - 1)];
  const next = points[low];
  const nearest =
    !next || Math.abs(previous.date.getTime() - targetTime) <= Math.abs(next.date.getTime() - targetTime)
      ? previous
      : next;
  return {
    ...nearest,
    x: xScale(nearest.date.getTime()),
    y: yScale(nearest.value),
  };
}

function parseActivityDate(value: string) {
  const isoWeekMatch = /^(\d{4})-W(\d{1,2})$/.exec(value);
  if (!isoWeekMatch) return new Date(value);

  const year = Number(isoWeekMatch[1]);
  const week = Number(isoWeekMatch[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return new Date(Number.NaN);

  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const day = januaryFourth.getUTCDay() || 7;
  const mondayOfWeekOne = new Date(januaryFourth);
  mondayOfWeekOne.setUTCDate(januaryFourth.getUTCDate() - day + 1);
  const target = new Date(mondayOfWeekOne);
  target.setUTCDate(mondayOfWeekOne.getUTCDate() + (week - 1) * 7);
  return target;
}
