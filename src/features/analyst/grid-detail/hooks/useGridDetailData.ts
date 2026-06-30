import { useEffect, useRef, useState } from "react";
import { getActualsPathForPeriod, getForecastPathForPeriod, type H3Resolution } from "../../../../shared/config/dataPaths";
import { loadForecast, loadForecastModelIds, loadGrid } from "../../../../shared/data/forecastIO";
import type { Period } from "../../../../shared/data/periods";
import type { GridDetailPayload, GridSeriesPoint, SpreadSeriesPoint } from "../types";
import { buildNeighborhoodSeed } from "../neighborhood/buildNeighborhoodSeed";
import { buildNeighborhoodContextPolygons } from "../neighborhood/neighborhoodGeometry";
import { toModelLabel } from "../utils/modelLabels";
import { computePercentile, quantile } from "../utils/statistics";

type Args = {
  open: boolean;
  cellId: string | null;
  periods: Period[];
  resolution: H3Resolution;
  modelId: string;
};

export function useGridDetailData({ open, cellId, periods, resolution, modelId }: Args) {
  const cacheRef = useRef<Map<string, GridDetailPayload>>(new Map());
  const [payload, setPayload] = useState<GridDetailPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cellId || periods.length === 0) return;
    const cacheKey = `${resolution}|${modelId}|${cellId}|${periods.map((period) => period.periodKey).join("|")}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPayload(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setPayload(null);
    setLoading(true);
    setError(null);

    (async () => {
      const firstForecastPath = getForecastPathForPeriod(resolution, periods[0].fileId);
      const availableModelIds = (
        await loadForecastModelIds(resolution, {
          kind: "explicit",
          explicitPath: firstForecastPath,
        }).catch(() => [])
      ).filter((candidate) => candidate !== "consensus");
      const modelSeriesSeed = new Map<string, { modelId: string; label: string; values: number[] }>(
        availableModelIds.map((candidate) => [
          candidate,
          {
            modelId: candidate,
            label: toModelLabel(candidate),
            values: [],
          },
        ])
      );
      const grid = await loadGrid(resolution).catch(() => null);
      const neighborhoodSeed = buildNeighborhoodSeed(cellId, grid);
      const neighborhoodContextPolygons = buildNeighborhoodContextPolygons(neighborhoodSeed, grid);
      const neighborhoodForecastSeries = new Map<string, number[]>();
      const neighborhoodActualSeries = new Map<string, number[]>();
      neighborhoodSeed.forEach((neighbor) => {
        neighborhoodForecastSeries.set(neighbor.cellId, []);
        neighborhoodActualSeries.set(neighbor.cellId, []);
      });

      const seriesRows = await Promise.all(
        periods.map(async (period) => {
          const forecastPath = getForecastPathForPeriod(resolution, period.fileId);
          const [focusedForecastPayload, actualPayload] = await Promise.all([
            loadForecast(resolution, {
              kind: "explicit",
              explicitPath: forecastPath,
              modelId,
            }).catch(() => ({ values: {} })),
            loadForecast(resolution, {
              kind: "explicit",
              explicitPath: getActualsPathForPeriod(resolution, period.fileId),
            }).catch(() => ({ values: {} })),
          ]);
          const forecastValues = focusedForecastPayload.values as Record<string, number>;
          const actualValues = actualPayload.values as Record<string, number>;
          neighborhoodSeed.forEach((neighbor) => {
            neighborhoodForecastSeries.get(neighbor.cellId)?.push(Number(forecastValues[neighbor.cellId] ?? 0));
            neighborhoodActualSeries.get(neighbor.cellId)?.push(Number(actualValues[neighbor.cellId] ?? 0));
          });
          const candidateSeries = await Promise.all(
            availableModelIds.map(async (candidate) => {
              const candidatePayload = await loadForecast(resolution, {
                kind: "explicit",
                explicitPath: forecastPath,
                modelId: candidate,
              }).catch(() => ({ values: {} }));
              const candidateValues = candidatePayload.values as Record<string, number>;
              const value = Number(candidateValues[cellId] ?? 0);
              modelSeriesSeed.get(candidate)?.values.push(value);
              return value;
            })
          );
          const rankedValues = Object.values(forecastValues)
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => a - b);
          const selectedValue = Number(forecastValues[cellId] ?? 0);

          return {
            point: {
              periodKey: period.periodKey,
              label: period.label,
              weekLabel: `${period.year}-W${String(period.stat_week).padStart(2, "0")}`,
              forecast: selectedValue,
              actual: Number(actualValues[cellId] ?? 0),
            } satisfies GridSeriesPoint,
            spread: {
              periodKey: period.periodKey,
              weekLabel: `${period.year}-W${String(period.stat_week).padStart(2, "0")}`,
              selected: selectedValue,
              min: quantile(candidateSeries, 0),
              max: quantile(candidateSeries, 1),
              p25: quantile(candidateSeries, 0.25),
              p75: quantile(candidateSeries, 0.75),
              percentile: computePercentile(selectedValue, rankedValues),
            } satisfies SpreadSeriesPoint,
          };
        })
      );

      return {
        selectedSeries: seriesRows.map((row) => row.point),
        modelSeries: Array.from(modelSeriesSeed.values()),
        spreadSeries: seriesRows.map((row) => row.spread),
        neighborhoodSeries: neighborhoodSeed.map((neighbor) => ({
          cellId: neighbor.cellId,
          label: neighbor.label,
          isSelected: neighbor.isSelected,
          ringIndex: neighbor.ringIndex,
          polygons: neighbor.polygons,
          forecast: neighborhoodForecastSeries.get(neighbor.cellId) ?? [],
          actual: neighborhoodActualSeries.get(neighbor.cellId) ?? [],
        })),
        neighborhoodContextPolygons,
      } satisfies GridDetailPayload;
    })()
      .then((nextPayload) => {
        if (!active) return;
        cacheRef.current.set(cacheKey, nextPayload);
        setPayload(nextPayload);
        setLoading(false);
      })
      .catch((nextError) => {
        if (!active) return;
        setLoading(false);
        setError(nextError instanceof Error ? nextError.message : "Unable to load grid detail");
      });

    return () => {
      active = false;
    };
  }, [cellId, modelId, open, periods, resolution]);

  return { payload, loading, error };
}
