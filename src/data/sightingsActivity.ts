import { getDataVersionToken } from "./meta";
import { fetchJson } from "./fetchClient";

export type SightingsActivityMetric =
  | "count_sightings"
  | "count_active_h6_grids"
  | "count_active_h5_grids"
  | "count_active_h4_grids";

export type SightingsActivityRow = {
  date: string;
  count_sightings: number;
  count_active_h6_grids: number;
  count_active_h5_grids: number;
  count_active_h4_grids: number;
  ecotype: string;
};

type RawSightingsActivityRow = {
  date?: unknown;
  count_sightings?: unknown;
  count_active_h6_grids?: unknown;
  count_active_h5_grids?: unknown;
  count_active_h4_grids?: unknown;
  ecotype?: unknown;
};

type RawSightingsActivityPayload =
  | RawSightingsActivityRow[]
  | {
      rows?: RawSightingsActivityRow[];
    };

const ACTIVITY_SUMMARY_PATH = "data/activity/SIGHTINGS_ACTIVITY_SUMMARY_WEEKLY_SRKW.json";

export async function loadSightingsActivitySummary(): Promise<SightingsActivityRow[]> {
  const { data } = await fetchJson<RawSightingsActivityPayload>(ACTIVITY_SUMMARY_PATH, {
    cache: "force-cache",
    cacheToken: getDataVersionToken(),
    retries: 1,
  });
  const rows = Array.isArray(data) ? data : data.rows;
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeSightingsActivityRow).filter((row): row is SightingsActivityRow => row !== null);
}

function normalizeSightingsActivityRow(row: RawSightingsActivityRow): SightingsActivityRow | null {
  const date = typeof row.date === "string" ? row.date : "";
  const ecotype = typeof row.ecotype === "string" ? row.ecotype : "";
  if (!date || !ecotype) return null;

  return {
    date,
    ecotype,
    count_sightings: toNumber(row.count_sightings),
    count_active_h6_grids: toNumber(row.count_active_h6_grids),
    count_active_h5_grids: toNumber(row.count_active_h5_grids),
    count_active_h4_grids: toNumber(row.count_active_h4_grids),
  };
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
