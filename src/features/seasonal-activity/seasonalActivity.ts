import type { TripPlannerHistogramBin } from "../../shared/data/tripPlanner";

export type SeasonalWeekBar = {
  index: number;
  count: number;
  highlighted: boolean;
};

export function buildHighlightedDays(
  startDay: number,
  endDay: number,
  crossesYear: boolean
) {
  const days = new Set<number>();
  for (let day = 1; day <= 366; day += 1) {
    if (crossesYear ? day >= startDay || day <= endDay : day >= startDay && day <= endDay) {
      days.add(day);
    }
  }
  return days;
}

export function buildSeasonalWeekBars(
  histogram: TripPlannerHistogramBin[],
  highlightedDays: ReadonlySet<number>
): SeasonalWeekBar[] {
  const counts = Array.from({ length: 53 }, (_, index) => ({
    index,
    count: 0,
    highlighted: false,
  }));
  histogram.forEach((row) => {
    const day = Math.max(1, Math.min(366, Number(row.day_of_year)));
    const weekIndex = Math.min(52, Math.floor((day - 1) / 7));
    counts[weekIndex].count += Number(row.count) || 0;
    if (highlightedDays.has(day)) counts[weekIndex].highlighted = true;
  });
  return counts;
}

export function dayOfYearUtc(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((current - start) / 86_400_000) + 1;
}

export function seasonalWeekIndex(date: Date) {
  return Math.min(52, Math.floor((dayOfYearUtc(date) - 1) / 7));
}

export function relativeActivityLabel(percentile: number) {
  if (percentile < 15) return "Very Low";
  if (percentile < 30) return "Low";
  if (percentile < 60) return "Moderate";
  if (percentile < 85) return "High";
  return "Very High";
}

export function computeRelativeActivity(
  weekBars: Array<{ count: number }>,
  currentWeekIndex: number
) {
  const counts = weekBars.map((bar) => bar.count).filter(Number.isFinite);
  if (counts.length === 0 || counts.every((count) => count <= 0)) return null;
  const currentCount = weekBars[currentWeekIndex]?.count;
  if (typeof currentCount !== "number" || !Number.isFinite(currentCount)) return null;
  const ordered = [...counts].sort((a, b) => a - b);
  const strictlyLess = ordered.filter((count) => count < currentCount).length;
  const equal = ordered.filter((count) => count === currentCount).length;
  const percentile = ((strictlyLess + equal / 2) / ordered.length) * 100;
  const label = relativeActivityLabel(percentile);
  const bucketIndex =
    label === "Very Low" ? 0 : label === "Low" ? 1 : label === "Moderate" ? 2 : label === "High" ? 3 : 4;
  return { label, percentile, bucketIndex };
}
