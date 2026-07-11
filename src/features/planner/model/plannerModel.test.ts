import {
  parsePlannerSelection,
  readStoredPlannerSelection,
  PLANNER_SELECTION_STORAGE_KEY,
} from "./plannerStorage";
import { formatPlannerDistanceValue, parsePlannerDistanceInput } from "./plannerDistance";
import {
  buildHighlightedDays,
  buildSeasonalWeekBars,
  computeRelativeActivity,
  seasonalWeekIndex,
} from "../../seasonal-activity/seasonalActivity";
import { applyTripBrushDelta, buildRadiusFitLocations } from "./plannerChart";
import { escapeXml } from "../exports/itineraryExport";

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  },
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Values are not deeply equal");
  },
  ok(value: unknown) {
    if (!value) throw new Error("Expected value to be truthy");
  },
};

export function runPlannerModelUnitTests() {
  assert.deepEqual(
    parsePlannerSelection({
      city: "Friday Harbor",
      arrivalDate: "2026-07-10",
      departureDate: "2026-07-12",
      maxTravelDistanceMiles: 25,
    }),
    {
      city: "Friday Harbor",
      arrivalDate: "2026-07-10",
      departureDate: "2026-07-12",
      maxTravelDistanceMiles: 25,
    }
  );
  assert.equal(parsePlannerSelection({ city: "x", arrivalDate: "not-a-date", departureDate: "2026-07-12" }), null);
  assert.equal(parsePlannerSelection({ city: "x", arrivalDate: "2026-07-10", departureDate: "2026-07-12", maxTravelDistanceMiles: -1 }), null);

  const storage = new Map<string, string>();
  const storageAdapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  };
  storage.set(PLANNER_SELECTION_STORAGE_KEY, "{");
  assert.equal(readStoredPlannerSelection(storageAdapter), null);

  assert.equal(formatPlannerDistanceValue(10, "metric"), "16");
  assert.ok(Math.abs((parsePlannerDistanceInput("16.0934", "metric") ?? 0) - 10) < 0.0001);

  const highlighted = buildHighlightedDays(364, 3, true);
  assert.equal(highlighted.has(365), true);
  assert.equal(highlighted.has(2), true);
  assert.equal(highlighted.has(100), false);

  const bars = buildSeasonalWeekBars(
    [
      { day_of_year: 1, count: 2 },
      { day_of_year: 8, count: 4 },
    ],
    new Set([8])
  );
  assert.equal(bars[0]?.count, 2);
  assert.equal(bars[1]?.count, 4);
  assert.equal(bars[1]?.highlighted, true);
  assert.equal(computeRelativeActivity([], 0), null);
  assert.equal(computeRelativeActivity([{ count: 0 }, { count: 0 }], 0), null);
  assert.equal(seasonalWeekIndex(new Date("2026-01-08T12:00:00Z")), 1);

  assert.deepEqual(
    applyTripBrushDelta(
      { city: "Friday Harbor", arrivalDate: "2026-07-10", departureDate: "2026-07-12" },
      "move",
      2
    ),
    { city: "Friday Harbor", arrivalDate: "2026-07-12", departureDate: "2026-07-14" }
  );
  const radiusPoints = buildRadiusFitLocations(48.52, -123.01, 20);
  assert.equal(radiusPoints.length, 4);
  assert.equal(escapeXml(`<stop name="Orca & Co">`), "&lt;stop name=&quot;Orca &amp; Co&quot;&gt;");
}
