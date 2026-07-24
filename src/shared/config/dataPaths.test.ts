import { describe, expect, it } from "vitest";
import { getSmoothedForecastTilePath } from "./dataPaths";

describe("getSmoothedForecastTilePath", () => {
  it("uses one palette-independent tile manifest per forecast period", () => {
    expect(
      getSmoothedForecastTilePath(
        "forecasts/latest/weekly/srkw/kernel_decay_model",
        "2026-07-13",
      ),
    ).toContain("smoothed/tiles/2026-07-13/tilejson.json");
  });
});
