import { getDataVersionToken } from "./meta";
import { fetchJson } from "./fetchClient";
import {
  buildCoverageRows,
  defaultCoverageRangeRows,
  defaultStaticCoverageRows,
  type CoverageRangeRow,
  type CoverageRow,
  type StaticCoverageRow,
} from "../pages/data/coverageMatrix";

type RawDataSourcesPayload = {
  dynamic_sources?: unknown;
  static_sources?: unknown;
};

export type DataSourcesPayload = {
  dynamicSources: CoverageRow[];
  staticSources: StaticCoverageRow[];
};

const DATA_SOURCES_PATH = "data/data_sources.json";

export async function loadDataSources(): Promise<DataSourcesPayload> {
  const { data } = await fetchJson<RawDataSourcesPayload>(DATA_SOURCES_PATH, {
    cache: "force-cache",
    cacheToken: getDataVersionToken(),
    retries: 1,
  });

  return {
    dynamicSources: buildCoverageRows(normalizeDynamicSources(data.dynamic_sources)),
    staticSources: normalizeStaticSources(data.static_sources),
  };
}

function normalizeDynamicSources(value: unknown): CoverageRangeRow[] {
  if (!Array.isArray(value)) return defaultCoverageRangeRows;

  const rows = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const sourceType = typeof entry.source_type === "string" ? entry.source_type.trim() : "";
      const source = typeof entry.source === "string" ? entry.source.trim() : "";
      const description = typeof entry.description === "string" ? entry.description.trim() : "";
      const availabilityRanges = normalizeRanges((entry as { availability_ranges?: unknown }).availability_ranges);
      if (!sourceType || !source || !description) return null;
      return { sourceType, source, description, availabilityRanges };
    })
    .filter((row): row is CoverageRangeRow => row !== null);

  return rows.length > 0 ? rows : defaultCoverageRangeRows;
}

function normalizeStaticSources(value: unknown): StaticCoverageRow[] {
  if (!Array.isArray(value)) return defaultStaticCoverageRows;

  const rows = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const sourceType = typeof entry.source_type === "string" ? entry.source_type.trim() : "";
      const source = typeof entry.source === "string" ? entry.source.trim() : "";
      const description = typeof entry.description === "string" ? entry.description.trim() : "";
      const available = typeof entry.available === "boolean" ? entry.available : null;
      if (!sourceType || !source || !description || available === null) return null;
      return { sourceType, source, description, available };
    })
    .filter((row): row is StaticCoverageRow => row !== null);

  return rows.length > 0 ? rows : defaultStaticCoverageRows;
}

function normalizeRanges(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];

  return value
    .map((range) => {
      if (!Array.isArray(range) || range.length !== 2) return null;
      const start = Number(range[0]);
      const end = Number(range[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
      return [start, end] as [number, number];
    })
    .filter((range): range is [number, number] => range !== null);
}
