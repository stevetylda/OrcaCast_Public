import type { H3Resolution } from "../config/dataPaths";
import { fetchJson } from "./fetchClient";
import { getDataVersionToken } from "./meta";

export type TripLengthOption = "1 day" | "2 days" | "3 days" | "Weekend";

export type TripPlannerRange = {
  startDate: string;
  endDate: string;
  startDayOfYear: number;
  endDayOfYear: number;
  dayCount: number;
  crossesYear: boolean;
  label: string;
};

export type TripPlannerHistogramBin = {
  day_of_year: number;
  count: number;
};

export type TripPlannerOccurrencePayload = {
  rows: Array<{
    h3: string;
    day_of_year: number;
    count: number;
  }>;
  histogram: TripPlannerHistogramBin[];
  year_min?: number;
  year_max?: number;
  source?: string;
};

export type TripPlannerOccurrenceResult = {
  values: Record<string, number>;
  histogram: TripPlannerHistogramBin[];
  selectedCount: number;
  activeCells: number;
  yearMin?: number;
  yearMax?: number;
  source?: string;
};

type RawTripPlannerPayload = {
  rows?: Array<{
    h3?: string;
    H3_INDEX?: string;
    h3_index?: string;
    day_of_year?: number;
    doy?: number;
    count?: number;
    sightings?: number;
    value?: number;
  }>;
  histogram?: Array<{
    day_of_year?: number;
    doy?: number;
    count?: number;
    sightings?: number;
    value?: number;
  }>;
  year_min?: number;
  year_max?: number;
  source?: string;
};

const occurrenceCache = new Map<H3Resolution, TripPlannerOccurrencePayload>();

function withBase(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return `${cleanBase}${trimmed}`;
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((current - start) / 86_400_000) + 1;
}

function parseTripDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function daysForTripLength(length: TripLengthOption | string): number {
  if (length === "2 days") return 2;
  if (length === "3 days") return 3;
  if (length === "Weekend") return 2;
  return 1;
}

export function buildTripPlannerRange(
  startDate: string,
  tripLength: TripLengthOption | string
): TripPlannerRange | null {
  const start = parseTripDate(startDate);
  if (!start) return null;
  const dayCount = daysForTripLength(tripLength);
  const end = addDays(start, Math.max(0, dayCount - 1));
  const startDay = dayOfYear(start);
  const endDay = dayOfYear(end);
  const crossesYear = start.getUTCFullYear() !== end.getUTCFullYear() || endDay < startDay;
  const label =
    dayCount <= 1
      ? formatDisplayDate(start)
      : `${formatDisplayDate(start)} to ${formatDisplayDate(end)}`;
  return {
    startDate: formatIsoDate(start),
    endDate: formatIsoDate(end),
    startDayOfYear: startDay,
    endDayOfYear: endDay,
    dayCount,
    crossesYear,
    label,
  };
}

export function dayIsInTripRange(dayOfYearValue: number, range: TripPlannerRange): boolean {
  const day = Number(dayOfYearValue);
  if (!Number.isFinite(day)) return false;
  if (range.crossesYear) {
    return day >= range.startDayOfYear || day <= range.endDayOfYear;
  }
  return day >= range.startDayOfYear && day <= range.endDayOfYear;
}

function normalizePayload(payload: RawTripPlannerPayload): TripPlannerOccurrencePayload {
  const rows = (Array.isArray(payload.rows) ? payload.rows : [])
    .map((row) => {
      const h3 = String(row.h3 ?? row.H3_INDEX ?? row.h3_index ?? "").trim();
      const day = Number(row.day_of_year ?? row.doy);
      const count = Number(row.count ?? row.sightings ?? row.value ?? 0);
      if (!h3 || !Number.isFinite(day) || !Number.isFinite(count)) return null;
      return { h3, day_of_year: Math.round(day), count };
    })
    .filter((row): row is TripPlannerOccurrencePayload["rows"][number] => row !== null);

  const histogramFromPayload = Array.isArray(payload.histogram) ? payload.histogram : [];
  const histogram = histogramFromPayload
    .map((row) => {
      const day = Number(row.day_of_year ?? row.doy);
      const count = Number(row.count ?? row.sightings ?? row.value ?? 0);
      if (!Number.isFinite(day) || !Number.isFinite(count)) return null;
      return { day_of_year: Math.round(day), count };
    })
    .filter((row): row is TripPlannerHistogramBin => row !== null);

  return {
    rows,
    histogram: histogram.length > 0 ? histogram : buildHistogramFromRows(rows),
    year_min: Number.isFinite(Number(payload.year_min)) ? Number(payload.year_min) : undefined,
    year_max: Number.isFinite(Number(payload.year_max)) ? Number(payload.year_max) : undefined,
    source: typeof payload.source === "string" ? payload.source : undefined,
  };
}

function buildHistogramFromRows(rows: TripPlannerOccurrencePayload["rows"]): TripPlannerHistogramBin[] {
  const byDay = new Map<number, number>();
  rows.forEach((row) => {
    byDay.set(row.day_of_year, (byDay.get(row.day_of_year) ?? 0) + row.count);
  });
  return Array.from({ length: 366 }, (_, index) => {
    const day = index + 1;
    return { day_of_year: day, count: byDay.get(day) ?? 0 };
  });
}

function occurrenceUrlCandidates(resolution: H3Resolution): string[] {
  return [
    withBase(`data/trip_planner/${resolution}_HISTORICAL_DOY.json`),
    withBase(`data/trip_planner/${resolution}_historical_doy.json`),
    withBase(`data/historical_occurrence/${resolution}_HISTORICAL_DOY.json`),
  ];
}

export async function loadTripPlannerOccurrencePayload(
  resolution: H3Resolution
): Promise<TripPlannerOccurrencePayload> {
  const cached = occurrenceCache.get(resolution);
  if (cached) return cached;

  let lastError: unknown = null;
  for (const url of occurrenceUrlCandidates(resolution)) {
    try {
      const { data } = await fetchJson<RawTripPlannerPayload>(url, {
        cache: "force-cache",
        cacheToken: getDataVersionToken(),
      });
      const normalized = normalizePayload(data);
      occurrenceCache.set(resolution, normalized);
      return normalized;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Trip planner historical occurrence data is unavailable.");
}

export function aggregateTripPlannerOccurrence(
  payload: TripPlannerOccurrencePayload,
  range: TripPlannerRange
): TripPlannerOccurrenceResult {
  const values: Record<string, number> = {};
  let selectedCount = 0;

  payload.rows.forEach((row) => {
    if (!dayIsInTripRange(row.day_of_year, range)) return;
    const count = Number(row.count);
    if (!Number.isFinite(count) || count <= 0) return;
    values[row.h3] = (values[row.h3] ?? 0) + count;
    selectedCount += count;
  });

  return {
    values,
    histogram: payload.histogram.length > 0 ? payload.histogram : buildHistogramFromRows(payload.rows),
    selectedCount,
    activeCells: Object.values(values).filter((value) => Number(value) > 0).length,
    yearMin: payload.year_min,
    yearMax: payload.year_max,
    source: payload.source,
  };
}
