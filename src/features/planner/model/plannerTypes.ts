import type { UnitsMode } from "../../../shared/state/MapStateContext";

export type TripPlanSelection = {
  city: string;
  arrivalDate: string;
  departureDate: string;
  maxTravelDistanceMiles?: number;
};

export type TripPlannerDraft = {
  city: string;
  arrivalDate: string;
  departureDate: string;
  maxTravelDistance: string;
  unitsMode?: UnitsMode;
};

export type PlannerStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
