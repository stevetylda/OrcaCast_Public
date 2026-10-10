import type { FeatureCollection } from "geojson";
import { GRID_PATH, getForecastPath } from "../config/dataPaths";
import type { H3Resolution } from "../config/dataPaths";
import { fetchJson } from "./fetchClient";
import { getH3CellId } from "./h3";
import { getDataVersionToken } from "./meta";
import { DataLoadError } from "./errors";
import { forecastPayloadSchema, parseWithSchema } from "./validation";

export type ForecastCoverage = {
  gridCellCount: number;
  modeledCellCount: number;
  unknownCellCount: number;
  missingCellPolicy: "omitted_as_unknown";
  unknownReason: "outside_model_support";
};

export type ForecastDataset = {
  schemaVersion?: number;
  resolution: H3Resolution;
  target_start?: string;
  target_end?: string;
  values: Record<string, number>;
  coverage: ForecastCoverage | null;
  modelId?: string;
};

const gridCache = new Map<H3Resolution, FeatureCollection>();
const gridRequests = new Map<H3Resolution, Promise<FeatureCollection>>();
const forecastCache = new Map<string, ForecastDataset>();
const forecastRequests = new Map<string, Promise<ForecastDataset>>();
const forecastRawCache = new Map<string, ForecastPayloadRaw>();
const forecastRawRequests = new Map<string, Promise<ForecastPayloadRaw>>();
const DISABLE_RUNTIME_DATA_CACHE = Boolean(
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV,
);

export async function loadGrid(
  resolution: H3Resolution,
): Promise<FeatureCollection> {
  const cached = DISABLE_RUNTIME_DATA_CACHE
    ? undefined
    : gridCache.get(resolution);
  if (cached) return cached;
  const pending = gridRequests.get(resolution);
  if (pending) return pending;
  const request = (async () => {
    const url = GRID_PATH[resolution];
    const { data } = await fetchJson<FeatureCollection>(url, {
      cache: DISABLE_RUNTIME_DATA_CACHE ? "no-store" : "force-cache",
      cacheToken: getDataVersionToken(),
    });
    if (!DISABLE_RUNTIME_DATA_CACHE) gridCache.set(resolution, data);
    // Grid consumers treat geometry as immutable and create new features when
    // joining forecast values. Sharing this large object avoids repeated deep
    // clones when the map, recommendations, and detail views request H6.
    return data;
  })();
  gridRequests.set(resolution, request);
  try {
    return await request;
  } finally {
    gridRequests.delete(resolution);
  }
}

type ForecastCoverageRaw = {
  grid_cell_count: number;
  modeled_cell_count: number;
  unknown_cell_count: number;
  missing_cell_policy: "omitted_as_unknown";
  unknown_reason: "outside_model_support";
};

type ForecastPayloadRaw = {
  schema_version?: number;
  resolution?: H3Resolution;
  target_start?: string;
  target_end?: string;
  values?: Record<string, number>;
  model?: string;
  models?: Array<{
    id?: string;
    model?: string;
    values: Record<string, number>;
    coverage?: ForecastCoverageRaw;
  }>;
  valuesByModel?: Record<string, Record<string, number>>;
};

async function loadForecastRaw(url: string): Promise<ForecastPayloadRaw> {
  const cached = DISABLE_RUNTIME_DATA_CACHE
    ? undefined
    : forecastRawCache.get(url);
  if (cached) return cached;
  const pending = forecastRawRequests.get(url);
  if (pending) return pending;
  const request = (async () => {
    const raw = parseWithSchema(
      forecastPayloadSchema,
      (
        await fetchJson<unknown>(url, {
          cache: DISABLE_RUNTIME_DATA_CACHE ? "no-store" : "force-cache",
          cacheToken: getDataVersionToken(),
        })
      ).data,
      url,
      "Forecast payload",
    );
    if (!DISABLE_RUNTIME_DATA_CACHE) forecastRawCache.set(url, raw);
    return raw;
  })();
  forecastRawRequests.set(url, request);
  try {
    return await request;
  } finally {
    forecastRawRequests.delete(url);
  }
}

