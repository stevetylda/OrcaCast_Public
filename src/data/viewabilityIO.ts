import type { Feature, MultiPolygon, Polygon } from "geojson";
import { getParquetColumns, queryParquetFile, queryParquetFiles, sqlLiteral } from "./duckdbBrowser";
import { fetchJson } from "./fetchClient";
import { sourceCellTimeSeriesFixture } from "./fixtures/viewabilityFixtures";
import type {
  SourceCellTimeSeriesPoint,
  ViewabilityAreaConditionPoint,
  SourceTargetVisibilityRecord,
  ViewabilityScoreType,
  ViewabilitySourceFeatureCollection,
  ViewabilitySourceProperties,
  ViewabilityTargetFeatureCollection,
  ViewabilityTargetProperties,
} from "./viewabilityTypes";

const VIEWABILITY_ROOT = "data/viewability";
const DEFAULT_VIEWABILITY_DATE = "2026-05-04";

type ViewabilityManifest = {
  base: {
    target_viewability: string;
    source_viewyness: string;
    source_visibility_template?: string | null;
    source_visibility_legacy_geojson_template?: string | null;
    source_visibility_index?: string;
    source_visibility_bundle_dir?: string;
  };
  dynamic?: {
    available: boolean;
    date_range?: {
      start: string;
      end: string;
    };
    target_viewability_template?: string;
    source_viewyness_template?: string;
    daily_scores_parquet_template?: string;
    source_timeseries_template?: string;
    months_template?: string;
    monthly_scores_template?: string;
    monthly_area_conditions_template?: string;
    source_timeseries_index?: string;
    source_timeseries_bundle_dir?: string;
  };
  conditions?: {
    available?: boolean;
    monthly_area_conditions_template?: string;
    includes_variance?: boolean;
    level?: string;
    weighting?: string;
  };
};

type DynamicScoresFile = {
  date: string;
  scores: Array<Record<string, unknown>>;
};

type SourceTimeSeriesFile = {
  h3: string;
  series: Array<Record<string, unknown>>;
};

type DynamicMonthDate = {
  target_viewability?: DynamicScoresFile | Array<Record<string, unknown>>;
  source_viewyness?: DynamicScoresFile | Array<Record<string, unknown>>;
};

type DynamicMonthFile = {
  month: string;
  dates: Record<string, DynamicMonthDate>;
};

type AreaConditionStat = {
  mean?: number;
  median?: number;
  std?: number;
  p10?: number;
  p25?: number;
  p75?: number;
  p90?: number;
  min?: number;
  max?: number;
};

type AreaConditionDate = {
  weather_modifier?: AreaConditionStat;
  daylight_modifier?: AreaConditionStat;
  lunar?: {
    lunar_modifier?: number;
    moon_illumination?: number;
    phase?: string;
  };
};

type AreaConditionsMonthFile = {
  month: string;
  dates: Record<string, AreaConditionDate>;
};

type SourceVisibilityIndexFile = {
  source_h3?: string[];
  bundles?: Record<string, string>;
  bundle_format?: string;
};

type SourceVisibilityIndex = {
  sourceH3: Set<string>;
  bundlesBySourceH3: Map<string, string>;
};

type SourceVisibilityBundleFile = {
  sources: Record<string, Array<Record<string, unknown>>>;
};

type SourceTimeSeriesIndexFile = {
  bundles?: Record<string, string>;
  bundle_format?: string;
};

type SourceTimeSeriesBundleFile = {
  sources: Record<string, Array<Record<string, unknown>>>;
};

