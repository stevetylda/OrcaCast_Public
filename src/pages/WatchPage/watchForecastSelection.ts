import { selectLatestPeriod } from "../../shared/config/forecastPeriod";
import type { Period } from "../../shared/data/periods";

export type WatchForecastPeriodSelection = {
  status: "selected" | "fallback" | "unavailable";
  requestedPeriod: Period | null;
  displayedPeriod: Period | null;
};

export function resolveWatchForecastPeriods(
  periods: Period[],
  selectedIndex: number,
): WatchForecastPeriodSelection {
  const requestedPeriod =
    selectedIndex >= 0 && selectedIndex < periods.length
      ? periods[selectedIndex]
      : null;
  const latestAvailablePeriod = selectLatestPeriod(
    periods.filter((period) => period.forecastAvailable !== false),
  );
  const displayedPeriod =
    requestedPeriod?.forecastAvailable !== false
      ? requestedPeriod
      : latestAvailablePeriod;
  if (!displayedPeriod) {
    return { status: "unavailable", requestedPeriod, displayedPeriod: null };
  }
  return {
    status:
      requestedPeriod && requestedPeriod.periodKey !== displayedPeriod.periodKey
        ? "fallback"
        : "selected",
    requestedPeriod,
    displayedPeriod,
  };
}
