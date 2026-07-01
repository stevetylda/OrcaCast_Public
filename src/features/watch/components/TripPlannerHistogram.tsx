import { useMemo } from "react";
import type { TripPlannerHistogramBin, TripPlannerRange } from "../../../shared/data/tripPlanner";
import { dayIsInTripRange } from "../../../shared/data/tripPlanner";

type Props = {
  histogram: TripPlannerHistogramBin[];
  selectedRange: TripPlannerRange | null;
  loading?: boolean;
  error?: string | null;
  selectedCount?: number;
  activeCells?: number;
  rightInsetPx?: number;
};

const MONTH_TICKS = [
  { day: 1, label: "Jan" },
  { day: 91, label: "Apr" },
  { day: 182, label: "Jul" },
  { day: 274, label: "Oct" },
  { day: 366, label: "Dec" },
];

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function buildBars(histogram: TripPlannerHistogramBin[]) {
  const byDay = new Map(histogram.map((row) => [Number(row.day_of_year), Number(row.count)]));
  return Array.from({ length: 366 }, (_, index) => {
    const day = index + 1;
    const count = byDay.get(day) ?? 0;
    return { day, count: Number.isFinite(count) ? Math.max(0, count) : 0 };
  });
}

function selectionStyle(range: TripPlannerRange | null, segment: "primary" | "tail") {
  if (!range) return undefined;
  const denominator = 366;
  if (!range.crossesYear) {
    if (segment === "tail") return undefined;
    const left = ((range.startDayOfYear - 1) / denominator) * 100;
    const width = ((range.endDayOfYear - range.startDayOfYear + 1) / denominator) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 0.7)}%` };
  }
  if (segment === "primary") {
    const left = ((range.startDayOfYear - 1) / denominator) * 100;
    const width = ((denominator - range.startDayOfYear + 1) / denominator) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 0.7)}%` };
  }
  const width = (range.endDayOfYear / denominator) * 100;
  return { left: "0%", width: `${Math.max(width, 0.7)}%` };
}

export function TripPlannerHistogram({
  histogram,
  selectedRange,
  loading = false,
  error = null,
  selectedCount = 0,
  activeCells = 0,
}: Props) {
  const bars = useMemo(() => buildBars(histogram), [histogram]);
  const maxCount = Math.max(1, ...bars.map((bar) => bar.count));
  const hasHistogram = histogram.length > 0;
  const primarySelectionStyle = selectionStyle(selectedRange, "primary");
  const tailSelectionStyle = selectionStyle(selectedRange, "tail");

  return (
    <section className="tripHistogram" aria-label="Historical seasonal sightings histogram">
      <div className="tripHistogram__header">
        <div>
          <p className="tripHistogram__eyebrow">Historical activity</p>
          <h3 className="tripHistogram__title">
            {selectedRange ? selectedRange.label : "Choose dates to search"}
          </h3>
        </div>
        <div className="tripHistogram__stats" aria-live="polite">
          {loading ? (
            <span>Loading seasonal slice…</span>
          ) : error ? (
            <span>Historical layer unavailable</span>
          ) : selectedRange ? (
            <>
              <strong>{formatCount(selectedCount)}</strong>
              <span>sightings · {formatCount(activeCells)} active hexes</span>
            </>
          ) : (
            <span>Map will switch from forecast to seasonal occurrence</span>
          )}
        </div>
      </div>

      <div className={`tripHistogram__chart${loading ? " tripHistogram__chart--loading" : ""}`}>
        {primarySelectionStyle && <span className="tripHistogram__selection" style={primarySelectionStyle} />}
        {tailSelectionStyle && <span className="tripHistogram__selection" style={tailSelectionStyle} />}
        {bars.map((bar) => {
          const selected = selectedRange ? dayIsInTripRange(bar.day, selectedRange) : false;
          const height = hasHistogram ? Math.max(4, (bar.count / maxCount) * 100) : 18;
          return (
            <span
              key={bar.day}
              className={`tripHistogram__bar${selected ? " tripHistogram__bar--selected" : ""}`}
              style={{ height: `${height}%` }}
              title={`Day ${bar.day}: ${formatCount(bar.count)} sightings`}
            />
          );
        })}
      </div>

      <div className="tripHistogram__axis" aria-hidden="true">
        {MONTH_TICKS.map((tick) => (
          <span key={tick.day} style={{ left: `${((tick.day - 1) / 365) * 100}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
    </section>
  );
}
