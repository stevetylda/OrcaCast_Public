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
  forecastAvailable?: boolean;
};

const cachedPeriods = new Map<string, Period[]>();
const cachedPeriodsByResolution = new Map<string, Period[]>();

export function buildPeriodsUrl(forecastDirectory?: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(
    forecastDirectory
      ? `${cleanBase}data/${forecastDirectory}/periods.json`
      : `${cleanBase}data/periods.json`,
    window.location.origin,
  ).toString();
}

export function resetPeriodsCache(): void {
  cachedPeriods.clear();
  cachedPeriodsByResolution.clear();
}

export function buildManifestUrl(forecastDirectory?: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const cleanBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(
    forecastDirectory
      ? `${cleanBase}data/${forecastDirectory}/manifest.json`
      : `${cleanBase}data/manifest.json`,
    window.location.origin,
  ).toString();
}

type PublicDataManifest = {
  files?: string[];
};

async function loadManifestFileSet(
  forecastDirectory?: string,
): Promise<Set<string> | null> {
  try {
    const { data } = await fetchJson<PublicDataManifest>(
      buildManifestUrl(forecastDirectory),
      {
        cache: "force-cache",
        cacheToken: getDataVersionToken(),
      },
    );
    if (!Array.isArray(data.files)) return null;
    return new Set(data.files.map((file) => String(file).replace(/^\/+/, "")));
  } catch {
    return null;
  }
}

export async function loadPeriods(
  forecastDirectory?: string,
): Promise<Period[]> {
  const cacheKey = forecastDirectory ?? "__legacy__";
  const cached = cachedPeriods.get(cacheKey);
  if (cached) return cached;
  const { url, data: parsedJson } = await fetchJson<unknown>(
    buildPeriodsUrl(forecastDirectory),
    {
      cache: "force-cache",
      cacheToken: getDataVersionToken(),
    },
  );
  const data = parseWithSchema(
    periodsFileSchema,
    parsedJson,
    url,
    "periods.json",
  );
  const periods = data
    .filter((p) => Number.isFinite(p.year) && Number.isFinite(p.stat_week))
    .map((p) => {
      const range = isoWeekToDateRange(p.year, p.stat_week);
      const label = p.label ?? `${range.start} → ${range.end}`;
      const periodKey = `${p.year}-${String(p.stat_week).padStart(2, "0")}`;
      const fileId = `${p.year}_${p.stat_week}`;
      return {
        year: p.year,
        stat_week: p.stat_week,
        label,
        periodKey,
        fileId,
        forecastAvailable: true,
      };
    })
    .sort((a, b) => a.year - b.year || a.stat_week - b.stat_week);
  cachedPeriods.set(cacheKey, periods);
  return periods;
}

export async function loadPeriodsForResolution(
  resolution: H3Resolution,
  forecastDirectory?: string,
): Promise<Period[]> {
  const cacheKey = `${forecastDirectory ?? "__legacy__"}|${resolution}`;
  const cached = cachedPeriodsByResolution.get(cacheKey);
  if (cached) return cached;
  const periods = await loadPeriods(forecastDirectory);
  const manifestFiles = await loadManifestFileSet(forecastDirectory);
  if (!manifestFiles) {
    cachedPeriodsByResolution.set(cacheKey, periods);
    return periods;
  }
  const filtered = periods.filter((period) => {
    const fileName = `${period.fileId}_${resolution}.json`;
    return (
      manifestFiles.has(fileName) ||
      (forecastDirectory
        ? manifestFiles.has(`${forecastDirectory}/${fileName}`)
        : manifestFiles.has(`forecasts/latest/weekly/${fileName}`))
    );
  });
  const resolved = filtered.length > 0 ? filtered : periods;
  cachedPeriodsByResolution.set(cacheKey, resolved);
  return resolved;
}
