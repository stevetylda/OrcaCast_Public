import { KILOMETERS_PER_MILE } from "../../../shared/config/planner";
import type { UnitsMode } from "../../../shared/state/MapStateContext";

export function formatPlannerDistanceValue(
  miles: number | null | undefined,
  unitsMode: UnitsMode
) {
  if (typeof miles !== "number" || !Number.isFinite(miles) || miles <= 0) return "";
  const displayValue = unitsMode === "metric" ? miles * KILOMETERS_PER_MILE : miles;
  return String(Math.round(displayValue));
}

export function parsePlannerDistanceInput(value: string, unitsMode: UnitsMode) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return unitsMode === "metric" ? parsed / KILOMETERS_PER_MILE : parsed;
}

export function formatPlannerDistanceLabel(
  miles: number | null | undefined,
  unitsMode: UnitsMode
) {
  if (typeof miles !== "number" || !Number.isFinite(miles) || miles <= 0) return null;
  const displayValue = Math.round(
    unitsMode === "metric" ? miles * KILOMETERS_PER_MILE : miles
  );
  return `Up to ${displayValue} ${unitsMode === "metric" ? "km" : "mi"}`;
}

export function formatTravelRangeLabel(
  miles: number | undefined,
  unitsMode: UnitsMode
) {
  if (!miles || !Number.isFinite(miles) || miles <= 0) {
    return "Set an optional travel range";
  }
  if (unitsMode === "metric") {
    return `${Math.round(miles * KILOMETERS_PER_MILE)} km`;
  }
  return `${Math.round(miles)} miles`;
}
