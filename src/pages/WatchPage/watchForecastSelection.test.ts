import { describe, expect, it } from "vitest";
import { buildPeriod } from "../../shared/config/forecastPeriod";
import { resolveWatchForecastPeriods } from "./watchForecastSelection";

describe("Watch forecast selection", () => {
  it("skips a declared-unavailable request and selects the latest available layer", () => {
    const available = {
      ...buildPeriod(2026, 29),
      forecastAvailable: true,
    };
    const unavailable = {
      ...buildPeriod(2026, 31),
      forecastAvailable: false,
    };

    expect(resolveWatchForecastPeriods([available, unavailable], 1)).toEqual({
      status: "fallback",
      requestedPeriod: unavailable,
      displayedPeriod: available,
    });
  });

  it("fails closed when no period is available", () => {
    const unavailable = {
      ...buildPeriod(2026, 31),
      forecastAvailable: false,
    };
    expect(resolveWatchForecastPeriods([unavailable], 0)).toEqual({
      status: "unavailable",
      requestedPeriod: unavailable,
      displayedPeriod: null,
    });
  });
});
