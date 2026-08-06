import type {
  TripPlanSelection,
  TripPlannerDraft,
  PlannerStorage,
} from "./plannerTypes";
import { clearStoredItinerary } from "../../itinerary/itineraryStorage";

export const PLANNER_SELECTION_STORAGE_KEY = "orcacast.planner.selection";
export const PLANNER_OPEN_STORAGE_KEY = "orcacast.planner.open";
export const PLANNER_DRAFT_STORAGE_KEY = "orcacast.planner.draft";
export const PLANNER_RECOMMENDED_PLACES_STORAGE_KEY =
  "orcacast.planner.recommended-places";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function defaultSessionStorage(): PlannerStorage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function parsePlannerSelection(
  value: unknown,
): TripPlanSelection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TripPlanSelection>;
  if (
    typeof candidate.city !== "string" ||
    !isIsoDate(candidate.arrivalDate) ||
    !isIsoDate(candidate.departureDate)
  ) {
    return null;
  }
  const maxTravelDistanceMiles = candidate.maxTravelDistanceMiles;
  if (
    maxTravelDistanceMiles !== undefined &&
    (typeof maxTravelDistanceMiles !== "number" ||
      !Number.isFinite(maxTravelDistanceMiles) ||
      maxTravelDistanceMiles <= 0)
  ) {
    return null;
  }
  return {
    city: candidate.city,
    arrivalDate: candidate.arrivalDate,
    departureDate: candidate.departureDate,
    maxTravelDistanceMiles,
  };
}

export function readStoredPlannerSelection(
  storage: PlannerStorage | null = defaultSessionStorage(),
): TripPlanSelection | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PLANNER_SELECTION_STORAGE_KEY);
    return raw ? parsePlannerSelection(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeStoredPlannerSelection(
  selection: TripPlanSelection | null,
  storage: PlannerStorage | null = defaultSessionStorage(),
) {
  if (!storage) return;
  if (selection)
    storage.setItem(PLANNER_SELECTION_STORAGE_KEY, JSON.stringify(selection));
  else storage.removeItem(PLANNER_SELECTION_STORAGE_KEY);
}

export function readStoredPlannerOpen(
  defaultValue: boolean,
  storage: PlannerStorage | null = defaultSessionStorage(),
) {
  if (!storage) return defaultValue;
  const stored = storage.getItem(PLANNER_OPEN_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return defaultValue;
}

export function writeStoredPlannerOpen(
  open: boolean,
  storage: PlannerStorage | null = defaultSessionStorage(),
) {
  storage?.setItem(PLANNER_OPEN_STORAGE_KEY, open ? "true" : "false");
}

export function readStoredPlannerDraft(
  storage: PlannerStorage | null = defaultSessionStorage(),
): TripPlannerDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PLANNER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TripPlannerDraft> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      city: typeof parsed.city === "string" ? parsed.city : "",
      arrivalDate:
        typeof parsed.arrivalDate === "string" ? parsed.arrivalDate : "",
      departureDate:
        typeof parsed.departureDate === "string" ? parsed.departureDate : "",
      maxTravelDistance:
        typeof parsed.maxTravelDistance === "string"
          ? parsed.maxTravelDistance
          : "",
      unitsMode:
        parsed.unitsMode === "metric" || parsed.unitsMode === "imperial"
          ? parsed.unitsMode
          : undefined,
    };
  } catch {
    return null;
  }
}

export function writeStoredPlannerDraft(
  draft: TripPlannerDraft | null,
  storage: PlannerStorage | null = defaultSessionStorage(),
) {
  if (!storage) return;
  if (draft) storage.setItem(PLANNER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  else storage.removeItem(PLANNER_DRAFT_STORAGE_KEY);
}

export function clearStoredPlannerState(
  storage: PlannerStorage | null = defaultSessionStorage(),
) {
  if (!storage) return;
  storage.removeItem(PLANNER_SELECTION_STORAGE_KEY);
  storage.removeItem(PLANNER_OPEN_STORAGE_KEY);
  storage.removeItem(PLANNER_DRAFT_STORAGE_KEY);
  storage.removeItem(PLANNER_RECOMMENDED_PLACES_STORAGE_KEY);
  clearStoredItinerary(storage);
}
