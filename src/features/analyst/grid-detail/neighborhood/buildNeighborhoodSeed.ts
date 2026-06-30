import { getH3CellId } from "../../../../shared/data/h3";
import type { NeighborhoodSeedEntry } from "../types";
import { computeFeatureCentroid, extractFeaturePolygons, squaredDistance } from "./neighborhoodGeometry";

type GridPayload = Awaited<ReturnType<typeof import("../../../../shared/data/forecastIO").loadGrid>>;

export function buildNeighborhoodSeed(
  cellId: string,
  grid: GridPayload | null
): NeighborhoodSeedEntry[] {
  const cells = (grid?.features ?? [])
    .map((feature) => {
      const props = (feature.properties as Record<string, unknown> | null) ?? null;
      const featureCellId = getH3CellId(props);
      const centroid = computeFeatureCentroid(feature.geometry);
      const polygons = extractFeaturePolygons(feature.geometry);
      if (!featureCellId || !centroid || polygons.length === 0) return null;
      return { cellId: featureCellId, centroid, polygons };
    })
    .filter((entry): entry is { cellId: string; centroid: [number, number]; polygons: number[][][][] } => entry !== null);
  const selected = cells.find((entry) => entry.cellId === cellId);
  if (!selected) {
    return [{ cellId, label: "Center", isSelected: true, ringIndex: 0, polygons: [] }];
  }
  const nearest = cells
    .filter((entry) => entry.cellId !== cellId)
    .map((entry) => ({
      ...entry,
      distance: squaredDistance(selected.centroid, entry.centroid),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6);
  return [selected, ...nearest].map((entry, index) => ({
    cellId: entry.cellId,
    label: index === 0 ? "Center" : `Neighbor ${index}`,
    isSelected: index === 0,
    ringIndex: index,
    polygons: entry.polygons,
  }));
}