const dynamicMonthCache = new Map<string, Promise<DynamicMonthFile>>();
const dynamicMonthParquetCache = new Map<string, Promise<Map<string, Record<string, unknown>>>>();
const areaConditionsMonthCache = new Map<string, Promise<AreaConditionsMonthFile>>();
const sourceTimeseriesIndexCache = new Map<string, Promise<SourceTimeSeriesIndexFile>>();
const sourceVisibilityBundleCache = new Map<string, Promise<SourceTargetVisibilityRecord[]>>();
const sourceTimeseriesBundleCache = new Map<string, Promise<SourceCellTimeSeriesPoint[]>>();
let allBundledSourceVisibilityPromise: Promise<SourceTargetVisibilityRecord[]> | null = null;
let areaConditionsSeriesPromise: Promise<ViewabilityAreaConditionPoint[]> | null = null;
let manifestPromise: Promise<ViewabilityManifest> | null = null;
let baseTargetCellsPromise: Promise<ViewabilityTargetFeatureCollection> | null = null;
let baseSourceCellsPromise: Promise<ViewabilitySourceFeatureCollection> | null = null;
let sourceVisibilityIndexPromise: Promise<SourceVisibilityIndex | null> | null = null;
const targetCellsByDateAndScoreCache = new Map<string, Promise<ViewabilityTargetFeatureCollection>>();
const sourceCellsByDateAndScoreCache = new Map<string, Promise<ViewabilitySourceFeatureCollection>>();

function viewabilityPath(path: string): string {
  return `${VIEWABILITY_ROOT}/${path}`;
}

function templatePath(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => values[key] ?? "");
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function coalesceNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function selectedDateOrDefault(date?: string): string {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : DEFAULT_VIEWABILITY_DATE;
}

function monthFromDate(date: string): string {
  return date.slice(0, 7);
}

function enumerateMonths(start: string, end: string): string[] {
  const startDate = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  const endDate = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return [monthFromDate(DEFAULT_VIEWABILITY_DATE)];
  }

  const months: string[] = [];
  for (
    let cursor = startDate;
    cursor <= endDate;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    months.push(cursor.toISOString().slice(0, 7));
  }
  return months;
}

function enumerateDates(start: string, end: string): string[] {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return [DEFAULT_VIEWABILITY_DATE];
  }

  const dates: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

async function loadManifest(): Promise<ViewabilityManifest> {
  if (!manifestPromise) {
    manifestPromise = fetchJson<ViewabilityManifest>(viewabilityPath("manifest.json"), { cache: "no-store", retries: 0 })
      .then(({ data }) => data);
  }
  return manifestPromise;
}

export async function loadViewabilityDates(): Promise<string[]> {
  const manifest = await loadManifest();
  const range = manifest.dynamic?.date_range;
  return range ? enumerateDates(range.start, range.end) : [DEFAULT_VIEWABILITY_DATE];
}

async function loadBaseTargetCells(manifest: ViewabilityManifest): Promise<ViewabilityTargetFeatureCollection> {
  if (!baseTargetCellsPromise) {
    baseTargetCellsPromise = fetchJson<ViewabilityTargetFeatureCollection>(viewabilityPath(manifest.base.target_viewability))
      .then(({ data }) => data);
  }
  return baseTargetCellsPromise;
}

async function loadDynamicScoresByH3(template: string | undefined, date: string): Promise<Map<string, Record<string, unknown>>> {
  if (!template) return new Map();
  const { data } = await fetchJson<DynamicScoresFile>(viewabilityPath(templatePath(template, { date })));
  return new Map(data.scores.map((row) => [String(row.h3), row]));
}

function dynamicScoreRows(scores: DynamicScoresFile | Array<Record<string, unknown>> | undefined): Array<Record<string, unknown>> {
  if (Array.isArray(scores)) return scores;
  return Array.isArray(scores?.scores) ? scores.scores : [];
}

async function loadDynamicMonth(manifest: ViewabilityManifest, date: string): Promise<DynamicMonthDate | null> {
  const template = manifest.dynamic?.months_template;
  if (!template || template.endsWith(".parquet")) return null;

  const month = monthFromDate(date);
  const path = viewabilityPath(templatePath(template, { month, yyyy_mm: month }));
  let promise = dynamicMonthCache.get(path);
  if (!promise) {
    promise = fetchJson<DynamicMonthFile>(path).then((result) => result.data);
    dynamicMonthCache.set(path, promise);
  }

  const monthData = await promise;
  return monthData.dates[date] ?? null;
}

