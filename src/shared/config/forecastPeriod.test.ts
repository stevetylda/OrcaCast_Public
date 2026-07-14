import { describe, expect, it } from "vitest";
import { buildPeriod, resolvePeriodsForSelection } from "./forecastPeriod";

describe("forecast period selection", () => {
  it("selects the current week and marks it unavailable when packaged data is stale", () => {
    const packaged = [
      { ...buildPeriod(2026, 25), forecastAvailable: true },
      { ...buildPeriod(2026, 26), forecastAvailable: true },
    ];
    const current = buildPeriod(2026, 29);

    const resolved = resolvePeriodsForSelection(packaged, null, current);
    const selected = resolved.periods[resolved.selectedIndex];

    expect(selected.periodKey).toBe(current.periodKey);
    expect(selected.forecastAvailable).toBe(false);
    expect(resolved.periods).toHaveLength(3);
  });

  it("uses the packaged current-week period when it exists", () => {
    const current = { ...buildPeriod(2026, 29), forecastAvailable: true };
    const resolved = resolvePeriodsForSelection(
      [{ ...buildPeriod(2026, 28), forecastAvailable: true }, current],
      null,
      buildPeriod(2026, 29),
    );

    expect(resolved.periods[resolved.selectedIndex]).toEqual(current);
    expect(resolved.periods).toHaveLength(2);
  });
});
