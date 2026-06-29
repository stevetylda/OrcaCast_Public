import type { FeatureCollection } from "geojson";
import { attachProbabilities } from "./forecastIO";
import { getH3CellId, H3_CELL_ID_KEYS } from "./h3";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

export function runH3UnitTests() {
  for (const key of H3_CELL_ID_KEYS) {
    assertEqual(getH3CellId({ [key]: "abc" }), "abc", `Expected ${key} to resolve`);
  }
  assertEqual(getH3CellId({}), "", "Expected empty properties to return empty string");
  assertEqual(getH3CellId(null), "", "Expected null properties to return empty string");

  const originalProps = { H3_INDEX: "cell-a", label: "kept" };
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: originalProps,
        geometry: { type: "Point", coordinates: [0, 0] },
      },
      {
        type: "Feature",
        properties: { cell_id: "cell-b" },
        geometry: { type: "Point", coordinates: [1, 1] },
      },
      {
        type: "Feature",
        properties: { CELL_ID: "cell-c" },
        geometry: { type: "Point", coordinates: [2, 2] },
      },
    ],
  };
  const joined = attachProbabilities(fc, { "cell-a": 0.7, "cell-c": Number.NaN });
  assertEqual(Number(joined.features[0].properties?.prob), 0.7, "Expected probability to attach by H3_INDEX");
  assertEqual(Number(joined.features[1].properties?.prob), 0, "Expected missing probability to become 0");
  assertEqual(Number(joined.features[2].properties?.prob), 0, "Expected invalid probability to become 0");
  assert(!("prob" in originalProps), "Expected input feature properties not to be mutated");
}
