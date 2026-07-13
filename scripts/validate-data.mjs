import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
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
