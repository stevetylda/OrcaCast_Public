import type { TripPlannerRange } from "../../../shared/data/tripPlanner";
import { isoWeekFromDate } from "../../../shared/time/forecastPeriodToIsoWeek";
import type { WeightedGeoTiffSource } from "../../map/types";

export type HistoricalSmoothEcotype = "srkw" | "transient";

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid planner date ${value}`);
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

function withBase(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
}

export function buildHistoricalSmoothWeekWeights(
  range: TripPlannerRange,
): Array<{ week: number; weight: number; dayCount: number }> {
  const start = parseIsoDate(range.startDate);
  const end = parseIsoDate(range.endDate);
  const counts = new Map<number, number>();
  let totalDays = 0;

  for (
    const date = new Date(start);
    date.getTime() <= end.getTime();
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const week = isoWeekFromDate(date);
    counts.set(week, (counts.get(week) ?? 0) + 1);
    totalDays += 1;
  }

  if (totalDays === 0) return [];
  return [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([week, dayCount]) => ({
      week,
      dayCount,
      weight: dayCount / totalDays,
    }));
}

export function buildHistoricalSmoothSources(
  range: TripPlannerRange,
  ecotype: HistoricalSmoothEcotype = "srkw",
): WeightedGeoTiffSource[] {
  return buildHistoricalSmoothWeekWeights(range).map(({ week, weight }) => ({
    path: withBase(
      `data/week_of_year_agg_history_smooth/${ecotype}/week_${String(week).padStart(2, "0")}.tif`,
    ),
    weight,
  }));
}
