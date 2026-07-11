import type { CSSProperties } from "react";
import { KILOMETERS_PER_MILE } from "../../../shared/config/planner";
import {
  buildTripPlannerRangeFromDates,
  dayIsInTripRange,
  type TripPlannerHistogramBin,
} from "../../../shared/data/tripPlanner";
import type { SuggestedPlace } from "../../locations/types";
import type { TripPlanSelection } from "./plannerTypes";
import { buildSeasonalWeekBars } from "../../seasonal-activity/seasonalActivity";

const TRIP_BRUSH_DAYS = 366;
const MAX_TRIP_LENGTH_DAYS = 366;

export type WeekBar = {
  index: number;
  label: string;
  count: number;
  highlighted: boolean;
};

export type ChartBar = WeekBar & {
  dayOfYear: number;
};

export type AxisTick = {
  index: number;
  label: string;
  sublabel?: string;
};

export type MonthBand = {
  label: string;
  startIndex: number;
  span: number;
};

export type TripBrushMode = "move" | "start" | "end";

export type TripWindowSegment = {
  key: string;
  style: CSSProperties;
  showLabel: boolean;
  handleStart: boolean;
  handleEnd: boolean;
};

export type TripBrushDragState = {
  mode: TripBrushMode;
  pointerId: number;
  startX: number;
  initialSelection: TripPlanSelection;
};

export type ChartZoomMode = "weekly" | "daily";

export function parseIsoDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function buildRadiusFitLocations(latitude: number, longitude: number, radiusMiles: number): Array<[number, number]> {
  const kilometers = radiusMiles * KILOMETERS_PER_MILE;
  const latRadians = (latitude * Math.PI) / 180;
  const kmPerDegreeLat = 110.574;
  const kmPerDegreeLon = 111.32 * Math.cos(latRadians);
  if (!Number.isFinite(kmPerDegreeLon) || Math.abs(kmPerDegreeLon) < 0.0001) {
    return [[longitude, latitude]];
  }

  const latOffset = kilometers / kmPerDegreeLat;
  const lonOffset = kilometers / kmPerDegreeLon;

  return [
    [longitude, latitude + latOffset],
    [longitude + lonOffset, latitude],
    [longitude, latitude - latOffset],
    [longitude - lonOffset, latitude],
  ];
}

export function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function clampTripLength(start: Date, end: Date) {
  const earliestStart = addUtcDays(end, -(MAX_TRIP_LENGTH_DAYS - 1));
  if (start.getTime() < earliestStart.getTime()) return earliestStart;
  return start;
}

export function toWeekBars(histogram: TripPlannerHistogramBin[], highlightedDays: Set<number>) {
  return buildSeasonalWeekBars(histogram, highlightedDays).map((entry) => ({
    ...entry,
    label:
      entry.index === 0
        ? "Jan"
        : entry.index === 4
          ? "Feb"
          : entry.index === 8
            ? "Mar"
            : entry.index === 13
              ? "Apr"
              : entry.index === 17
                ? "May"
                : entry.index === 21
                  ? "Jun"
                  : entry.index === 26
                    ? "Jul"
                    : entry.index === 30
                      ? "Aug"
                      : entry.index === 35
                        ? "Sep"
                        : entry.index === 39
                          ? "Oct"
                          : entry.index === 44
                            ? "Nov"
                            : entry.index === 48
                              ? "Dec"
                              : "",
  }));
}

export function computeActivityLabel(selectedCount: number, bars: WeekBar[]) {
  const maxValue = Math.max(1, ...bars.map((bar) => bar.count));
  const ratio = selectedCount / maxValue;
  if (ratio >= 0.72) return "High";
  if (ratio >= 0.48) return "Medium–High";
  if (ratio >= 0.26) return "Medium";
  return "Low";
}

export function computeTopWaters(places: SuggestedPlace[]) {
  const unique = Array.from(new Set(places.map((place) => place.region).filter(Boolean) as string[]));
  return unique.slice(0, 2).join(", ") || "San Juan Channel, Haro Strait";
}

export function buildMonthTicks(bars: WeekBar[]): AxisTick[] {
  return bars.filter((bar) => bar.label).map((bar) => ({ index: bar.index, label: bar.label }));
}

export function modDayOfYear(day: number) {
  return ((day - 1) % TRIP_BRUSH_DAYS + TRIP_BRUSH_DAYS) % TRIP_BRUSH_DAYS + 1;
}

export function buildDailyBars(
  histogram: TripPlannerHistogramBin[],
  range: NonNullable<ReturnType<typeof buildTripPlannerRangeFromDates>>,
  paddingDays = 10
): ChartBar[] {
  const byDay = new Map<number, number>();
  histogram.forEach((row) => {
    const day = Math.max(1, Math.min(TRIP_BRUSH_DAYS, Number(row.day_of_year)));
    byDay.set(day, (byDay.get(day) ?? 0) + (Number(row.count) || 0));
  });

  const firstDay = range.startDayOfYear - paddingDays;
  const totalDays = range.dayCount + paddingDays * 2;

  return Array.from({ length: totalDays }, (_, index) => {
    const dayOfYear = modDayOfYear(firstDay + index);
    return {
      index,
      label: "",
      count: byDay.get(dayOfYear) ?? 0,
      highlighted: dayIsInTripRange(dayOfYear, range),
      dayOfYear,
    };
  });
}

