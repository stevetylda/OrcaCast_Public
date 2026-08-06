export const PLANNER_ITINERARY_STORAGE_KEY = "orcacast.planner.itinerary.v1";

export type ItineraryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

function defaultSessionStorage(): ItineraryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function parseItineraryPlaceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const placeIds: string[] = [];
  value.forEach((item) => {
    if (typeof item !== "string" || item.length === 0 || seen.has(item)) return;
    seen.add(item);
    placeIds.push(item);
  });
  return placeIds;
}

export function readStoredItinerary(
  storage: ItineraryStorage | null = defaultSessionStorage(),
): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(PLANNER_ITINERARY_STORAGE_KEY);
    return raw ? parseItineraryPlaceIds(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeStoredItinerary(
  placeIds: readonly string[],
  storage: ItineraryStorage | null = defaultSessionStorage(),
): void {
  if (!storage) return;
  const normalized = parseItineraryPlaceIds(placeIds);
  if (normalized.length === 0) {
    storage.removeItem(PLANNER_ITINERARY_STORAGE_KEY);
    return;
  }
  storage.setItem(PLANNER_ITINERARY_STORAGE_KEY, JSON.stringify(normalized));
}

export function clearStoredItinerary(
  storage: ItineraryStorage | null = defaultSessionStorage(),
): void {
  storage?.removeItem(PLANNER_ITINERARY_STORAGE_KEY);
}
