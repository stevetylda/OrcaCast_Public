import { useEffect, useState } from "react";
import type { H3Resolution } from "../../../shared/config/dataPaths";
import {
  aggregateTripPlannerOccurrence,
  loadTripPlannerOccurrencePayload,
  type TripPlannerOccurrenceResult,
  type TripPlannerRange,
} from "../../../shared/data/tripPlanner";

type State = {
  key: string;
  occurrence: TripPlannerOccurrenceResult | null;
  error: string | null;
};

type Result = Omit<State, "key"> & { loading: boolean };

export function useTripOccurrence(
  range: TripPlannerRange | null,
  resolution: H3Resolution,
): Result {
  const requestKey = range
    ? `${resolution}:${range.startDate}:${range.endDate}`
    : "";
  const [state, setState] = useState<State>({
    key: "",
    occurrence: null,
    error: null,
  });

  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    loadTripPlannerOccurrencePayload(resolution)
      .then((payload) => {
        if (!cancelled) {
          setState({
            key: requestKey,
            occurrence: aggregateTripPlannerOccurrence(payload, range),
            error: null,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            key: requestKey,
            occurrence: null,
            error:
              error instanceof Error
                ? error.message
                : "Trip planner data could not be loaded.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range, requestKey, resolution]);

  if (!range) return { occurrence: null, loading: false, error: null };
  if (state.key !== requestKey)
    return { occurrence: null, loading: true, error: null };
  return { occurrence: state.occurrence, loading: false, error: state.error };
}
