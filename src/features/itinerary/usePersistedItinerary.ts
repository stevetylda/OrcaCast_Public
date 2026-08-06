import { useCallback, useEffect, useState } from "react";
import { readStoredItinerary, writeStoredItinerary } from "./itineraryStorage";

export function usePersistedItinerary() {
  const [itineraryPlaceIds, setItineraryPlaceIds] =
    useState<string[]>(readStoredItinerary);

  useEffect(() => {
    writeStoredItinerary(itineraryPlaceIds);
  }, [itineraryPlaceIds]);

  const clearItinerary = useCallback(() => setItineraryPlaceIds([]), []);

  return {
    itineraryPlaceIds,
    setItineraryPlaceIds,
    clearItinerary,
  };
}
