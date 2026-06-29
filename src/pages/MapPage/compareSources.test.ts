import { createCompareOption, getComparePath } from "./compareSources";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

export function runCompareSourcesUnitTests() {
  const forecast = createCompareOption("forecast", "shared_model", "Shared Model");
  const actual = createCompareOption("actual", "shared_model", "Shared Model");

  assert(forecast.value !== actual.value, "Expected identical model IDs to have distinct compare option values");
  assert(
    getComparePath(forecast, "H4", "2026-W01").includes("/data/forecasts/latest/weekly/2026-W01_H4.json"),
    "Expected forecast option to resolve to forecast path"
  );
  assert(
    getComparePath(actual, "H4", "2026-W01").includes("/data/forecasts/latest/actuals/2026-W01_H4.json"),
    "Expected actual option to resolve to actuals path"
  );
}
