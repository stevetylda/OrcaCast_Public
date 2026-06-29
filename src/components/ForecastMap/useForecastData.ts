import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { FeatureCollection } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { GRID_PATH } from "../../config/dataPaths";
import type { H3Resolution } from "../../config/dataPaths";
import { normalizeDataLoadError, type DataLoadError } from "../../data/errors";
import { attachProbabilities, loadForecast, loadGrid } from "../../data/forecastIO";
import { buildAutoColorExprFromValues } from "../../map/colorScale";
import type { HeatScale } from "../../map/colorScale";
import type { FillColorSpec } from "./types";

type UseForecastDataArgs = {
  resolution: H3Resolution;
  mapReady: boolean;
  forecastPath?: string;
  fallbackForecastPath?: string;
  modelId: string;
  derivedValuesByCell?: Record<string, number>;
  derivedValueProperty: string;
  derivedFillExpr?: unknown[];
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
  derivedValuePropertyRef: MutableRefObject<string>;
  derivedFillExprRef: MutableRefObject<FillColorSpec | undefined>;
  sortedValuesDescRef: MutableRefObject<number[]>;
  totalCellsRef: MutableRefObject<number>;
  shimmerThresholdRef: MutableRefObject<number | undefined>;
  setLegendSpec: Dispatch<SetStateAction<HeatScale | null>>;
  scheduleForecastRender: (map: MapLibreMap, isCancelled?: () => boolean) => void;
  onFatalDataError?: (error: DataLoadError) => void;
};

export function useForecastData({
  resolution,
  mapReady,
  forecastPath,
  fallbackForecastPath,
  modelId,
  derivedValuesByCell,
  derivedValueProperty,
  derivedFillExpr,
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
  derivedValuePropertyRef,
  derivedFillExprRef,
  sortedValuesDescRef,
  totalCellsRef,
  shimmerThresholdRef,
  setLegendSpec,
  scheduleForecastRender,
  onFatalDataError,
}: UseForecastDataArgs) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const DEBUG_MAP =
      import.meta.env.DEV &&
      typeof window !== "undefined" &&
      ((window as { __ORCACAST_DEBUG_MAP?: boolean }).__ORCACAST_DEBUG_MAP === true ||
        window.localStorage?.getItem("orcacast.debug.map") === "true");

    const applyScaleToCurrentValues = (values: Record<string, number>) => {
      const scaleSourceValues =
        useExternalColorScale && colorScaleValuesRef.current && Object.keys(colorScaleValuesRef.current).length > 0
          ? colorScaleValuesRef.current
          : values;
      const { fillColorExpr, scale } = buildAutoColorExprFromValues(scaleSourceValues, paletteColors);
      const valueList = Object.values(values)
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
        .sort((a, b) => a - b);
      fillExprRef.current = fillColorExpr as unknown as FillColorSpec;
      legendSpecRef.current = scale;
      setLegendSpec(scale);
      modeledHotspotThresholdRef.current =
        scale?.hotspotThreshold ?? (valueList.length > 0 ? Math.max(...valueList) : undefined);
      hotspotThresholdRef.current = modeledHotspotThresholdRef.current;
      shimmerThresholdRef.current =
        valueList.length > 0 ? valueList[Math.max(0, Math.floor(valueList.length * 0.95) - 1)] : undefined;
    };

    let cancelled = false;

    const loadOverlay = async () => {
      try {
        const grid = await loadGrid(resolution);
        let values: Record<string, number> = {};
        const usingDerivedValues = Boolean(derivedValuesByCell);
        const valueProperty = derivedValuePropertyRef.current || "prob";

        if (usingDerivedValues) {
          values = derivedValuesByCell ?? {};
        } else {
          try {
            let forecast;
            if (forecastPath) {
              try {
                forecast = await loadForecast(resolution, { kind: "explicit", explicitPath: forecastPath, modelId });
              } catch (err) {
                if (fallbackForecastPath && fallbackForecastPath !== forecastPath) {
                  console.warn("[Forecast] explicit path failed, falling back to latest period", err);
                  forecast = await loadForecast(resolution, {
                    kind: "explicit",
                    explicitPath: fallbackForecastPath,
                    modelId,
                  });
                } else {
                  throw err;
                }
              }
            } else if (fallbackForecastPath) {
              forecast = await loadForecast(resolution, {
                kind: "explicit",
                explicitPath: fallbackForecastPath,
                modelId,
              });
            }
            values = forecast?.values ?? {};
          } catch (err) {
            console.warn("[Forecast] failed to load", err);
            onFatalDataError?.(
              normalizeDataLoadError(
                err,
                forecastPath ?? fallbackForecastPath ?? `forecast:${resolution}`
              )
            );
            return;
          }
        }

        if (cancelled) return;

        const joined = attachProbabilities(grid, values, valueProperty);
        if (usingDerivedValues) {
          legendSpecRef.current = null;
          setLegendSpec(null);
          fillExprRef.current = derivedFillExprRef.current ?? fillExprRef.current;
          hotspotThresholdRef.current = undefined;
          modeledHotspotThresholdRef.current = undefined;
          shimmerThresholdRef.current = undefined;
        } else {
          applyScaleToCurrentValues(values);
        }

        if (DEBUG_MAP) {
          const vals = Object.values(values)
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v));
          const positiveVals = vals.filter((v) => v > 0);
          console.info("[MapDebug] forecastLoaded", {
            resolution,
            modelId,
            loadedPath: forecastPath ?? fallbackForecastPath ?? null,
            positiveCount: positiveVals.length,
            min: positiveVals.length ? Math.min(...positiveVals) : null,
            median: positiveVals.length
              ? positiveVals.slice().sort((a, b) => a - b)[Math.floor(positiveVals.length / 2)]
              : null,
            p90: positiveVals.length
              ? positiveVals.slice().sort((a, b) => a - b)[Math.floor(positiveVals.length * 0.9)]
              : null,
            max: positiveVals.length ? Math.max(...positiveVals) : null,
          });
        }

        const featureValues = (joined.features ?? [])
          .map((feature) => Number((feature.properties as Record<string, unknown> | null)?.[valueProperty] ?? 0))
          .filter((v) => Number.isFinite(v));
        sortedValuesDescRef.current = [...featureValues].sort((a, b) => b - a);
        totalCellsRef.current = featureValues.length;
        onGridCellCount?.(featureValues.length);
        valuesByCellRef.current = values;
        overlayRef.current = joined;
        if (DEBUG_MAP) {
          console.info("[MapDebug] overlayLoaded", {
            resolution,
            modelId,
            featureCount: joined.features?.length ?? 0,
            nonZeroValues: Object.values(values).filter((value) => Number(value) > 0).length,
            nonZeroJoinedFeatures: featureValues.filter((value) => value > 0).length,
            forecastPath,
            fallbackForecastPath,
          });
        }
        scheduleForecastRender(map, () => cancelled);
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
    forecastPath,
    fallbackForecastPath,
    modelId,
    derivedValuesByCell,
    derivedValueProperty,
    derivedFillExpr,
    onGridCellCount,
    useExternalColorScale,
    paletteColors,
    onFatalDataError,
    // refs and callbacks are intentionally omitted to keep this aligned with the original
    // "load on relevant input changes" behavior rather than rerunning on every render.
  ]);
}
