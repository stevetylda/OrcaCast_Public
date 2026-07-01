import { isoWeekToDateRange } from "../time/forecastPeriodToIsoWeek";
import { fetchJson } from "./fetchClient";
import type { H3Resolution } from "../config/dataPaths";
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
const cachedPeriodsByResolution = new Map<H3Resolution, Period[]>();

export function buildPeriodsUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(`${cleanBase}data/periods.json`, window.location.origin).toString();
}

export function resetPeriodsCache(): void {
  cachedPeriods = null;
  cachedPeriodsByResolution.clear();
}

export function buildManifestUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(`${cleanBase}data/manifest.json`, window.location.origin).toString();
}

type PublicDataManifest = {
  files?: string[];
};

async function loadManifestFileSet(): Promise<Set<string> | null> {
  try {
    const { data } = await fetchJson<PublicDataManifest>(buildManifestUrl(), {
      cache: "force-cache",
      cacheToken: getDataVersionToken(),
    });
    if (!Array.isArray(data.files)) return null;
    return new Set(data.files.map((file) => String(file).replace(/^\/+/, "")));
  } catch {
    return null;
  }
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


export async function loadPeriodsForResolution(resolution: H3Resolution): Promise<Period[]> {
  const cached = cachedPeriodsByResolution.get(resolution);
  if (cached) return cached;
  const periods = await loadPeriods();
  const manifestFiles = await loadManifestFileSet();
  if (!manifestFiles) {
    cachedPeriodsByResolution.set(resolution, periods);
    return periods;
  }
  const filtered = periods.filter((period) =>
    manifestFiles.has(`forecasts/latest/weekly/${period.fileId}_${resolution}.json`)
  );
  const resolved = filtered.length > 0 ? filtered : periods;
  cachedPeriodsByResolution.set(resolution, resolved);
  return resolved;
}
