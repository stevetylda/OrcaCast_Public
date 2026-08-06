import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fromFile as openGeoTiff } from "geotiff";
import { z } from "zod";

const root = path.resolve("public/data");
const failures = [];
const finite = z.number().finite();
const h3 = z.string().regex(/^8[456][0-9a-f]{13}$/i, "invalid H3 index");
const coordinate = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
const period = z.object({
  year: z.number().int().min(2000).max(9999),
  stat_week: z.number().int().min(1).max(53),
  label: z.string().min(1).optional(),
});

function fail(file, message) {
  failures.push(`${path.relative(process.cwd(), file)}: ${message}`);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(
      file,
      `invalid JSON (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
}

function validateCoordinates(value, file) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    const result = coordinate.safeParse([value[0], value[1]]);
    if (!result.success)
      fail(file, "contains an out-of-range GeoJSON coordinate");
    return;
  }
  for (const child of value) validateCoordinates(child, file);
}

function validateGeoJson(
  payload,
  file,
  expectedResolution,
  allowEmpty = false,
) {
  if (
    !payload ||
    payload.type !== "FeatureCollection" ||
    !Array.isArray(payload.features)
  ) {
    fail(file, "must be a GeoJSON FeatureCollection");
    return new Set();
  }
  if (!allowEmpty && payload.features.length === 0)
    fail(file, "must contain at least one feature");
  const ids = new Set();
  for (const [index, feature] of payload.features.entries()) {
    if (
      feature?.type !== "Feature" ||
      !feature.geometry?.type ||
      !feature.geometry.coordinates
    ) {
      fail(file, `feature ${index} has invalid geometry`);
      continue;
    }
    validateCoordinates(feature.geometry.coordinates, file);
    const id = feature.properties?.h3;
    if (id !== undefined) {
      if (!h3.safeParse(id).success)
        fail(file, `feature ${index} has invalid H3 index`);
      if (expectedResolution && String(id)[1] !== expectedResolution.slice(1)) {
        fail(
          file,
          `feature ${index} H3 index does not match ${expectedResolution}`,
        );
      }
      ids.add(id);
    }
  }
  return ids;
}

function numericRecord(payload, file, label, allowEmpty = false) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail(file, `${label} must be an object`);
    return [];
  }
  const entries = Object.entries(payload);
  if (!allowEmpty && entries.length === 0)
    fail(file, `${label} must not be empty`);
  for (const [id, value] of entries) {
    if (!h3.safeParse(id).success)
      fail(file, `${label} contains invalid H3 index ${id}`);
    if (!finite.safeParse(value).success)
      fail(file, `${label}.${id} must be finite`);
  }
  return entries.map(([id]) => id);
}

function validateForecast(payload, file, allowEmpty) {
  if (!payload || typeof payload !== "object") {
    fail(file, "forecast must be an object");
    return [];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.target_start ?? ""))
    fail(file, "invalid target_start");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.target_end ?? ""))
    fail(file, "invalid target_end");
  if (payload.values)
    return numericRecord(payload.values, file, "values", allowEmpty);
  if (Array.isArray(payload.models) && payload.models.length > 0) {
    return payload.models.flatMap((model, index) => {
      if (typeof model.id !== "string" || !model.id.trim())
        fail(file, `models[${index}] needs an id`);
      return numericRecord(model.values, file, `models[${index}].values`);
    });
  }
  if (payload.valuesByModel && typeof payload.valuesByModel === "object") {
    return Object.entries(payload.valuesByModel).flatMap(([model, values]) =>
      numericRecord(values, file, `valuesByModel.${model}`),
    );
  }
  fail(file, "must contain values, models, or valuesByModel");
  return [];
}

function validateCoverage(coverage, file, label, valueCount, gridCount) {
  if (!coverage || typeof coverage !== "object") {
    fail(file, `${label} coverage is required`);
    return;
  }
  const expected = {
    grid_cell_count: gridCount,
    modeled_cell_count: valueCount,
    unknown_cell_count: gridCount - valueCount,
    missing_cell_policy: "omitted_as_unknown",
    unknown_reason: "outside_model_support",
  };
  for (const [field, value] of Object.entries(expected)) {
    if (coverage[field] !== value) {
      fail(file, `${label}.coverage.${field} must be ${String(value)}`);
    }
  }
}

function validateActiveForecast(
  payload,
  file,
  resolution,
  modelId,
  gridSupport,
) {
  if (payload?.schema_version !== 2)
    fail(file, "active forecast schema_version must be 2");
  if (payload?.resolution !== resolution)
    fail(file, `resolution must be ${resolution}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload?.target_start ?? ""))
    fail(file, "invalid target_start");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload?.target_end ?? ""))
    fail(file, "invalid target_end");
  if (!Array.isArray(payload?.models) || payload.models.length !== 1) {
    fail(file, "active forecast must contain exactly one model");
    return [];
  }
  const model = payload.models[0];
  if (model?.id !== modelId) fail(file, `model id must be ${modelId}`);
  const ids = numericRecord(model?.values, file, "models[0].values");
  for (const id of ids) {
    if (String(id)[1] !== resolution.slice(1))
      fail(file, `H3 index ${id} does not match ${resolution}`);
    if (!gridSupport.has(id))
      fail(file, `H3 index ${id} is outside the ${resolution} app grid`);
    const probability = model.values[id];
    if (probability < 0 || probability > 1)
      fail(file, `models[0].values.${id} must be between 0 and 1`);
  }
  validateCoverage(
    model?.coverage,
    file,
    "models[0]",
    ids.length,
    gridSupport.size,
  );
  return ids;
}

