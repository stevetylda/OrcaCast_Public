export type PlannerBaseLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

const BASE_LOCATION_URL_CANDIDATES = [
  `${(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/")}data/places/base_locations.json`,
  "/data/places/base_locations.json",
  "data/places/base_locations.json",
];

function isPlannerBaseLocation(value: unknown): value is PlannerBaseLocation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlannerBaseLocation>;
  return (
    typeof candidate.name === "string" &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude)
  );
}

export async function loadPlannerBaseLocations(): Promise<PlannerBaseLocation[]> {
  for (const url of BASE_LOCATION_URL_CANDIDATES) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) continue;
      const items = payload.filter(isPlannerBaseLocation);
      if (items.length > 0) return items;
    } catch {
      // Try next candidate URL.
    }
  }

  throw new Error("Failed to load planner base locations");
}
