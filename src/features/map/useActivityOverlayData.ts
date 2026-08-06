import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { GRID_PATH } from "../../shared/config/dataPaths";
import type { H3Resolution } from "../../shared/config/dataPaths";
import {
  normalizeDataLoadError,
  type DataLoadError,
} from "../../shared/data/errors";
import { attachProbabilities, loadGrid } from "../../shared/data/forecastIO";
import { buildAutoColorExprFromValues } from "../../shared/geo/colorScale";
import { removeGridOverlay } from "../../shared/geo/gridOverlay";
import type { HeatScale } from "../../shared/geo/colorScale";
import type { FillColorSpec } from "./types";

type UseActivityOverlayDataArgs = {
  resolution: H3Resolution;
  mapReady: boolean;
  modelId: string;
  activityValues: Record<string, number> | null;
  forecastOverlayEnabled?: boolean;
  colorNoData?: boolean;
  pulseAllGridCells?: boolean;
  overlayLoadKey?: string;
  onGridCellCount?: (count: number) => void;
  useExternalColorScale: boolean;
  paletteColors: string[];
  mapRef: MutableRefObject<MapLibreMap | null>;
  overlayRef: MutableRefObject<FeatureCollection | null>;
  fillExprRef: MutableRefObject<FillColorSpec | null>;
  legendSpecRef: MutableRefObject<HeatScale | null>;
  hotspotThresholdRef: MutableRefObject<number | undefined>;
  modeledHotspotThresholdRef: MutableRefObject<number | undefined>;
  valuesByCellRef: MutableRefObject<Record<string, number>>;
  colorScaleValuesRef: MutableRefObject<Record<string, number> | undefined>;
  sortedValuesDescRef: MutableRefObject<number[]>;
  totalCellsRef: MutableRefObject<number>;
  shimmerThresholdRef: MutableRefObject<number | undefined>;
  setLegendSpec: Dispatch<SetStateAction<HeatScale | null>>;
  scheduleForecastRender: (
    map: MapLibreMap,
    isCancelled?: () => boolean,
    onRendered?: () => void,
  ) => void;
  onFatalDataError?: (error: DataLoadError) => void;
  onOverlayLoaded?: () => void;
  onOverlayRendered?: () => void;
};

