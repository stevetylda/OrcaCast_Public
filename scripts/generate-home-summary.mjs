import { readFile, writeFile } from "node:fs/promises";

const source = new URL(
  "../public/data/trip_planner/H6_HISTORICAL_DOY.json",
  import.meta.url,
);
const destination = new URL(
  "../public/data/trip_planner/seasonal-summary.json",
  import.meta.url,
);
const {
  histogram,
  year_min,
  year_max,
  source: provenance,
} = JSON.parse(await readFile(source, "utf8"));
if (
  !Array.isArray(histogram) ||
  histogram.length === 0 ||
  histogram.some(
    (row) =>
      !Number.isInteger(row.day_of_year) ||
      row.day_of_year < 1 ||
      row.day_of_year > 366 ||
      !Number.isFinite(row.count) ||
      row.count < 0,
  )
) {
  throw new Error("Historical source has an invalid seasonal histogram");
}
const summary =
  JSON.stringify({ histogram, year_min, year_max, source: provenance }) + "\n";
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== summary)
    throw new Error("Seasonal summary is stale; run npm run data:home");
} else {
  await writeFile(destination, summary);
}