type ModelValuesEntry = {
  id?: string;
  values: Record<string, number>;
  coverage?: ForecastCoverageRaw;
};

function collectModelEntries(raw: ForecastPayloadRaw): ModelValuesEntry[] {
  if (raw.models && raw.models.length > 0) {
    return raw.models.map((entry) => ({
      id: entry.id ?? entry.model,
      values: entry.values ?? {},
      coverage: entry.coverage,
    }));
  }
  if (raw.valuesByModel) {
    return Object.entries(raw.valuesByModel).map(([id, values]) => ({
      id,
      values: values ?? {},
    }));
  }
  return [];
}

export function buildConsensusMean(
  entries: ModelValuesEntry[],
): Record<string, number> {
  if (entries.length === 0) return {};
  const [first, ...rest] = entries;
  const keys = Object.keys(first.values).filter((key) =>
    rest.every((entry) => Number.isFinite(entry.values[key])),
  );
  const result: Record<string, number> = {};
  keys.forEach((key) => {
    let sum = 0;
    for (const entry of entries) {
      sum += entry.values[key];
    }
    result[key] = sum / entries.length;
  });
  return result;
}

function toCoverage(value?: ForecastCoverageRaw): ForecastCoverage | null {
  if (!value) return null;
  return {
    gridCellCount: value.grid_cell_count,
    modeledCellCount: value.modeled_cell_count,
    unknownCellCount: value.unknown_cell_count,
    missingCellPolicy: value.missing_cell_policy,
    unknownReason: value.unknown_reason,
  };
}

function resolveModelEntry(raw: ForecastPayloadRaw, modelId?: string) {
  if (raw.models && raw.models.length > 0) {
    if (modelId) {
      const match = raw.models.find(
        (entry) => entry.id === modelId || entry.model === modelId,
      );
      if (match) return match;
    }
    return raw.models[0];
  }
  if (raw.valuesByModel) {
    if (modelId && raw.valuesByModel[modelId])
      return { id: modelId, values: raw.valuesByModel[modelId] };
    const firstKey = Object.keys(raw.valuesByModel)[0];
    if (firstKey) return { id: firstKey, values: raw.valuesByModel[firstKey] };
  }
  return { id: raw.model, values: raw.values ?? {} };
}

async function validateV2AgainstGrid(
  raw: ForecastPayloadRaw,
  resolution: H3Resolution,
  url: string,
): Promise<void> {
  if (raw.schema_version !== 2) return;
  if (raw.resolution !== resolution) {
    throw new DataLoadError({
      kind: "validation",
      url,
      message: `Forecast resolution ${raw.resolution ?? "missing"} does not match ${resolution}`,
    });
  }
  const grid = await loadGrid(resolution);
  const gridIds = new Set(
    (grid.features ?? []).map((feature) =>
      getH3CellId(feature.properties as Record<string, unknown> | null),
    ),
  );
  for (const entry of raw.models ?? []) {
    if (entry.coverage?.grid_cell_count !== gridIds.size) {
      throw new DataLoadError({
        kind: "validation",
        url,
        message: `${entry.id ?? "Forecast model"} coverage grid count does not match the ${resolution} app grid`,
      });
    }
    const outsideGrid = Object.keys(entry.values).find(
      (cell) => !gridIds.has(cell),
    );
    if (outsideGrid) {
      throw new DataLoadError({
        kind: "validation",
        url,
        message: `${entry.id ?? "Forecast model"} includes ${outsideGrid} outside the ${resolution} app grid`,
      });
    }
  }
}