export function buildDailyTicks(
  bars: ChartBar[],
  range: NonNullable<ReturnType<typeof buildTripPlannerRangeFromDates>>
): AxisTick[] {
  const tripStartIndex = bars.findIndex((bar) => bar.highlighted);
  if (tripStartIndex < 0) return [];

  const tripStartDate = parseIsoDate(range.startDate);
  if (!tripStartDate) return [];

  const firstDate = addUtcDays(tripStartDate, -tripStartIndex);
  const tickStep = bars.length > 28 ? 3 : 2;

  return bars.flatMap((bar) => {
    const isEdgeTick = bar.index === 0 || bar.index === bars.length - 1;
    if (!isEdgeTick && bar.index % tickStep !== 0) return [];

    const date = addUtcDays(firstDate, bar.index);
    return [
      {
        index: bar.index,
        label: new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date),
      },
    ];
  });
}

export function buildDailyMonthBands(
  bars: ChartBar[],
  range: NonNullable<ReturnType<typeof buildTripPlannerRangeFromDates>>
): MonthBand[] {
  const tripStartIndex = bars.findIndex((bar) => bar.highlighted);
  if (tripStartIndex < 0) return [];

  const tripStartDate = parseIsoDate(range.startDate);
  if (!tripStartDate) return [];

  const firstDate = addUtcDays(tripStartDate, -tripStartIndex);
  const bands: MonthBand[] = [];

  bars.forEach((bar) => {
    const date = addUtcDays(firstDate, bar.index);
    const label = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
    const current = bands[bands.length - 1];
    if (current && current.label === label) {
      current.span += 1;
      return;
    }
    bands.push({ label, startIndex: bar.index, span: 1 });
  });

  return bands;
}

export function buildChartWindowStyle(bars: Array<{ index: number; highlighted: boolean }>): CSSProperties | null {
  const highlightedIndexes = bars.filter((bar) => bar.highlighted).map((bar) => bar.index);
  if (highlightedIndexes.length === 0) return null;
  const first = Math.min(...highlightedIndexes);
  const last = Math.max(...highlightedIndexes);
  const total = Math.max(1, bars.length);
  const outlineDelayMs = last * 20 + 980;
  return {
    left: `${(first / total) * 100}%`,
    width: `${((last - first + 1) / total) * 100}%`,
    "--trip-outline-delay": `${outlineDelayMs}ms`,
  } as CSSProperties;
}


export function buildInteractiveTripWindowSegments(
  range: ReturnType<typeof buildTripPlannerRangeFromDates>,
  bars: WeekBar[]
): TripWindowSegment[] {
  if (!range || bars.length === 0) return [];

  const highlightedIndexes = bars.filter((bar) => bar.highlighted).map((bar) => bar.index);
  if (highlightedIndexes.length === 0) return [];

  const segments: Array<{ startIndex: number; endIndex: number }> = [];
  highlightedIndexes.forEach((index) => {
    const current = segments[segments.length - 1];
    if (current && index === current.endIndex + 1) {
      current.endIndex = index;
      return;
    }
    segments.push({ startIndex: index, endIndex: index });
  });

  const total = Math.max(1, bars.length);
  const startWeekIndex = Math.min(52, Math.floor((range.startDayOfYear - 1) / 7));
  const endWeekIndex = Math.min(52, Math.floor((range.endDayOfYear - 1) / 7));

  return segments.map((segment, segmentIndex) => {
    const span = segment.endIndex - segment.startIndex + 1;
    const containsStart = startWeekIndex >= segment.startIndex && startWeekIndex <= segment.endIndex;
    const containsEnd = endWeekIndex >= segment.startIndex && endWeekIndex <= segment.endIndex;
    const outlineDelayMs = Math.floor((segment.startIndex / total) * 1060) + 980;

    return {
      key: `segment-${segmentIndex}`,
      style: {
        left: `${(segment.startIndex / total) * 100}%`,
        width: `${(span / total) * 100}%`,
        "--trip-outline-delay": `${outlineDelayMs}ms`,
      } as CSSProperties,
      showLabel: containsStart,
      handleStart: containsStart,
      handleEnd: containsEnd,
    };
  });
}

export function applyTripBrushDelta(
  selection: TripPlanSelection,
  mode: TripBrushMode,
  deltaDays: number
): TripPlanSelection | null {
  const start = parseIsoDate(selection.arrivalDate);
  const end = parseIsoDate(selection.departureDate);
  if (!start || !end) return null;

  let nextStart = start;
  let nextEnd = end;

  if (mode === "move") {
    nextStart = addUtcDays(start, deltaDays);
    nextEnd = addUtcDays(end, deltaDays);
  } else if (mode === "start") {
    nextStart = addUtcDays(start, deltaDays);
    if (nextStart.getTime() > end.getTime()) nextStart = end;
    nextStart = clampTripLength(nextStart, end);
  } else {
    nextEnd = addUtcDays(end, deltaDays);
    if (nextEnd.getTime() < start.getTime()) nextEnd = start;
    const latestEnd = addUtcDays(start, MAX_TRIP_LENGTH_DAYS - 1);
    if (nextEnd.getTime() > latestEnd.getTime()) nextEnd = latestEnd;
  }

  const arrivalDate = formatIsoDate(nextStart);
  const departureDate = formatIsoDate(nextEnd);
  if (arrivalDate === selection.arrivalDate && departureDate === selection.departureDate) {
    return selection;
  }

  return {
    ...selection,
    arrivalDate,
    departureDate,
  };
}
