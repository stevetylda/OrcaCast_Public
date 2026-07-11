import { useEffect } from "react";
import type { UnitsMode } from "../../../shared/state/MapStateContext";
import type { TripPlanSelection, TripPlannerDraft } from "../model/plannerTypes";
import {
  writeStoredPlannerDraft,
  writeStoredPlannerOpen,
  writeStoredPlannerSelection,
} from "../model/plannerStorage";

type Args = {
  selection: TripPlanSelection | null;
  plannerOpen: boolean;
  draftCity: string;
  draftArrivalDate: string;
  draftDepartureDate: string;
  draftMaxTravelDistance: string;
  unitsMode: UnitsMode;
};

export function usePlannerPersistence({
  selection,
  plannerOpen,
  draftCity,
  draftArrivalDate,
  draftDepartureDate,
  draftMaxTravelDistance,
  unitsMode,
}: Args) {
  useEffect(() => writeStoredPlannerSelection(selection), [selection]);
  useEffect(() => writeStoredPlannerOpen(plannerOpen), [plannerOpen]);
  useEffect(() => {
    const hasDraft =
      draftCity.trim().length > 0 ||
      draftArrivalDate.length > 0 ||
      draftDepartureDate.length > 0 ||
      draftMaxTravelDistance.trim().length > 0;
    const draft: TripPlannerDraft | null = hasDraft
      ? {
          city: draftCity,
          arrivalDate: draftArrivalDate,
          departureDate: draftDepartureDate,
          maxTravelDistance: draftMaxTravelDistance,
          unitsMode,
        }
      : null;
    writeStoredPlannerDraft(draft);
  }, [draftArrivalDate, draftCity, draftDepartureDate, draftMaxTravelDistance, unitsMode]);
}