async function loadDynamicMonthParquet(
  manifest: ViewabilityManifest,
  date: string,
  entity: "target" | "source"
): Promise<Map<string, Record<string, unknown>> | null> {
  const month = monthFromDate(date);
  const dailyTemplate = manifest.dynamic?.daily_scores_parquet_template;
  const monthlyTemplate = manifest.dynamic?.monthly_scores_template ?? manifest.dynamic?.months_template;
  const template = dailyTemplate?.endsWith(".parquet") ? dailyTemplate : monthlyTemplate;
  if (!template || !template.endsWith(".parquet")) return null;

  const path = viewabilityPath(
    templatePath(template, {
      date,
      month,
      yyyy_mm: month,
      yyyy_mm_dd: date,
    })
  );
  const cacheKey = `${path}|${date}|${entity}`;
  let promise = dynamicMonthParquetCache.get(cacheKey);
  if (!promise) {
    promise = queryParquetFile(
      path,
      (fileName) => `
        SELECT h3, weather_score, daylight_score, dynamic_score
        FROM read_parquet(${sqlLiteral(fileName)})
        WHERE date = ${sqlLiteral(date)}
          AND entity = ${sqlLiteral(entity)}
      `
    ).then((rows) => new Map(rows.map((row) => [String(row.h3), row])));
    dynamicMonthParquetCache.set(cacheKey, promise);
  }
  return promise;
}

function statValue(stat: AreaConditionStat | undefined): { value?: number; low?: number; high?: number } {
  const value = coalesceNumber(stat?.mean, stat?.median);
  if (value === undefined) return {};

  const p25 = asNumber(stat?.p25);
  const p75 = asNumber(stat?.p75);
  if (p25 !== undefined && p75 !== undefined) {
    return { value: clamp01(value), low: clamp01(p25), high: clamp01(p75) };
  }

  const std = asNumber(stat?.std);
  if (std !== undefined) {
    return { value: clamp01(value), low: clamp01(value - std), high: clamp01(value + std) };
  }

  return { value: clamp01(value) };
}

function areaConditionPoint(date: string, record: AreaConditionDate): ViewabilityAreaConditionPoint {
  const weather = statValue(record.weather_modifier);
  const daylight = statValue(record.daylight_modifier);
  const lunar = asNumber(record.lunar?.lunar_modifier);

  return {
    date,
    weather: weather.value,
    weatherLow: weather.low,
    weatherHigh: weather.high,
    daylight: daylight.value,
    daylightLow: daylight.low,
    daylightHigh: daylight.high,
    lunar: lunar === undefined ? undefined : clamp01(lunar),
  };
}

async function loadAreaConditionsMonth(
  manifest: ViewabilityManifest,
  month: string
): Promise<AreaConditionsMonthFile | null> {
  const template =
    manifest.conditions?.monthly_area_conditions_template ?? manifest.dynamic?.monthly_area_conditions_template;
  if (!template) return null;

  const path = viewabilityPath(templatePath(template, { month, yyyy_mm: month }));
  let promise = areaConditionsMonthCache.get(path);
  if (!promise) {
    promise = fetchJson<AreaConditionsMonthFile>(path).then((result) => result.data);
    areaConditionsMonthCache.set(path, promise);
  }
  return promise;
}

