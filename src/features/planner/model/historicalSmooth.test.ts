import { describe, expect, it } from "vitest";
import { buildTripPlannerRangeFromDates } from "../../../shared/data/tripPlanner";
import {
  buildHistoricalSmoothSources,
  buildHistoricalSmoothWeekWeights,
} from "./historicalSmooth";

describe("planner historical smooth weighting", () => {
  it("weights partial ISO weeks by their share of selected days", () => {
    const range = buildTripPlannerRangeFromDates("2026-06-29", "2026-07-08");
    expect(range).not.toBeNull();
    expect(buildHistoricalSmoothWeekWeights(range!)).toEqual([
      { week: 27, dayCount: 7, weight: 0.7 },
      { week: 28, dayCount: 3, weight: 0.3 },
    ]);
  });

  it("builds only planner historical smooth paths for the requested ecotype", () => {
    const range = buildTripPlannerRangeFromDates("2026-07-06", "2026-07-12");
    expect(range).not.toBeNull();
    expect(buildHistoricalSmoothSources(range!, "transient")).toEqual([
      {
        path: "/data/week_of_year_agg_history_smooth/transient/week_28.tif",
        weight: 1,
      },
    ]);
  });
});