export function useActivityOverlayData({
  resolution,
  mapReady,
  modelId,
  activityValues,
  forecastOverlayEnabled = true,
  colorNoData = false,
  pulseAllGridCells = false,
  overlayLoadKey,
  onGridCellCount,
  useExternalColorScale,
  paletteColors,
  mapRef,
  overlayRef,
  fillExprRef,
  legendSpecRef,
  hotspotThresholdRef,
  modeledHotspotThresholdRef,
  valuesByCellRef,
  colorScaleValuesRef,
  sortedValuesDescRef,
  totalCellsRef,
  shimmerThresholdRef,
  setLegendSpec,
  scheduleForecastRender,
  onFatalDataError,
  onOverlayLoaded,
  onOverlayRendered,
}: UseActivityOverlayDataArgs) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!forecastOverlayEnabled || activityValues === null) {
      removeGridOverlay(map);
      overlayRef.current = null;
      fillExprRef.current = null;
      legendSpecRef.current = null;
      hotspotThresholdRef.current = undefined;
      modeledHotspotThresholdRef.current = undefined;
      shimmerThresholdRef.current = undefined;
      sortedValuesDescRef.current = [];
      totalCellsRef.current = 0;
      valuesByCellRef.current = {};
      setLegendSpec(null);
      onGridCellCount?.(0);
      if (!forecastOverlayEnabled) onOverlayLoaded?.();
      return;
    }

    const DEBUG_MAP =
      import.meta.env.DEV &&
      typeof window !== "undefined" &&
      ((window as { __ORCACAST_DEBUG_MAP?: boolean }).__ORCACAST_DEBUG_MAP ===
        true ||
        window.localStorage?.getItem("orcacast.debug.map") === "true");

    const applyScaleToCurrentValues = (values: Record<string, number>) => {
      const scaleSourceValues =
        useExternalColorScale &&
        colorScaleValuesRef.current &&
        Object.keys(colorScaleValuesRef.current).length > 0
          ? colorScaleValuesRef.current
          : values;
      const { fillColorExpr, scale } = buildAutoColorExprFromValues(
        scaleSourceValues,
        paletteColors,
        ["get", "prob"],
        colorNoData,
      );
      const valueList = Object.values(values)
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
        .sort((a, b) => a - b);
      fillExprRef.current = fillColorExpr as unknown as FillColorSpec;
      legendSpecRef.current = scale;
      setLegendSpec(scale);
      modeledHotspotThresholdRef.current =
        scale?.hotspotThreshold ??
        (valueList.length > 0 ? Math.max(...valueList) : undefined);
      hotspotThresholdRef.current = modeledHotspotThresholdRef.current;
      shimmerThresholdRef.current = pulseAllGridCells
        ? 0
        : valueList.length > 0
          ? valueList[Math.max(0, Math.floor(valueList.length * 0.95) - 1)]
          : undefined;
    };

    let cancelled = false;

    const loadOverlay = async () => {
      try {
        const grid = await loadGrid(resolution);
        const values = activityValues;

        if (cancelled) return;

        const joined = attachProbabilities(grid, values, "prob");
        applyScaleToCurrentValues(values);

        if (DEBUG_MAP) {
          const vals = Object.values(values)
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v));
          const positiveVals = vals.filter((v) => v > 0);
          console.info("[MapDebug] forecastLoaded", {
            resolution,
            modelId,
            overlayLoadKey: overlayLoadKey ?? null,
            positiveCount: positiveVals.length,
            min: positiveVals.length ? Math.min(...positiveVals) : null,
            median: positiveVals.length
              ? positiveVals.slice().sort((a, b) => a - b)[
                  Math.floor(positiveVals.length / 2)
                ]
              : null,
            p90: positiveVals.length
              ? positiveVals.slice().sort((a, b) => a - b)[
                  Math.floor(positiveVals.length * 0.9)
                ]
              : null,
            max: positiveVals.length ? Math.max(...positiveVals) : null,
          });
        }

        const featureValues = (joined.features ?? [])
          .map(
            (feature) =>
              (feature.properties as Record<string, unknown> | null)?.prob,
          )
          .filter(
            (value): value is number =>
              typeof value === "number" && Number.isFinite(value),
          );
        sortedValuesDescRef.current = [...featureValues].sort((a, b) => b - a);
        totalCellsRef.current = featureValues.length;
        onGridCellCount?.(featureValues.length);
        valuesByCellRef.current = values;
        overlayRef.current = joined;
        onOverlayLoaded?.();
        if (DEBUG_MAP) {
          console.info("[MapDebug] overlayLoaded", {
            resolution,
            modelId,
            featureCount: joined.features?.length ?? 0,
            nonZeroValues: Object.values(values).filter(
              (value) => Number(value) > 0,
            ).length,
            nonZeroJoinedFeatures: featureValues.filter((value) => value > 0)
              .length,
            overlayLoadKey,
          });
        }
        scheduleForecastRender(map, () => cancelled, onOverlayRendered);
      } catch (err) {
        console.warn("[Forecast] failed to load grid", err);
        onFatalDataError?.(normalizeDataLoadError(err, GRID_PATH[resolution]));
      }
    };

    loadOverlay();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resolution,
    mapReady,
    forecastOverlayEnabled,
    modelId,
    activityValues,
    pulseAllGridCells,
    overlayLoadKey,
    colorNoData,
    onGridCellCount,
    useExternalColorScale,
    paletteColors,
    onFatalDataError,
    // refs and callbacks are intentionally omitted to keep this aligned with the original
    // "load on relevant input changes" behavior rather than rerunning on every render.
  ]);
}
