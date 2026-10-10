import { describe, expect, it } from "vitest";
import {
  PLANNER_ITINERARY_STORAGE_KEY,
  parseItineraryPlaceIds,
  readStoredItinerary,
  writeStoredItinerary,
  type ItineraryStorage,
} from "./itineraryStorage";

function createStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(PLANNER_ITINERARY_STORAGE_KEY, initial);
  const storage: ItineraryStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
  return { storage, values };
}

describe("itinerary storage", () => {
  it("rejects malformed values and deduplicates IDs in order", () => {
    expect(parseItineraryPlaceIds(null)).toEqual([]);
    expect(parseItineraryPlaceIds(["a", 2, "b", "a", ""])).toEqual(["a", "b"]);
    expect(readStoredItinerary(createStorage("{").storage)).toEqual([]);
  });

  it("preserves the v1 string-array wire format", () => {
    const { storage, values } = createStorage();
    writeStoredItinerary(["first", "second", "first"], storage);
    expect(values.get(PLANNER_ITINERARY_STORAGE_KEY)).toBe(
      '["first","second"]',
    );
    expect(readStoredItinerary(storage)).toEqual(["first", "second"]);
  });

  it("removes the storage key when the itinerary is empty", () => {
    const { storage, values } = createStorage('["first"]');
    writeStoredItinerary([], storage);
    expect(values.has(PLANNER_ITINERARY_STORAGE_KEY)).toBe(false);
  });
});
