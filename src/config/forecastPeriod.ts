import { isoWeekFromDate, isoWeekToDateRange, isoWeekYearFromDate } from "../core/time/forecastPeriodToIsoWeek";
import type { Period } from "../data/periods";

export const FORECAST_PERIOD_OVERRIDE_QUERY_PARAM = "period";
export const FORECAST_PERIOD_OVERRIDE_STORAGE_KEY = "orcacast.periodOverride";

export type ForecastPeriodOverride = {
  start: string;
  end: string;
  raw: string;
  source: "query" | "localStorage";
};

function parseIsoDateAsUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildPeriod(year: number, statWeek: number, label?: string): Period {
  const range = isoWeekToDateRange(year, statWeek);
  return {
    year,
    stat_week: statWeek,
    label: label ?? `${range.start} → ${range.end}`,
    periodKey: `${year}-${String(statWeek).padStart(2, "0")}`,
    fileId: `${year}_${statWeek}`,
  };
}

export function parseForecastPeriodOverride(raw: string | null | undefined): ForecastPeriodOverride | null {
  if (!raw) return null;
  const match = /^(\d{4}-\d{2}-\d{2})__(\d{4}-\d{2}-\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const start = parseIsoDateAsUtc(match[1]);
  const end = parseIsoDateAsUtc(match[2]);
  if (!start || !end || end.getTime() < start.getTime()) return null;
  return {
    start: match[1],
    end: match[2],
    raw: raw.trim(),
    source: "localStorage",
  };
}

export function readForecastPeriodOverride(): ForecastPeriodOverride | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const queryOverride = parseForecastPeriodOverride(
    params.get(FORECAST_PERIOD_OVERRIDE_QUERY_PARAM)
  );
  if (queryOverride) return { ...queryOverride, source: "query" };

  const storageOverride = parseForecastPeriodOverride(
    window.localStorage.getItem(FORECAST_PERIOD_OVERRIDE_STORAGE_KEY)
  );
  if (storageOverride) return storageOverride;

  return null;
}

export function buildPeriodFromOverride(
  override: Pick<ForecastPeriodOverride, "start" | "end">
): Period | null {
  const start = parseIsoDateAsUtc(override.start);
  if (!start) return null;
  const year = isoWeekYearFromDate(start);
  const statWeek = isoWeekFromDate(start);
  return buildPeriod(year, statWeek, `${override.start} → ${override.end}`);
}

export function periodRange(period: Pick<Period, "year" | "stat_week">) {
  return isoWeekToDateRange(period.year, period.stat_week);
}

function comparePeriods(a: Pick<Period, "year" | "stat_week">, b: Pick<Period, "year" | "stat_week">) {
  return (a.year - b.year) || (a.stat_week - b.stat_week);
}

export function selectLatestPeriod(periods: Period[]): Period | null {
  if (periods.length === 0) return null;
  return periods.reduce((latest, candidate) => {
    const latestRange = periodRange(latest);
    const candidateRange = periodRange(candidate);
    if (candidateRange.end > latestRange.end) return candidate;
    if (candidateRange.end < latestRange.end) return latest;
    return comparePeriods(candidate, latest) > 0 ? candidate : latest;
  });
}

export function resolvePeriodsForSelection(
  periods: Period[],
  override: ForecastPeriodOverride | null,
  fallbackPeriod: Period
): { periods: Period[]; selectedIndex: number } {
  const byKey = new Map(periods.map((period) => [period.periodKey, period]));

  if (override) {
    const existing = periods.find((period) => {
      const range = periodRange(period);
      return range.start === override.start && range.end === override.end;
    });
    if (existing) {
      return {
        periods,
        selectedIndex: periods.findIndex((period) => period.periodKey === existing.periodKey),
      };
    }

    const derived = buildPeriodFromOverride(override);
    if (derived) {
      byKey.set(derived.periodKey, derived);
      const merged = Array.from(byKey.values()).sort(comparePeriods);
      return {
        periods: merged,
        selectedIndex: merged.findIndex((period) => period.periodKey === derived.periodKey),
      };
    }
  }

  if (periods.length > 0) {
    const latest = selectLatestPeriod(periods) ?? periods[periods.length - 1];
    return {
      periods,
      selectedIndex: Math.max(
        0,
        periods.findIndex((period) => period.periodKey === latest.periodKey)
      ),
    };
  }

  return { periods: [fallbackPeriod], selectedIndex: 0 };
}