export async function loadViewabilityAreaConditions(): Promise<ViewabilityAreaConditionPoint[]> {
  if (!areaConditionsSeriesPromise) {
    areaConditionsSeriesPromise = loadManifest().then(async (manifest) => {
      const range = manifest.dynamic?.date_range;
      if (!range) return [];

      const months = enumerateMonths(range.start, range.end);
      const monthFiles = await Promise.all(months.map((month) => loadAreaConditionsMonth(manifest, month)));
      return monthFiles
        .flatMap((monthFile) => {
          if (!monthFile) return [];
          return Object.entries(monthFile.dates).map(([date, record]) => areaConditionPoint(date, record));
        })
        .filter((point) => point.date >= range.start && point.date <= range.end)
        .sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  return areaConditionsSeriesPromise;
}

async function loadDynamicTargetScoresByH3(manifest: ViewabilityManifest, date: string): Promise<Map<string, Record<string, unknown>>> {
  const parquetRows = await loadDynamicMonthParquet(manifest, date, "target");
  if (parquetRows) {
    return new Map(
      [...parquetRows].map(([h3, row]) => [
        h3,
        {
          h3,
          weather_viewability_score: asNumber(row.weather_score),
          daylight_viewability_score: asNumber(row.daylight_score),
          dynamic_viewability_score: asNumber(row.dynamic_score),
        },
      ])
    );
  }
  const day = await loadDynamicMonth(manifest, date);
  if (day?.target_viewability) {
    return new Map(dynamicScoreRows(day.target_viewability).map((row) => [String(row.h3), row]));
  }
  return loadDynamicScoresByH3(manifest.dynamic?.target_viewability_template, date);
}

async function loadDynamicSourceScoresByH3(manifest: ViewabilityManifest, date: string): Promise<Map<string, Record<string, unknown>>> {
  const parquetRows = await loadDynamicMonthParquet(manifest, date, "source");
  if (parquetRows) {
    return new Map(
      [...parquetRows].map(([h3, row]) => [
        h3,
        {
          h3,
          weather_viewyness_score: asNumber(row.weather_score),
          daylight_viewyness_score: asNumber(row.daylight_score),
          dynamic_viewyness_score: asNumber(row.dynamic_score),
        },
      ])
    );
  }
  const day = await loadDynamicMonth(manifest, date);
  if (day?.source_viewyness) {
    return new Map(dynamicScoreRows(day.source_viewyness).map((row) => [String(row.h3), row]));
  }
  return loadDynamicScoresByH3(manifest.dynamic?.source_viewyness_template, date);
}

function viewabilityBaseRelativePath(path: string): string {
  return path.startsWith("base/") ? path : `base/${path}`;
}

function viewabilityDynamicRelativePath(path: string): string {
  return path.startsWith("dynamic/") ? path : `dynamic/${path}`;
}

async function loadSourceVisibilityIndex(manifest: ViewabilityManifest): Promise<SourceVisibilityIndex | null> {
  if (!sourceVisibilityIndexPromise) {
    sourceVisibilityIndexPromise = (async () => {
      try {
        const { data } = await fetchJson<SourceVisibilityIndexFile>(
          viewabilityPath(manifest.base.source_visibility_index ?? "base/source_visibility_index.json")
        );
        const bundledSourceIds = data.bundles ? Object.keys(data.bundles) : [];
        return {
          sourceH3: new Set(data.source_h3 ?? bundledSourceIds),
          bundlesBySourceH3: new Map(Object.entries(data.bundles ?? {})),
        };
      } catch {
        return null;
      }
    })();
  }
  return sourceVisibilityIndexPromise;
}

async function loadBundledSourceVisibility(
  index: SourceVisibilityIndex,
  sourceCellId: string
): Promise<SourceTargetVisibilityRecord[] | null> {
  const bundlePath = index.bundlesBySourceH3.get(sourceCellId);
  if (!bundlePath) return null;
  const resolvedPath = viewabilityPath(viewabilityBaseRelativePath(bundlePath));
  let promise = sourceVisibilityBundleCache.get(`${resolvedPath}|${sourceCellId}`);
  if (!promise) {
    promise = (async () => {
      if (!resolvedPath.endsWith(".parquet")) {
        const { data } = await fetchJson<SourceVisibilityBundleFile>(resolvedPath);
        const records = data.sources[sourceCellId] ?? [];
        return records.flatMap((record) => {
          const targetH3 = asString(record.target_h3) ?? asString(record.h3);
          if (!targetH3) return [];
          const weight = coalesceNumber(record.weight, record.source_target_weight, record.base_source_target_weight);
          return [{
            source_h3: sourceCellId,
            target_h3: targetH3,
            source_target_weight: weight,
            base_source_target_weight: weight,
            distance_km: asNumber(record.distance_km),
            weight_distance: asNumber(record.weight_distance),
            weight_terrain: asNumber(record.weight_terrain),
            weight_vegetation: asNumber(record.weight_vegetation),
          }];
        });
      }
      const columns = await getParquetColumns(resolvedPath);
      const pickText = (...names: string[]) => names.find((name) => columns.has(name));
      const pickNumber = (...names: string[]) => names.find((name) => columns.has(name));
      const sourceColumn = pickText("source_h3");
      const targetColumn = pickText("target_h3", "h3");
      const weightColumn = pickNumber("source_target_weight", "base_source_target_weight", "weight");
      if (!sourceColumn || !targetColumn) return [];

      const optionalColumns = [
        pickNumber("base_source_target_weight"),
        pickNumber("distance_km"),
        pickNumber("weight_distance"),
        pickNumber("weight_terrain"),
        pickNumber("weight_vegetation"),
      ];
      const selectExpressions = [
        `${sourceColumn} AS source_h3`,
        `${targetColumn} AS target_h3`,
        `${weightColumn ?? "NULL"} AS source_target_weight`,
        `${pickNumber("base_source_target_weight", "source_target_weight", "weight") ?? "NULL"} AS base_source_target_weight`,
        `${optionalColumns[1] ?? "NULL"} AS distance_km`,
        `${optionalColumns[2] ?? "NULL"} AS weight_distance`,
        `${optionalColumns[3] ?? "NULL"} AS weight_terrain`,
        `${optionalColumns[4] ?? "NULL"} AS weight_vegetation`,
      ];

      const rows = await queryParquetFile(
        resolvedPath,
        (fileName) => `
          SELECT ${selectExpressions.join(", ")}
          FROM read_parquet(${sqlLiteral(fileName)})
          WHERE ${sourceColumn} = ${sqlLiteral(sourceCellId)}
        `
      );

      return rows.flatMap((record) => {
        const targetH3 = asString(record.target_h3);
        if (!targetH3) return [];
        return [{
          source_h3: asString(record.source_h3) ?? sourceCellId,
          target_h3: targetH3,
          source_target_weight: asNumber(record.source_target_weight),
          base_source_target_weight: asNumber(record.base_source_target_weight),
          distance_km: asNumber(record.distance_km),
          weight_distance: asNumber(record.weight_distance),
          weight_terrain: asNumber(record.weight_terrain),
          weight_vegetation: asNumber(record.weight_vegetation),
        }];
      });
    })();
    sourceVisibilityBundleCache.set(`${resolvedPath}|${sourceCellId}`, promise);
  }
  return promise;
}

async function loadAllBundledSourceVisibility(index: SourceVisibilityIndex): Promise<SourceTargetVisibilityRecord[]> {
  if (!allBundledSourceVisibilityPromise) {
    allBundledSourceVisibilityPromise = (async () => {
      const bundlePaths = Array.from(new Set(index.bundlesBySourceH3.values()));
      const parquetPaths = bundlePaths
        .filter((bundlePath) => bundlePath.endsWith(".parquet"))
        .map((bundlePath) => viewabilityPath(viewabilityBaseRelativePath(bundlePath)));
      const jsonPaths = bundlePaths
        .filter((bundlePath) => !bundlePath.endsWith(".parquet"))
        .map((bundlePath) => viewabilityPath(viewabilityBaseRelativePath(bundlePath)));

      const [parquetRecords, jsonRecords] = await Promise.all([
        parquetPaths.length === 0
          ? Promise.resolve<SourceTargetVisibilityRecord[]>([])
          : queryParquetFiles(parquetPaths, (fileNames) => `
              SELECT
                source_h3,
                target_h3,
                weight AS source_target_weight,
                weight AS base_source_target_weight
              FROM read_parquet([${fileNames.map((fileName) => sqlLiteral(fileName)).join(", ")}])
            `).then((rows) =>
              rows.flatMap((record) => {
                const sourceH3 = asString(record.source_h3);
                const targetH3 = asString(record.target_h3);
                if (!sourceH3 || !targetH3) return [];
                return [{
                  source_h3: sourceH3,
                  target_h3: targetH3,
                  source_target_weight: asNumber(record.source_target_weight),
                  base_source_target_weight: asNumber(record.base_source_target_weight),
                }];
              })
            ),
        Promise.all(
          jsonPaths.map(async (path) => {
            const bundle = (await fetchJson<SourceVisibilityBundleFile>(path)).data;
            return Object.entries(bundle.sources).flatMap(([sourceCellId, records]) =>
              records.flatMap((record) => {
                const targetH3 = asString(record.target_h3) ?? asString(record.h3);
                if (!targetH3) return [];
                const weight = coalesceNumber(record.weight, record.source_target_weight, record.base_source_target_weight);
                return [{
                  source_h3: sourceCellId,
                  target_h3: targetH3,
                  source_target_weight: weight,
                  base_source_target_weight: weight,
                  distance_km: asNumber(record.distance_km),
                  weight_distance: asNumber(record.weight_distance),
                  weight_terrain: asNumber(record.weight_terrain),
                  weight_vegetation: asNumber(record.weight_vegetation),
                }];
              })
            );
          })
        ).then((groups) => groups.flat()),
      ]);

      return [...parquetRecords, ...jsonRecords];
    })();
  }

  return allBundledSourceVisibilityPromise;
}

export async function loadViewabilityTargetCells(
  date?: string,
  scoreType: ViewabilityScoreType = "dynamic"
): Promise<ViewabilityTargetFeatureCollection> {
  const selectedDate = selectedDateOrDefault(date);
  const cacheKey = `${selectedDate}|${scoreType}`;
  let cached = targetCellsByDateAndScoreCache.get(cacheKey);
  if (!cached) {
    cached = (async () => {
      const manifest = await loadManifest();
      const baseTargets = await loadBaseTargetCells(manifest);

      if (scoreType === "base") {
        return baseTargets;
      }

      const dynamicScores = await loadDynamicTargetScoresByH3(manifest, selectedDate);

      return {
        ...baseTargets,
        features: baseTargets.features.map((feature) => {
          const score = dynamicScores.get(feature.properties.h3);
          return {
            ...feature,
            properties: {
              ...feature.properties,
              weather_viewability_score: asNumber(score?.weather_viewability_score),
              daylight_viewability_score: asNumber(score?.daylight_viewability_score),
              lunar_viewability_score: asNumber(score?.lunar_viewability_score),
              weather_modifier: asNumber(score?.weather_modifier),
              daylight_modifier: asNumber(score?.daylight_modifier),
              lunar_modifier: asNumber(score?.lunar_modifier),
              dynamic_viewability_score:
                coalesceNumber(score?.dynamic_viewability_score, score?.weather_viewability_score) ??
                feature.properties.dynamic_viewability_score,
            },
          };
        }),
      };
    })();
    targetCellsByDateAndScoreCache.set(cacheKey, cached);
  }
  return cached;
}

export async function loadViewabilitySourceCells(
  date?: string,
  scoreType: ViewabilityScoreType = "dynamic"
): Promise<ViewabilitySourceFeatureCollection> {
  const selectedDate = selectedDateOrDefault(date);
  const cacheKey = `${selectedDate}|${scoreType}`;
  let cached = sourceCellsByDateAndScoreCache.get(cacheKey);
  if (!cached) {
    cached = (async () => {
      const manifest = await loadManifest();

      if (!baseSourceCellsPromise) {
        baseSourceCellsPromise = fetchJson<ViewabilitySourceFeatureCollection>(
          viewabilityPath(manifest.base.source_viewyness)
        ).then((result) => result.data);
      }

      const sourceSummary = await baseSourceCellsPromise;

      if (scoreType === "base") {
        return sourceSummary;
      }

      const dynamicScores = await loadDynamicSourceScoresByH3(manifest, selectedDate);

      const features = sourceSummary.features.map((feature) => {
        const h3 = feature.properties.h3;
        const dynamic = dynamicScores.get(h3);
        const baseScore = feature.properties.base_viewyness_score;
        const weatherScore = asNumber(dynamic?.weather_viewyness_score);
        const dynamicScore = coalesceNumber(
          dynamic?.dynamic_viewyness_score,
          dynamic?.weather_viewyness_score
        );
        const sourceScore = dynamicScore ?? baseScore;
        const visibleTargetCount = asNumber(dynamic?.visible_target_count);

        return {
          type: "Feature" as const,
          properties: {
            ...feature.properties,
            base_viewyness_score: baseScore,
            dynamic_viewyness_score: dynamicScore,
            weather_viewyness_score: weatherScore,
            daylight_viewyness_score: asNumber(dynamic?.daylight_viewyness_score),
            lunar_viewyness_score: asNumber(dynamic?.lunar_viewyness_score),
            weather_modifier_mean: asNumber(dynamic?.weather_modifier_mean),
            daylight_modifier_mean: asNumber(dynamic?.daylight_modifier_mean),
            lunar_modifier_mean: asNumber(dynamic?.lunar_modifier_mean),
            source_viewyness_score: sourceScore,
            visible_target_count: visibleTargetCount,
            dynamic_weight_sum: asNumber(dynamic?.dynamic_weight_sum),
            reachable_target_count:
              visibleTargetCount ?? feature.properties.reachable_target_count,
          },
          geometry: feature.geometry,
        };
      });

      return { type: "FeatureCollection", features };
    })();
    sourceCellsByDateAndScoreCache.set(cacheKey, cached);
  }
  return cached;
}
export async function loadSourceTargetVisibility(sourceCellId?: string): Promise<SourceTargetVisibilityRecord[]> {
  if (!sourceCellId) return [];

  const manifest = await loadManifest();
  const index = await loadSourceVisibilityIndex(manifest);
  if (index?.bundlesBySourceH3.size) {
    const bundled = await loadBundledSourceVisibility(index, sourceCellId);
    if (bundled) return bundled;
  }

  const sourceTemplate = manifest.base.source_visibility_template ?? manifest.base.source_visibility_legacy_geojson_template;
  if (!sourceTemplate) return [];

  const sourcePath = templatePath(sourceTemplate, { source_h3: sourceCellId });
  let data: ViewabilityTargetFeatureCollection;
  try {
    data = (await fetchJson<ViewabilityTargetFeatureCollection>(viewabilityPath(sourcePath))).data;
  } catch {
    return [];
  }

  return data.features.map((feature) => {
    const props = feature.properties as ViewabilityTargetProperties & Record<string, unknown>;
    return {
      source_h3: asString(props.source_h3) ?? sourceCellId,
      target_h3: props.h3,
      source_target_weight: asNumber(props.source_target_weight) ?? asNumber(props.base_source_target_weight),
      distance_km: asNumber(props.distance_km),
      weight_distance: asNumber(props.weight_distance),
      weight_terrain: asNumber(props.weight_terrain),
      weight_vegetation: asNumber(props.weight_vegetation),
    };
  });
}

export async function loadTargetSourceVisibility(targetCellId?: string): Promise<SourceTargetVisibilityRecord[]> {
  if (!targetCellId) return [];

  const manifest = await loadManifest();
  const index = await loadSourceVisibilityIndex(manifest);
  if (!index?.bundlesBySourceH3.size) return [];

  const records = await loadAllBundledSourceVisibility(index);
  return records.filter((record) => record.target_h3 === targetCellId);
}

export async function loadSourceCellTimeSeries(sourceCellId?: string): Promise<SourceCellTimeSeriesPoint[]> {
  if (!sourceCellId) return [];

  try {
    const manifest = await loadManifest();
    const indexPath = manifest.dynamic?.source_timeseries_index;
    if (indexPath) {
      let indexPromise = sourceTimeseriesIndexCache.get(indexPath);
      if (!indexPromise) {
        indexPromise = fetchJson<SourceTimeSeriesIndexFile>(viewabilityPath(indexPath)).then((result) => result.data);
        sourceTimeseriesIndexCache.set(indexPath, indexPromise);
      }
      const index = await indexPromise;
      const bundlePath = index.bundles?.[sourceCellId];
      if (bundlePath) {
        const resolvedBundlePath = viewabilityPath(viewabilityDynamicRelativePath(bundlePath));
        const bundleCacheKey = `${resolvedBundlePath}|${sourceCellId}`;
        let bundlePromise = sourceTimeseriesBundleCache.get(bundleCacheKey);
        if (!bundlePromise) {
          bundlePromise = (async () => {
            if (!resolvedBundlePath.endsWith(".parquet")) {
              const bundle = (await fetchJson<SourceTimeSeriesBundleFile>(resolvedBundlePath)).data;
              const rows = bundle.sources[sourceCellId] ?? [];
              return rows.map((point) => ({
                period: asString(point.date) ?? "",
                dynamic_viewability: asNumber(point.dynamic_viewyness_score),
                sighting_count: asNumber(point.sighting_count),
              }));
            }
            const columns = await getParquetColumns(resolvedBundlePath);
            const sourceColumn = columns.has("source_h3") ? "source_h3" : columns.has("h3") ? "h3" : null;
            const dateColumn = columns.has("date") ? "date" : columns.has("period") ? "period" : null;
            const viewabilityColumn = columns.has("dynamic_viewyness_score")
              ? "dynamic_viewyness_score"
              : columns.has("dynamic_viewability")
                ? "dynamic_viewability"
                : null;
            if (!sourceColumn || !dateColumn) return [];

            const rows = await queryParquetFile(
              resolvedBundlePath,
              (fileName) => `
                SELECT
                  ${dateColumn} AS period,
                  ${viewabilityColumn ?? "NULL"} AS dynamic_viewability,
                  ${
                    columns.has("sighting_count_visible_targets")
                      ? "sighting_count_visible_targets"
                      : columns.has("sighting_count")
                        ? "sighting_count"
                        : "NULL"
                  } AS sighting_count
                FROM read_parquet(${sqlLiteral(fileName)})
                WHERE ${sourceColumn} = ${sqlLiteral(sourceCellId)}
                ORDER BY ${dateColumn}
              `
            );

            return rows.map((point) => ({
              period: asString(point.period) ?? "",
              dynamic_viewability: asNumber(point.dynamic_viewability),
              sighting_count: asNumber(point.sighting_count),
            }));
          })();
          sourceTimeseriesBundleCache.set(bundleCacheKey, bundlePromise);
        }
        return bundlePromise;
      }
    }

    const template = manifest.dynamic?.source_timeseries_template;
    if (!template) return [];

    const { data } = await fetchJson<SourceTimeSeriesFile>(
      viewabilityPath(templatePath(template, { source_h3: sourceCellId }))
    );
    return data.series.map((point) => ({
      period: asString(point.date) ?? "",
      dynamic_viewability: asNumber(point.dynamic_viewyness_score),
      sighting_count: asNumber(point.sighting_count),
    }));
  } catch {
    return sourceCellTimeSeriesFixture;
  }
}

export type ViewabilityTargetGeometryFeature = Feature<Polygon | MultiPolygon, ViewabilityTargetProperties>;
export type ViewabilitySourceGeometryProperties = ViewabilitySourceProperties;
