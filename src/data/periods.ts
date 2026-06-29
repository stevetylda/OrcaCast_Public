import { isoWeekToDateRange } from "../core/time/forecastPeriodToIsoWeek";
import { fetchJson } from "./fetchClient";
import { getDataVersionToken } from "./meta";
import { parseWithSchema, periodsFileSchema } from "./validation";

export type Period = {
  year: number;
  stat_week: number;
  label: string;
  periodKey: string;
  fileId: string;
};

let cachedPeriods: Period[] | null = null;

export function buildPeriodsUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(`${cleanBase}data/periods.json`, window.location.origin).toString();
}

export function resetPeriodsCache(): void {
  cachedPeriods = null;
}

export async function loadPeriods(): Promise<Period[]> {
  if (cachedPeriods) return cachedPeriods;
  const { url, data: parsedJson } = await fetchJson<unknown>(buildPeriodsUrl(), {
    cache: "force-cache",
    cacheToken: getDataVersionToken(),
  });
  const data = parseWithSchema(periodsFileSchema, parsedJson, url, "periods.json");
  cachedPeriods = data
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.stat_week))
    .map((p) => {
      const range = isoWeekToDateRange(p.year, p.stat_week);
      const label = p.label ?? `${range.start} → ${range.end}`;
      const periodKey = `${p.year}-${String(p.stat_week).padStart(2, "0")}`;
      const fileId = `${p.year}_${p.stat_week}`;
      return { year: p.year, stat_week: p.stat_week, label, periodKey, fileId };
    })
    .sort((a, b) => (a.year - b.year) || (a.stat_week - b.stat_week));
  return cachedPeriods;
}
