export type PlannerBaseLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

const BASE_LOCATION_URL = resolveAppAssetPath(
  "data/places/base_locations.json",
);

function isPlannerBaseLocation(value: unknown): value is PlannerBaseLocation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlannerBaseLocation>;
  return (
    typeof candidate.name === "string" &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude)
  );
}

export async function loadPlannerBaseLocations(): Promise<
  PlannerBaseLocation[]
> {
  const response = await fetch(BASE_LOCATION_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to load planner base locations (${response.status})`,
    );
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("Planner base locations payload must be an array");
  }
  const items = payload.filter(isPlannerBaseLocation);
  if (items.length === 0) {
    throw new Error("Planner base locations payload has no valid locations");
  }
  return items;
}
import { resolveAppAssetPath } from "../config/basePath";
