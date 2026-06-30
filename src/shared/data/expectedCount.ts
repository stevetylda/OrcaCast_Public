import type { H3Resolution } from "../config/dataPaths";
import { fetchJson } from "./fetchClient";
import { getDataVersionToken } from "./meta";

export type ExpectedCountPoint = {
  year: number;
  stat_week: number;
  expected_count: number;
  lower_ci?: number;
  upper_ci?: number;
  typical_error?: number;
};

type ExpectedCountPayload = {
  rows?: Array<{
    year?: number;
    stat_week?: number;
    period?: number;
    expected_count?: number;
    lower_ci?: number;
    upper_ci?: number;
    typical_error?: number;
  }>;
};

export type ActualActivityPoint = {
  year: number;
  stat_week: number;
  actual_count: number;
};

type ActualActivityPayload = {
  rows?: Array<{
    year?: number;
    stat_week?: number;
    period?: number;
    actual_count?: number;
    expected_count?: number;
  }>;
};

const cache = new Map<H3Resolution, ExpectedCountPoint[]>();
const actualCache = new Map<H3Resolution, ActualActivityPoint[]>();

function withBase(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${trimmed}`;
}

export async function loadExpectedCountSeries(
  resolution: H3Resolution
): Promise<ExpectedCountPoint[]> {
  const cached = cache.get(resolution);
  if (cached) return cached;

  const preferredUrl = withBase(`data/expected_count/${resolution}_EXPECTED_ACTIVITY.json`);
  const { data: payload } = await fetchJson<ExpectedCountPayload>(preferredUrl, {
    cache: "no-store",
    cacheToken: getDataVersionToken(),
  });

  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  const parsed = rows
    .map((row) => {
      const year = Number(row.year);
      const statWeek = Number(row.stat_week ?? row.period);
      const expectedCount = Number(row.expected_count);
      if (!Number.isFinite(year) || !Number.isFinite(statWeek) || !Number.isFinite(expectedCount)) {
        return null;
      }
      const point: ExpectedCountPoint = {
        year,
        stat_week: statWeek,
        expected_count: expectedCount,
      };
      const lowerCi = Number(row.lower_ci);
      if (Number.isFinite(lowerCi)) point.lower_ci = lowerCi;
      const upperCi = Number(row.upper_ci);
      if (Number.isFinite(upperCi)) point.upper_ci = upperCi;
      const typicalError = Number(row.typical_error);
      if (Number.isFinite(typicalError)) point.typical_error = typicalError;
      return point;
    })
    .filter((row): row is ExpectedCountPoint => row !== null)
    .sort((a, b) => (a.year - b.year) || (a.stat_week - b.stat_week));

  cache.set(resolution, parsed);
  return parsed;
}

export async function loadActualActivitySeries(
  resolution: H3Resolution
): Promise<ActualActivityPoint[]> {
  const cached = actualCache.get(resolution);
  if (cached) return cached;

  const preferredUrl = withBase(`data/expected_count/${resolution}_ACTUAL_ACTIVITY.json`);
  const { data: payload } = await fetchJson<ActualActivityPayload>(preferredUrl, {
    cache: "no-store",
    cacheToken: getDataVersionToken(),
  });

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const parsed = rows
    .map((row) => {
      const year = Number(row.year);
      const statWeek = Number(row.stat_week ?? row.period);
      const actualCount = Number(row.actual_count ?? row.expected_count);
      if (!Number.isFinite(year) || !Number.isFinite(statWeek) || !Number.isFinite(actualCount)) {
        return null;
      }
      return {
        year,
        stat_week: statWeek,
        actual_count: actualCount,
      };
    })
    .filter((row): row is ActualActivityPoint => row !== null)
    .sort((a, b) => (a.year - b.year) || (a.stat_week - b.stat_week));

  actualCache.set(resolution, parsed);
  return parsed;
}