export async function loadForecast(
  resolution: H3Resolution,
  opts: {
    kind?: "latest" | "explicit";
    explicitPath?: string;
    modelId?: string;
  } = {},
): Promise<ForecastDataset> {
  const url = getForecastPath(resolution, opts);
  const cacheKey = `${resolution}|${url}|${opts.modelId ?? ""}`;
  const cached = DISABLE_RUNTIME_DATA_CACHE
    ? undefined
    : forecastCache.get(cacheKey);
  if (cached) return cached;
  const pending = forecastRequests.get(cacheKey);
  if (pending) return pending;
  const request = (async () => {
    const raw = await loadForecastRaw(url);
    await validateV2AgainstGrid(raw, resolution, url);
    if (
      raw.schema_version === 2 &&
      opts.modelId &&
      opts.modelId !== "consensus" &&
      !(raw.models ?? []).some((entry) => entry.id === opts.modelId)
    ) {
      throw new DataLoadError({
        kind: "validation",
        url,
        message: `Forecast payload does not contain requested model ${opts.modelId}`,
      });
    }
    const modelEntry = resolveModelEntry(raw, opts.modelId);
    const entries = collectModelEntries(raw);
    const values =
      opts.modelId === "consensus"
        ? buildConsensusMean(entries)
        : modelEntry.values;
    const baseCoverage = modelEntry.coverage;
    const coverage =
      opts.modelId === "consensus" && baseCoverage
        ? toCoverage({
            ...baseCoverage,
            modeled_cell_count: Object.keys(values).length,
            unknown_cell_count:
              baseCoverage.grid_cell_count - Object.keys(values).length,
          })
        : toCoverage(baseCoverage);
    const data: ForecastDataset = {
      schemaVersion: raw.schema_version,
      resolution: raw.resolution ?? resolution,
      target_start: raw.target_start,
      target_end: raw.target_end,
      values,
      coverage,
      modelId: opts.modelId ?? modelEntry.id ?? modelEntry.model,
    };
    if (!DISABLE_RUNTIME_DATA_CACHE) forecastCache.set(cacheKey, data);
    return data;
  })();
  forecastRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    forecastRequests.delete(cacheKey);
  }
}

export function resetForecastCache(): void {
  gridCache.clear();
  forecastCache.clear();
  forecastRawCache.clear();
  gridRequests.clear();
  forecastRequests.clear();
  forecastRawRequests.clear();
}

export async function loadForecastModelIds(
  resolution: H3Resolution,
  opts: { kind?: "latest" | "explicit"; explicitPath?: string } = {},
): Promise<string[]> {
  const url = getForecastPath(resolution, opts);
  const raw = await loadForecastRaw(url);
  let ids: string[] = [];
  let modelCount = 0;
  if (raw.models && raw.models.length > 0) {
    ids = raw.models
      .map((entry) => entry.id ?? entry.model)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    modelCount = raw.models.length;
  } else if (raw.valuesByModel) {
    ids = Object.keys(raw.valuesByModel);
    modelCount = ids.length;
  } else if (raw.model) {
    ids = [raw.model];
    modelCount = 1;
  }
  if (modelCount > 1) ids.push("consensus");
  return Array.from(new Set(ids));
}

export function attachProbabilities(
  fc: FeatureCollection,
  values: Record<string, number>,
  outKey = "prob",
): FeatureCollection {
  return {
    ...fc,
    features: (fc.features ?? []).map((feature) => {
      const props = {
        ...((feature.properties ?? {}) as Record<string, unknown>),
      };
      const id = getH3CellId(props);
      const raw = values[id];
      const modeled = typeof raw === "number" && Number.isFinite(raw);
      props[outKey] = modeled ? raw : null;
      props[`${outKey}_status`] = modeled ? "modeled" : "unknown";
      return {
        ...feature,
        properties: props,
      };
    }),
  };
}

export function countNonZero(fc: FeatureCollection, key = "prob"): number {
  let count = 0;
  for (const feature of fc.features) {
    const props = feature.properties as Record<string, unknown> | null;
    const value = props ? Number(props[key]) : 0;
    if (value > 0) count += 1;
  }
  return count;
}
