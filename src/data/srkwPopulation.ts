import { fetchJson } from "./fetchClient";
import { getDataVersionToken } from "./meta";

export type SrkwPopulationPodKey = "j_pod" | "k_pod" | "l_pod";

export type SrkwPopulationRow = {
  census_year: number;
  j_pod: number;
  k_pod: number;
  l_pod: number;
};

type RawSrkwPopulationRow = {
  census_year?: unknown;
  j_pod?: unknown;
  k_pod?: unknown;
  l_pod?: unknown;
};

type RawSrkwPopulationPayload =
  | RawSrkwPopulationRow[]
  | {
      rows?: RawSrkwPopulationRow[];
    };

const SRKW_POPULATION_PATH = "data/population/SRKW_POPULATION_COUNTS.json";

export async function loadSrkwPopulationCounts(): Promise<SrkwPopulationRow[]> {
  const { data } = await fetchJson<RawSrkwPopulationPayload>(SRKW_POPULATION_PATH, {
    cache: "force-cache",
    cacheToken: getDataVersionToken(),
    retries: 1,
  });
  const rows = Array.isArray(data) ? data : data.rows;
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizePopulationRow).filter((row): row is SrkwPopulationRow => row !== null);
}

function normalizePopulationRow(row: RawSrkwPopulationRow): SrkwPopulationRow | null {
  const censusYear = toNumber(row.census_year);
  if (!Number.isInteger(censusYear)) return null;
  return {
    census_year: censusYear,
    j_pod: toNumber(row.j_pod),
    k_pod: toNumber(row.k_pod),
    l_pod: toNumber(row.l_pod),
  };
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