async function validateSmoothedNoData(file) {
  try {
    const tiff = await openGeoTiff(file);
    const image = await tiff.getImage();
    const nodata = image.getGDALNoData();
    if (!Number.isNaN(nodata)) fail(file, "GeoTIFF NoData must be NaN");
  } catch (error) {
    fail(
      file,
      `could not read GeoTIFF NoData (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

function validateLocations(items, file) {
  if (!Array.isArray(items) || items.length === 0) {
    fail(file, "must contain a non-empty location array");
    return;
  }
  for (const [index, item] of items.entries()) {
    if (typeof item?.name !== "string" || !item.name.trim())
      fail(file, `item ${index} needs a name`);
    if (
      !finite.safeParse(item?.latitude).success ||
      item.latitude < -90 ||
      item.latitude > 90
    ) {
      fail(file, `item ${index} has invalid latitude`);
    }
    if (
      !finite.safeParse(item?.longitude).success ||
      item.longitude < -180 ||
      item.longitude > 180
    ) {
      fail(file, `item ${index} has invalid longitude`);
    }
  }
}

const periodsFile = path.join(root, "periods.json");
const periodsPayload = await readJson(periodsFile);
const periodsResult = z.array(period).min(1).safeParse(periodsPayload);
if (!periodsResult.success)
  fail(
    periodsFile,
    periodsResult.error.issues.map((issue) => issue.message).join(", "),
  );
const periodKeys = new Set(
  (periodsResult.success ? periodsResult.data : []).map(
    (item) => `${item.year}_${item.stat_week}`,
  ),
);

const manifestFile = path.join(root, "manifest.json");
const manifest = await readJson(manifestFile);
if (!manifest || !Array.isArray(manifest.files))
  fail(manifestFile, "files must be an array");
for (const relative of manifest?.files ?? []) {
  try {
    await readFile(path.join(root, relative));
  } catch {
    fail(manifestFile, `references missing file ${relative}`);
  }
}
if (manifest?.period_count !== periodKeys.size)
  fail(manifestFile, "period_count does not match periods.json");

const gridIds = new Map();
for (const resolution of ["H4", "H5", "H6"]) {
  const file = path.join(root, "grids", `${resolution}.geojson`);
  gridIds.set(
    resolution,
    validateGeoJson(await readJson(file), file, resolution),
  );
}

const forecastRegistryFile = path.resolve("config/forecast-models.json");
const forecastRegistry = await readJson(forecastRegistryFile);
if (!Array.isArray(forecastRegistry) || forecastRegistry.length === 0)
  fail(forecastRegistryFile, "must contain configured forecast ecotypes");
for (const ecotype of Array.isArray(forecastRegistry) ? forecastRegistry : []) {
  for (const model of Array.isArray(ecotype?.models) ? ecotype.models : []) {
    const directory = path.join(
      root,
      "forecasts/latest/weekly",
      String(ecotype.id),
      String(model.id),
    );
    const manifestPath = path.join(directory, "manifest.json");
    const periodsPath = path.join(directory, "periods.json");
    const activeManifest = await readJson(manifestPath);
    const activePeriods = await readJson(periodsPath);
    const parsedPeriods = z.array(period).min(1).safeParse(activePeriods);
    if (!parsedPeriods.success) {
      fail(periodsPath, "must contain at least one valid period");
      continue;
    }
    if (activeManifest?.schema_version !== 2)
      fail(manifestPath, "schema_version must be 2");
    if (activeManifest?.model !== model.id)
      fail(manifestPath, `model must be ${model.id}`);
    if (
      String(activeManifest?.ecotype ?? "").toLowerCase() !==
      String(ecotype.id).toLowerCase()
    )
      fail(manifestPath, `ecotype must be ${ecotype.id}`);
    if (activeManifest?.period_count !== parsedPeriods.data.length)
      fail(manifestPath, "period_count does not match periods.json");
    if (
      activeManifest?.grid_alignment?.missing_cell_policy !==
        "omitted_as_unknown" ||
      activeManifest?.grid_alignment?.zero_semantics !==
        "modeled_probability_zero"
    ) {
      fail(
        manifestPath,
        "grid_alignment must preserve unknown cells and modeled zeros",
      );
    }

    const listedFiles = new Set(activeManifest?.files ?? []);
    for (const relative of listedFiles) {
      const listedPath = path.join(directory, relative);
      try {
        const metadata = await stat(listedPath);
        if (metadata.size <= 0) fail(listedPath, "must not be empty");
      } catch {
        fail(manifestPath, `references missing file ${relative}`);
      }
      if (relative.endsWith(".tif")) await validateSmoothedNoData(listedPath);
    }

    const newest = parsedPeriods.data.reduce((latest, candidate) =>
      candidate.year > latest.year ||
      (candidate.year === latest.year && candidate.stat_week > latest.stat_week)
        ? candidate
        : latest,
    );
    const periodKeysForModel = new Set(
      parsedPeriods.data.map((item) => `${item.year}_${item.stat_week}`),
    );
    for (const resolution of ["H4", "H5", "H6"]) {
      const support = gridIds.get(resolution) ?? new Set();
      const latestPath = path.join(directory, `${resolution}.json`);
      const latestPayload = await readJson(latestPath);
      validateActiveForecast(
        latestPayload,
        latestPath,
        resolution,
        model.id,
        support,
      );
      if (!listedFiles.has(`${resolution}.json`))
        fail(manifestPath, `files must include ${resolution}.json`);
      const newestName = `${newest.year}_${newest.stat_week}_${resolution}.json`;
      const newestPath = path.join(directory, newestName);
      const newestPayload = await readJson(newestPath);
      if (JSON.stringify(latestPayload) !== JSON.stringify(newestPayload))
        fail(latestPath, `must match newest period ${newestName}`);
      const manifestCoverage =
        activeManifest?.grid_alignment?.coverage_by_resolution?.[resolution];
      if (
        JSON.stringify(manifestCoverage) !==
        JSON.stringify(latestPayload?.models?.[0]?.coverage)
      )
        fail(
          manifestPath,
          `${resolution} coverage does not match latest payload`,
        );
    }

    for (const relative of listedFiles) {
      const match = relative.match(/^(\d{4})_(\d{1,2})_(H[456])\.json$/);
      if (!match) continue;
      const [, year, week, resolution] = match;
      if (!periodKeysForModel.has(`${year}_${Number(week)}`))
        fail(manifestPath, `${relative} is not represented in periods.json`);
      const file = path.join(directory, relative);
      validateActiveForecast(
        await readJson(file),
        file,
        resolution,
        model.id,
        gridIds.get(resolution) ?? new Set(),
      );
    }
  }
}

const historicalSmoothRoot = path.join(root, "week_of_year_agg_history_smooth");
const historicalSmoothManifestFile = path.join(
  historicalSmoothRoot,
  "manifest.json",
);
const historicalSmoothManifest = await readJson(historicalSmoothManifestFile);
if (
  historicalSmoothManifest?.product !==
  "week_of_year_aggregated_sighting_history_smoothed"
) {
  fail(historicalSmoothManifestFile, "has an unexpected product");
}
if (historicalSmoothManifest?.h3_resolution !== 6)
  fail(historicalSmoothManifestFile, "h3_resolution must be 6");
if (historicalSmoothManifest?.weeks !== 53)
  fail(historicalSmoothManifestFile, "weeks must be 53");
const historicalSmoothEcotypes = ["srkw", "transient"];
if (
  JSON.stringify(historicalSmoothManifest?.ecotypes) !==
  JSON.stringify(historicalSmoothEcotypes)
) {
  fail(historicalSmoothManifestFile, "ecotypes must be srkw and transient");
}

const historicalSmoothPeriodsFile = path.join(
  historicalSmoothRoot,
  "periods.json",
);
const historicalSmoothPeriods = await readJson(historicalSmoothPeriodsFile);
if (
  !Array.isArray(historicalSmoothPeriods) ||
  historicalSmoothPeriods.length !== 53 ||
  historicalSmoothPeriods.some(
    (entry, index) => entry?.week_of_year !== index + 1,
  )
) {
  fail(
    historicalSmoothPeriodsFile,
    "must contain sequential week_of_year records 1 through 53",
  );
}

for (const ecotype of historicalSmoothEcotypes) {
  for (let week = 1; week <= 53; week += 1) {
    const stem = path.join(
      historicalSmoothRoot,
      ecotype,
      `week_${String(week).padStart(2, "0")}`,
    );
    const jsonFile = `${stem}.json`;
    const payload = await readJson(jsonFile);
    if (String(payload?.ecotype ?? "").toLowerCase() !== ecotype)
      fail(jsonFile, `ecotype must be ${ecotype}`);
    if (payload?.week_of_year !== week)
      fail(jsonFile, `week_of_year must be ${week}`);
    if (payload?.h3_resolution !== 6) fail(jsonFile, "h3_resolution must be 6");
    const entries = Object.entries(payload?.values ?? {});
    if (entries.length !== historicalSmoothManifest?.h3_support_cells)
      fail(jsonFile, "values count does not match manifest support cells");
    for (const [id, value] of entries) {
      if (!h3.safeParse(id).success || String(id)[1] !== "6")
        fail(jsonFile, `values contains invalid H6 index ${id}`);
      for (const field of [
        "mean_sightings_per_year",
        "total_sightings",
        "years_with_sightings",
      ]) {
        if (!finite.safeParse(value?.[field]).success || value[field] < 0)
          fail(jsonFile, `${id}.${field} must be finite and non-negative`);
      }
    }
    for (const extension of ["png", "tif"]) {
      const file = `${stem}.${extension}`;
      try {
        const metadata = await stat(file);
        if (metadata.size <= 0) fail(file, "must not be empty");
      } catch {
        fail(file, "is missing");
      }
    }
  }
}

const forecastDirectories = [
  [path.join(root, "forecasts/latest/weekly"), false],
  [path.join(root, "forecasts/latest/actuals"), true],
];
const latestForecastIds = new Map();
for (const [directory, allowEmpty] of forecastDirectories) {
  for (const entry of await readdir(directory)) {
    if (!entry.endsWith(".json")) continue;
    const file = path.join(directory, entry);
    const ids = validateForecast(await readJson(file), file, allowEmpty);
    const match = entry.match(/(?:^|_)(H[456])\.json$/);
    const resolution = match?.[1];
    if (!resolution) {
      fail(file, "filename must end in H4.json, H5.json, or H6.json");
      continue;
    }
    for (const id of ids) {
      if (String(id)[1] !== resolution.slice(1))
        fail(file, `H3 index ${id} does not match ${resolution}`);
    }
    if (!allowEmpty && entry === `${resolution}.json`)
      latestForecastIds.set(resolution, new Set(ids));
    const periodMatch = entry.match(/^(\d{4})_(\d{1,2})_H[456]\.json$/);
    if (
      periodMatch &&
      !periodKeys.has(`${periodMatch[1]}_${Number(periodMatch[2])}`)
    ) {
      fail(file, "filename references a period not present in periods.json");
    }
  }
}

for (const resolution of ["H4", "H5", "H6"]) {
  for (const id of gridIds.get(resolution) ?? []) {
    if (!latestForecastIds.get(resolution)?.has(id)) {
      fail(
        path.join(root, "forecasts/latest/weekly", `${resolution}.json`),
        `map grid H3 index ${id} has no latest forecast value`,
      );
    }
  }
}

for (const resolution of ["H4", "H5", "H6"]) {
  const file = path.join(
    root,
    "trip_planner",
    `${resolution}_HISTORICAL_DOY.json`,
  );
  const payload = await readJson(file);
  if (!Array.isArray(payload?.rows) || payload.rows.length === 0)
    fail(file, "rows must be non-empty");
  for (const [index, row] of (payload?.rows ?? []).entries()) {
    if (
      !h3.safeParse(row.h3).success ||
      String(row.h3)[1] !== resolution.slice(1)
    )
      fail(file, `row ${index} has an invalid ${resolution} H3 index`);
    if (
      !Number.isInteger(row.day_of_year) ||
      row.day_of_year < 1 ||
      row.day_of_year > 366
    )
      fail(file, `row ${index} has invalid day_of_year`);
    if (!finite.safeParse(row.count).success || row.count < 0)
      fail(file, `row ${index} has invalid count`);
  }
}

validateLocations(
  await readJson(path.join(root, "places/base_locations.json")),
  path.join(root, "places/base_locations.json"),
);
const poiFile = path.join(root, "places_of_interest.json");
const poi = await readJson(poiFile);
validateLocations(Array.isArray(poi) ? poi : poi?.items, poiFile);
const hydrophoneFile = path.join(root, "orcasound_hydrophones.json");
const hydrophones = await readJson(hydrophoneFile);
validateLocations(hydrophones?.items, hydrophoneFile);

const webcamFile = path.join(root, "webcams.json");
const webcamPayload = await readJson(webcamFile);
const webcamStatuses = new Set([
  "verified-current",
  "current-frame-verified",
  "landing-verified",
  "directory-current",
  "seasonal",
]);
const webcamSiteIds = new Set();
const webcamFeedIds = new Set();
validateLocations(webcamPayload?.items, webcamFile);
if (typeof webcamPayload?.version !== "string" || !webcamPayload.version.trim())
  fail(webcamFile, "version must be a non-empty string");
if (!/^\d{4}-\d{2}-\d{2}$/.test(webcamPayload?.updatedAt ?? ""))
  fail(webcamFile, "updatedAt must be an ISO date");
for (const [siteIndex, site] of (webcamPayload?.items ?? []).entries()) {
  if (typeof site?.id !== "string" || !site.id.trim())
    fail(webcamFile, `site ${siteIndex} needs an id`);
  else if (webcamSiteIds.has(site.id))
    fail(webcamFile, `duplicate site id ${site.id}`);
  else webcamSiteIds.add(site.id);
  if (!Array.isArray(site?.feeds) || site.feeds.length === 0) {
    fail(webcamFile, `site ${siteIndex} needs at least one feed`);
    continue;
  }
  for (const [feedIndex, feed] of site.feeds.entries()) {
    const label = `site ${siteIndex} feed ${feedIndex}`;
    if (typeof feed?.id !== "string" || !feed.id.trim())
      fail(webcamFile, `${label} needs an id`);
    else if (webcamFeedIds.has(feed.id))
      fail(webcamFile, `duplicate feed id ${feed.id}`);
    else webcamFeedIds.add(feed.id);
    if (!webcamStatuses.has(feed?.status))
      fail(webcamFile, `${label} has an invalid status`);
    if (feed?.tier !== 1 && feed?.tier !== 2)
      fail(webcamFile, `${label} must be Tier 1 or Tier 2`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(feed?.verifiedAt ?? ""))
      fail(webcamFile, `${label} has an invalid verification date`);
    for (const [field, value] of [
      ["accessUrl", feed?.accessUrl],
      ["evidenceUrl", feed?.evidenceUrl],
    ]) {
      try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:")
          fail(webcamFile, `${label} ${field} must use HTTP(S)`);
      } catch {
        fail(webcamFile, `${label} has an invalid ${field}`);
      }
    }
  }
}

for (const entry of await readdir(path.join(root, "last_week_sightings"))) {
  if (!entry.endsWith(".geojson")) continue;
  const file = path.join(root, "last_week_sightings", entry);
  validateGeoJson(await readJson(file), file, undefined, true);
}

if (failures.length) {
  console.error(
    `Data contract validation failed (${failures.length}):\n${failures.join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `Validated ${periodKeys.size} periods, 3 grids, forecasts, locations, and map data.`,
);
