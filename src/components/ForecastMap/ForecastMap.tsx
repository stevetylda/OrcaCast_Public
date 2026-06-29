import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { LAST_WEEK_LAYER_CONFIG } from "../../config/mapLayers";
import type { Period } from "../../data/periods";
import {
  addGridOverlay,
  setGridBaseVisibility,
  setGridCoreLayerVisibility,
  setGridHoverCell,
  setGridVisibility,
  setHotspotVisibility,
} from "../../map/gridOverlay";
import { buildAutoColorExprFromValues, buildFillExprFromScale, buildHotspotOnlyExpr } from "../../map/colorScale";
import type { HeatScale } from "../../map/colorScale";
import { buildSmoothSurfaceOverlay, emptyTransparentDataUrl, upsertSmoothSurface } from "../../map/smoothSurface";
import { isoWeekFromDate } from "../../core/time/forecastPeriodToIsoWeek";
import { debounce, resolveLayerSource, type ResolvedLayerSource } from "../../map/sourceBackend";
import { getPaletteOrDefault } from "../../constants/palettes";
import { getDataVersionToken } from "../../data/meta";
import { trackLayerRebuild, trackRender } from "../../debug/perf";
import { MapControls } from "./MapControls";
import { createGridInteractionHandlers } from "./MapInteractions";
import { applyBasemapVisualTuning, applyLastWeekModeFilters, createGridLayerBuildSignature, DARK_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM, ensureLastWeekLayer, LAST_WEEK_HALO_ID, LAST_WEEK_LAYER_ID, LAST_WEEK_RING_ID, LAST_WEEK_SOURCE_ID, LAST_WEEK_VECTOR_SOURCE_ID, LAST_WEEK_WHITE_ID, moveLastWeekToTop, VOYAGER_STYLE } from "./buildLayers";
import { useForecastData } from "./useForecastData";
import { useHotspotAnimation } from "./useHotspotAnimation";
import type { FillColorSpec, ForecastMapHandle, ForecastMapProps, LastWeekMode, LngLat, SparklineSeries } from "./types";

const SMOOTH_SOURCE_ID = "forecast-smooth-surface";
const SMOOTH_LAYER_ID = "forecast-smooth-surface-layer";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function waitForMapRender(map: MapLibreMap, timeoutMs = 2500) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(true);
    };
    map.once("render", () => window.requestAnimationFrame(finish));
    map.triggerRepaint();
  });
}

function safeApplyBasemapVisualTuning(map: MapLibreMap, isDarkBasemap: boolean) {
  try {
    const style = map.getStyle();
    if (!style || !Array.isArray(style.layers) || style.layers.length === 0) {
      return false;
    }
    applyBasemapVisualTuning(map, isDarkBasemap);
    return true;
  } catch {
    return false;
  }
}

function setLastWeekVisibility(map: MapLibreMap, visible: boolean) {
  const visibility = visible ? "visible" : "none";
  [LAST_WEEK_LAYER_ID, LAST_WEEK_HALO_ID, LAST_WEEK_RING_ID, LAST_WEEK_WHITE_ID].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
  });
}

function setSmoothLayerVisibility(map: MapLibreMap, visible: boolean) {
  if (map.getLayer(SMOOTH_LAYER_ID)) {
    map.setLayoutProperty(SMOOTH_LAYER_ID, "visibility", visible ? "visible" : "none");
  }
}

function ensureSmoothSurfaceLayer(map: MapLibreMap) {
  if (!map.getSource(SMOOTH_SOURCE_ID)) {
    map.addSource(SMOOTH_SOURCE_ID, {
      type: "image",
      url: emptyTransparentDataUrl(),
      coordinates: [[-180, 85], [180, 85], [180, -85], [-180, -85]],
    });
  }
  if (!map.getLayer(SMOOTH_LAYER_ID)) {
    map.addLayer(
      {
        id: SMOOTH_LAYER_ID,
        type: "raster",
        source: SMOOTH_SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "raster-opacity": 0.98,
          "raster-resampling": "linear",
          "raster-brightness-max": 1,
          "raster-contrast": 0.14,
          "raster-saturation": 0.12,
        },
      },
      "grid-fill"
    );
  }
}

function resolveScaleColor(scale: HeatScale, value: number) {
  if (!Number.isFinite(value) || value <= 0) return scale.binColorsRgba[0] ?? "rgba(0,0,0,0)";
  for (let index = 0; index < scale.thresholds.length; index += 1) {
    if (value < scale.thresholds[index]) {
      return scale.binColorsRgba[Math.min(index, scale.binColorsRgba.length - 1)] ?? scale.binColorsRgba[0] ?? "rgba(0,0,0,0)";
    }
  }
  return scale.binColorsRgba[scale.binColorsRgba.length - 1] ?? scale.binColorsRgba[0] ?? "rgba(0,0,0,0)";
}

function getPreviousWeek(year: number, week: number) {
  if (week > 1) return { year, week: week - 1 };
  return { year: year - 1, week: isoWeekFromDate(new Date(Date.UTC(year - 1, 11, 28))) };
}

function tagSightings(
  data: FeatureCollection,
  mode: LastWeekMode,
  selected: { year: number; week: number },
  previous: { year: number; week: number }
): FeatureCollection {
  if (mode === "none") return { ...data, features: [] };

  const parseNum = (value: unknown): number => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const cleaned = value.trim().replace(/[^0-9]/g, "");
      return cleaned.length ? Number(cleaned) : Number.NaN;
    }
    return Number.NaN;
  };

  const rows = (data.features ?? []).map((feature) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    return {
      feature,
      props,
      year: parseNum(props.YEAR ?? props.year ?? props.Year),
      week: parseNum(props.WEEK ?? props.week ?? props.Week ?? props.STAT_WEEK ?? props.stat_week ?? props.Stat_Week),
    };
  });

  return {
    ...data,
    features: rows.flatMap((row) => {
      let sightingMode: "previous" | "selected" | null = null;
      if (Number.isFinite(row.week)) {
        if (Number.isFinite(row.year)) {
          if (row.year === previous.year && row.week === previous.week) sightingMode = "previous";
          if (row.year === selected.year && row.week === selected.week) sightingMode = "selected";
        } else {
          if (row.week === previous.week) sightingMode = "previous";
          if (row.week === selected.week) sightingMode = "selected";
        }
      } else {
        sightingMode = mode === "previous" ? "previous" : "selected";
      }

      if (!sightingMode) return [];
      if (mode === "previous" && sightingMode !== "previous") return [];
      if (mode === "selected" && sightingMode !== "selected") return [];

      return [{ ...row.feature, properties: { ...row.props, sightingMode } }];
    }),
  };
}

function coerceExpectedActivityHotspotCellCount(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.max(0, Math.round(value));
}

export const ForecastMap = forwardRef<ForecastMapHandle, ForecastMapProps>(function ForecastMap({
  darkMode,
  paletteId,
  displayMode,
  resolution,
  showLastWeek,
  lastWeekMode,
  poiFilters,
  modelId,
  periods,
  selectedWeek,
  selectedWeekYear,
  timeseriesOpen,
  hotspotsEnabled,
  hotspotMode,
  hotspotPercentile,
  expectedActivityHotspotCellCount,
  onHotspotsEnabledChange,
  onGridCellCount,
  onGridCellSelect,
  onGridCellExpand,
  forecastPath,
  fallbackForecastPath,
  colorScaleValues,
  useExternalColorScale = false,
  derivedValuesByCell,
  derivedValueProperty = "prob",
  derivedFillExpr,
  deltaLegend = null,
  disableHotspots = false,
  enableSparklinePopup = true,
  cellPopupHtmlBuilder,
  syncViewState,
  onMoveViewState,
  onMoveEndViewState,
  onFatalDataError,
}: ForecastMapProps, ref) {
  trackRender("ForecastMap", { resolution, modelId, darkMode });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleUrl = useMemo(() => (darkMode ? DARK_STYLE : VOYAGER_STYLE), [darkMode]);
  const activePalette = useMemo(() => getPaletteOrDefault(paletteId), [paletteId]);
  const gridBorderColor = useMemo(
    () =>
      activePalette.id === "red_atlas"
        ? darkMode
          ? "rgba(92,32,42,0.28)"
          : "rgba(116,42,48,0.2)"
        : darkMode
          ? "rgba(8,18,44,0.22)"
          : "rgba(20,42,78,0.16)",
    [activePalette.id, darkMode]
  );
  const gridLineAccentColor = useMemo(
    () => (activePalette.id === "red_atlas" ? "rgba(176,72,66,0.38)" : "rgba(96,186,200,0.34)"),
    [activePalette.id]
  );
  const overlayRef = useRef<FeatureCollection | null>(null);
  const fillExprRef = useRef<FillColorSpec | null>(null);
  const hotspotThresholdRef = useRef<number | undefined>(undefined);
  const modeledHotspotThresholdRef = useRef<number | undefined>(undefined);
  const expectedActivityHotspotCellCountRef = useRef<number | null>(
    coerceExpectedActivityHotspotCellCount(expectedActivityHotspotCellCount)
  );
  const valuesByCellRef = useRef<Record<string, number>>({});
  const colorScaleValuesRef = useRef<Record<string, number> | undefined>(colorScaleValues);
  const derivedValuePropertyRef = useRef(derivedValueProperty);
  const derivedFillExprRef = useRef<FillColorSpec | undefined>(derivedFillExpr as FillColorSpec | undefined);
  const sortedValuesDescRef = useRef<number[]>([]);
  const totalCellsRef = useRef(0);
  const shimmerThresholdRef = useRef<number | undefined>(undefined);
  const [legendSpec, setLegendSpec] = useState<HeatScale | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapReadyRef = useRef(false);
  const displayModeRef = useRef(displayMode);

  const legendSpecRef = useRef<HeatScale | null>(null);
  const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
  const poiLoadedRef = useRef(false);
  const poiDataRef = useRef<Array<{ type: string; name: string; latitude: number; longitude: number }> | null>(null);
  const hotspotsOnlyRef = useRef(false);
  const hasForecastLegend = legendSpec !== null || deltaLegend !== null;
  const showLastWeekRef = useRef(false);
  const lastWeekKeyRef = useRef<string | null>(null);
  const lastWeekModeRef = useRef<LastWeekMode>(lastWeekMode);
  const selectedWeekRef = useRef(selectedWeek);
  const selectedWeekYearRef = useRef(selectedWeekYear);
  const styleUrlRef = useRef(styleUrl);
  const activeStyleUrlRef = useRef(styleUrl);
  const lastWeekDataRef = useRef<Record<string, FeatureCollection | null>>({});
  const lastWeekSourceRef = useRef<ResolvedLayerSource | null>(null);
  const lastWeekPopupRef = useRef<maplibregl.Popup | null>(null);
  const lastGridLayerSignatureRef = useRef<string | null>(null);
  const sparkPopupRef = useRef<maplibregl.Popup | null>(null);
  const sparkRequestIdRef = useRef(0);
  const hoveredCellRef = useRef<string | null>(null);
  const lastSmoothSurfaceSignatureRef = useRef<string | null>(null);
  const periodsRef = useRef<Period[]>(periods);
  const modelIdRef = useRef(modelId);
  const resolutionRef = useRef(resolution);
  const sparklineCacheRef = useRef<Map<string, SparklineSeries>>(new Map());
  const forecastPeriodCacheRef = useRef<Map<string, Promise<Record<string, number>>>>(new Map());
  const sightingsWeekCacheRef = useRef<Map<string, Promise<LngLat[]>>>(new Map());
  const onGridCellSelectRef = useRef(onGridCellSelect);
  const onGridCellExpandRef = useRef(onGridCellExpand);
  const cellPopupHtmlBuilderRef = useRef(cellPopupHtmlBuilder);
  const enableSparklinePopupRef = useRef(enableSparklinePopup);
  const onMoveViewStateRef = useRef(onMoveViewState);
  const onMoveEndViewStateRef = useRef(onMoveEndViewState);
  const DEBUG_MAP =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    ((window as { __ORCACAST_DEBUG_MAP?: boolean }).__ORCACAST_DEBUG_MAP === true ||
      window.localStorage?.getItem("orcacast.debug.map") === "true");

  const logMapDebug = (label: string) => {
    if (!DEBUG_MAP) return;
    const el = containerRef.current;
    if (!el) {
      console.info("[MapDebug]", label, { container: "missing" });
      return;
    }
    console.info("[MapDebug]", label, {
      rect: el.getBoundingClientRect(),
      hasCanvas: !!el.querySelector("canvas"),
      styleLoaded: mapRef.current?.isStyleLoaded(),
    });
  };

  const resolveHotspotThreshold = useCallback(() => {
    const modeled = modeledHotspotThresholdRef.current ?? hotspotThresholdRef.current;
    if (hotspotMode !== "custom") {
      const values = sortedValuesDescRef.current;
      const modeledCount = expectedActivityHotspotCellCountRef.current;
      if (values.length > 0 && modeledCount !== null && Number.isFinite(modeledCount) && modeledCount > 0) {
        return values[Math.max(0, Math.min(values.length - 1, Math.round(modeledCount) - 1))] ?? modeled;
      }
      return modeled;
    }
    const values = sortedValuesDescRef.current;
    const total = totalCellsRef.current;
    if (values.length === 0 || total === 0) return modeled;
    const count = Math.max(1, Math.round((total * Math.min(Math.max(hotspotPercentile, 0), 100)) / 100));
    return values[Math.max(0, Math.min(values.length - 1, count - 1))] ?? modeled;
  }, [hotspotMode, hotspotPercentile]);

  const captureCurrentMapSnapshot = useCallback(async () => {
    const sourceMap = mapRef.current;
    const sourceCanvas = sourceMap?.getCanvas();
    const overlay = overlayRef.current;
    if (!sourceMap || !sourceCanvas || !overlay) return null;

    type MapOptionsPatched = maplibregl.MapOptions & {
      preserveDrawingBuffer?: boolean;
      cooperativeGestures?: boolean;
    };

    const container = document.createElement("div");
    const width = Math.max(1, sourceCanvas.clientWidth || containerRef.current?.clientWidth || 1024);
    const height = Math.max(1, sourceCanvas.clientHeight || containerRef.current?.clientHeight || 768);
    container.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:0",
      `width:${width}px`,
      `height:${height}px`,
      "pointer-events:none",
      "opacity:0",
    ].join(";");
    document.body.appendChild(container);

    let tempMap: MapLibreMap | null = null;
    try {
      const center = sourceMap.getCenter();
      tempMap = new maplibregl.Map({
        container,
        style: styleUrlRef.current,
        center: [center.lng, center.lat],
        zoom: sourceMap.getZoom(),
        bearing: sourceMap.getBearing(),
        pitch: sourceMap.getPitch(),
        attributionControl: false,
        interactive: false,
        preserveDrawingBuffer: true,
        cooperativeGestures: false,
      } as MapOptionsPatched);

      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => reject(new Error("Snapshot map load timed out")), 3500);
        tempMap?.once("load", () => {
          window.clearTimeout(timeoutId);
          resolve();
        });
        tempMap?.once("error", (event: { error?: unknown }) => {
          window.clearTimeout(timeoutId);
          reject(event.error instanceof Error ? event.error : new Error("Snapshot map failed to load"));
        });
      });

      safeApplyBasemapVisualTuning(tempMap, styleUrlRef.current === DARK_STYLE);
      addGridOverlay(
        tempMap,
        overlay,
        fillExprRef.current ?? undefined,
        disableHotspots ? undefined : resolveHotspotThreshold(),
        !disableHotspots && hotspotsOnlyRef.current,
        shimmerThresholdRef.current,
        gridBorderColor,
        gridLineAccentColor
      );
      if (!disableHotspots && hotspotsOnlyRef.current) {
        setGridBaseVisibility(tempMap, false);
        setHotspotVisibility(tempMap, true);
      } else {
        setGridVisibility(tempMap, true);
        setHotspotVisibility(tempMap, false);
      }
      if (showLastWeekRef.current && lastWeekModeRef.current !== "none") {
        const selected = { year: selectedWeekYearRef.current, week: selectedWeekRef.current };
        if (Number.isFinite(selected.year) && Number.isFinite(selected.week) && selected.week > 0) {
          const previous = getPreviousWeek(selected.year, selected.week);
          const resolved = lastWeekSourceRef.current;
          if (resolved?.kind === "vector_tiles") {
            ensureLastWeekLayer(tempMap, { type: "FeatureCollection", features: [] }, LAST_WEEK_VECTOR_SOURCE_ID, resolved.sourceLayer, resolved.url);
            applyLastWeekModeFilters(tempMap, selected, previous, lastWeekModeRef.current, resolved.sourceLayer);
            setLastWeekVisibility(tempMap, true);
          } else {
            const key = `${selected.year}-W${selected.week}`;
            const raw = lastWeekDataRef.current[key];
            if (raw) {
              const tagged = tagSightings(raw, lastWeekModeRef.current, selected, previous);
              if ((tagged.features ?? []).length > 0) {
                ensureLastWeekLayer(tempMap, tagged, LAST_WEEK_SOURCE_ID);
                setLastWeekVisibility(tempMap, true);
              }
            }
          }
          moveLastWeekToTop(tempMap);
        }
      }
      tempMap.resize();
      const rendered = await waitForMapRender(tempMap);
      if (!rendered) return null;

      return await new Promise<Blob | null>((resolve) => {
        try {
          tempMap?.getCanvas().toBlob((blob) => resolve(blob), "image/png");
        } catch {
          resolve(null);
        }
      });
    } catch (error) {
      console.warn("[Snapshot] temporary map capture failed", error);
      return null;
    } finally {
      tempMap?.remove();
      container.remove();
    }
  }, [disableHotspots, gridBorderColor, gridLineAccentColor, resolveHotspotThreshold]);

  useImperativeHandle(
    ref,
    () => ({
      captureSnapshot: captureCurrentMapSnapshot,
    }),
    [captureCurrentMapSnapshot]
  );

  useEffect(() => {
    styleUrlRef.current = styleUrl;
  }, [styleUrl]);

  useEffect(() => {
    colorScaleValuesRef.current = colorScaleValues;
  }, [colorScaleValues]);

  useEffect(() => {
    derivedValuePropertyRef.current = derivedValueProperty;
  }, [derivedValueProperty]);

  useEffect(() => {
    derivedFillExprRef.current = derivedFillExpr as FillColorSpec | undefined;
  }, [derivedFillExpr]);

  useEffect(() => {
    legendSpecRef.current = legendSpec;
  }, [legendSpec]);

  useEffect(() => {
    mapReadyRef.current = mapReady;
  }, [mapReady]);

  useEffect(() => {
    displayModeRef.current = displayMode;
  }, [displayMode]);

  const applyScaleToCurrentValues = (values: Record<string, number>) => {
    const scaleSourceValues =
      useExternalColorScale && colorScaleValuesRef.current && Object.keys(colorScaleValuesRef.current).length > 0
        ? colorScaleValuesRef.current
        : values;
    const { fillColorExpr, scale } = buildAutoColorExprFromValues(scaleSourceValues, activePalette.colors);
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
    if (!scale) setLegendOpen(false);
  };

  const renderForecastLayer = (map: MapLibreMap) => {
    if (!overlayRef.current) return;
    if (DEBUG_MAP) {
      console.info("[MapDebug] renderForecastLayer:start", {
        styleLoaded: map.isStyleLoaded(),
        featureCount: overlayRef.current.features?.length ?? 0,
        hasLegend: legendSpecRef.current !== null,
        disableHotspots,
        hotspotsOnly: hotspotsOnlyRef.current,
      });
    }
    const scale = legendSpecRef.current;
    const threshold = disableHotspots ? undefined : resolveHotspotThreshold();
    const hotspots = disableHotspots ? false : hotspotsOnlyRef.current;
    const zeroModeledHotspots =
      hotspots &&
      hotspotMode !== "custom" &&
      expectedActivityHotspotCellCountRef.current !== null &&
      Number.isFinite(expectedActivityHotspotCellCountRef.current) &&
      expectedActivityHotspotCellCountRef.current <= 0;
    const hotspotOverlayVisible = hotspots && !zeroModeledHotspots;

    const fillExpr: FillColorSpec | undefined =
      hotspotOverlayVisible && threshold !== undefined
        ? (buildHotspotOnlyExpr(threshold) as unknown as FillColorSpec)
        : scale
          ? (buildFillExprFromScale(scale) as unknown as FillColorSpec)
          : fillExprRef.current ?? undefined;

    if (fillExpr) fillExprRef.current = fillExpr;
    const layerSignature = createGridLayerBuildSignature({
      data: overlayRef.current,
      fillColorExpr: fillExpr,
      hotspotThreshold: threshold,
      hotspotsVisible: hotspotOverlayVisible,
      shimmerThreshold: shimmerThresholdRef.current,
      borderColor: gridBorderColor,
    });
    if (lastGridLayerSignatureRef.current !== layerSignature) {
      lastGridLayerSignatureRef.current = layerSignature;
      trackLayerRebuild("grid", {
        resolution,
        hotspotOverlayVisible,
        hasThreshold: threshold !== undefined,
      });
      addGridOverlay(
        map,
        overlayRef.current,
        fillExpr,
        threshold,
        hotspotOverlayVisible,
        shimmerThresholdRef.current,
        gridBorderColor,
        gridLineAccentColor
      );
    }

    ensureSmoothSurfaceLayer(map);
    const smoothScale = legendSpecRef.current;
    const smoothFeatureCollection = overlayRef.current;
    const smoothSignature = smoothFeatureCollection
      ? `${displayModeRef.current}:${activePalette.id}:${derivedValuePropertyRef.current}:${smoothScale?.thresholds.join(",") ?? "none"}:${smoothFeatureCollection.features?.length ?? 0}`
      : null;
    if (displayModeRef.current === "smooth" && smoothScale && smoothFeatureCollection && lastSmoothSurfaceSignatureRef.current !== smoothSignature) {
      lastSmoothSurfaceSignatureRef.current = smoothSignature;
      const overlay = buildSmoothSurfaceOverlay(
        smoothFeatureCollection.features as Parameters<typeof buildSmoothSurfaceOverlay>[0],
        (feature) => Number((feature.properties as Record<string, unknown> | null)?.[derivedValuePropertyRef.current] ?? 0),
        (value) => resolveScaleColor(smoothScale, value)
      );
      upsertSmoothSurface(map, SMOOTH_SOURCE_ID, overlay);
    }
    if (displayModeRef.current !== "smooth") {
      lastSmoothSurfaceSignatureRef.current = null;
      upsertSmoothSurface(map, SMOOTH_SOURCE_ID, null);
    }

    if (hotspots) {
      if (hotspotOverlayVisible) {
        setGridBaseVisibility(map, false);
        setHotspotVisibility(map, true);
      } else {
        // If hotspot mode is active but no modeled hotspot threshold/count is available,
        // keep the normal forecast grid visible instead of blanking the map.
        setGridVisibility(map, true);
        setHotspotVisibility(map, false);
      }
    } else {
      setGridVisibility(map, true);
      setHotspotVisibility(map, false);
    }
    setGridHoverCell(map, hoveredCellRef.current);
    moveLastWeekToTop(map);
    if (DEBUG_MAP) {
      console.info("[MapDebug] renderForecastLayer:done", {
        hasGridFill: !!map.getLayer("grid-fill"),
        hasGridLine: !!map.getLayer("grid-line"),
        hasGridSource: !!map.getSource("grid"),
      });
    }
  };

  const scheduleForecastRender = (map: MapLibreMap, isCancelled?: () => boolean) => {
    let attempts = 0;
    let timeoutId: number | null = null;
    let done = false;

    const cleanup = () => {
      map.off("styledata", tryRender);
      map.off("load", tryRender);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const tryRender = () => {
      if (done) return;
      if (isCancelled?.()) {
        done = true;
        cleanup();
        return;
      }
      if (!overlayRef.current || !mapRef.current || !map.isStyleLoaded()) return;
      if (DEBUG_MAP) {
        console.info("[MapDebug] scheduleForecastRender:try", {
          attempts,
          styleLoaded: map.isStyleLoaded(),
          hasOverlay: !!overlayRef.current,
          overlayFeatures: overlayRef.current?.features?.length ?? 0,
        });
      }
      try {
        renderForecastLayer(map);
        moveLastWeekToTop(map);
        done = true;
        cleanup();
        if (DEBUG_MAP) {
          console.info("[MapDebug] scheduleForecastRender:success", {
            attempts,
            hasGridFill: !!map.getLayer("grid-fill"),
            hasGridLine: !!map.getLayer("grid-line"),
          });
        }
      } catch (error) {
        if (DEBUG_MAP) {
          console.warn("[MapDebug] forecast render retry", { attempts, error });
        }
      }
    };

    const poll = () => {
      if (done) return;
      tryRender();
      if (done) return;
      attempts += 1;
      if (attempts > 300) {
        if (DEBUG_MAP) {
          console.warn("[MapDebug] scheduleForecastRender:timeout", {
            hasOverlay: !!overlayRef.current,
            styleLoaded: map.isStyleLoaded(),
          });
        }
        cleanup();
        return;
      }
      timeoutId = window.setTimeout(poll, 60);
    };

    map.on("styledata", tryRender);
    map.on("load", tryRender);
    poll();
  };

  const buildLastWeekUrl = (key: string) => {
    const base = import.meta.env.BASE_URL || "/";
    const cleanBase = base.endsWith("/") ? base : `${base}/`;
    return `${cleanBase}data/last_week_sightings/last_week_sightings_${key}.geojson`;
  };

  const applyLastWeekFromCache = (map: MapLibreMap) => {
    if (!showLastWeekRef.current) return;
    const key = lastWeekKeyRef.current;
    if (!key) return;
    const raw = lastWeekDataRef.current[key];
    if (!raw) return;
    const previous = getPreviousWeek(selectedWeekYearRef.current, selectedWeekRef.current);
    const tagged = tagSightings(raw, lastWeekModeRef.current, { year: selectedWeekYearRef.current, week: selectedWeekRef.current }, previous);
    if ((tagged.features ?? []).length === 0) return;
    ensureLastWeekLayer(map, tagged);
    moveLastWeekToTop(map);
  };

  const restoreMapAfterStyleChange = (
    map: MapLibreMap,
    viewState: { center: maplibregl.LngLatLike; zoom: number; bearing: number; pitch: number },
    isDarkBasemap: boolean
  ) => {
    let cancelled = false;
    let rafId = 0;

    const finalize = () => {
      if (cancelled || !mapRef.current || mapRef.current !== map) return;
      try {
        map.jumpTo(viewState);
      } catch {
        // no-op
      }
      safeApplyBasemapVisualTuning(map, isDarkBasemap);
      map.resize();
      lastGridLayerSignatureRef.current = null;
      scheduleForecastRender(map, () => cancelled);
      if (showLastWeekRef.current) {
        const applyLastWeekWhenReady = () => {
          if (cancelled || !mapRef.current || mapRef.current !== map) return;
          if (!map.isStyleLoaded()) {
            window.requestAnimationFrame(applyLastWeekWhenReady);
            return;
          }
          applyLastWeekFromCache(map);
        };
        window.requestAnimationFrame(applyLastWeekWhenReady);
      }
    };

    const waitForStyle = () => {
      if (cancelled || !mapRef.current || mapRef.current !== map) return;
      if (!map.isStyleLoaded()) {
        rafId = window.requestAnimationFrame(waitForStyle);
        return;
      }
      finalize();
    };

    rafId = window.requestAnimationFrame(waitForStyle);
    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  };

  useForecastData({
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
    paletteColors: activePalette.colors,
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
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const showPoi = poiFilters.Park || poiFilters.Marina || poiFilters.Ferry;
    if (!showPoi) {
      poiMarkersRef.current.forEach((marker) => marker.remove());
      poiMarkersRef.current = [];
      return;
    }

    const loadPoi = async () => {
      if (poiLoadedRef.current && poiDataRef.current) return poiDataRef.current;
      const base = import.meta.env.BASE_URL || "/";
      const normalizedBase = base.endsWith("/") ? base : `${base}/`;
      const candidates = Array.from(new Set([`${normalizedBase}data/places_of_interest.json`, "/data/places_of_interest.json", "data/places_of_interest.json"]));
      let lastError: Error | null = null;

      for (const url of candidates) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            lastError = new Error(`Failed to load POI data from ${url}: ${response.status}`);
            continue;
          }
          const payload = (await response.json()) as
            | { items?: Array<{ type: string; name: string; latitude: number; longitude: number }> }
            | Array<{ type: string; name: string; latitude: number; longitude: number }>
            | { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }> };

          const items = Array.isArray(payload)
            ? payload.map((entry) => ({
                type: String((entry as { type?: string }).type ?? ""),
                name: String((entry as { name?: string }).name ?? "POI"),
                latitude: Number((entry as { latitude?: number }).latitude),
                longitude: Number((entry as { longitude?: number }).longitude),
              }))
            : "items" in payload && Array.isArray(payload.items)
              ? payload.items.map((entry) => ({
                  type: String(entry.type ?? ""),
                  name: String(entry.name ?? "POI"),
                  latitude: Number(entry.latitude),
                  longitude: Number(entry.longitude),
                }))
              : "features" in payload && Array.isArray(payload.features)
                ? payload.features.map((feature) => {
                    const props = feature.properties ?? {};
                    const coordinates = feature.geometry?.coordinates ?? [Number.NaN, Number.NaN];
                    return {
                      type: String(props.type ?? props.category ?? ""),
                      name: String(props.name ?? "POI"),
                      latitude: Number(coordinates[1]),
                      longitude: Number(coordinates[0]),
                    };
                  })
                : [];

          poiLoadedRef.current = true;
          poiDataRef.current = items;
          console.info(`[POI] loaded ${items.length} items from ${url}`);
          return items;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      throw lastError ?? new Error("Failed to load POI data");
    };

    let cancelled = false;

    const renderPoiMarkers = (items: Array<{ type: string; name: string; latitude: number; longitude: number }>) => {
      if (cancelled || !mapRef.current) return;
      poiMarkersRef.current.forEach((marker) => marker.remove());
      poiMarkersRef.current = [];

      const iconMap: Record<string, string> = { Park: "park", Marina: "sailing", Ferry: "directions_boat" };
      const typeToFilterKey = (value: string): keyof typeof poiFilters | null => {
        const normalized = value.trim().toLowerCase();
        if (normalized === "park") return "Park";
        if (normalized === "marina") return "Marina";
        if (normalized === "ferry") return "Ferry";
        return null;
      };

      const safeItems = items
        .map((poi) => ({ ...poi, latitude: Number(poi.latitude), longitude: Number(poi.longitude), filterKey: typeToFilterKey(String(poi.type ?? "")) }))
        .filter((poi) => poi.filterKey !== null && Number.isFinite(poi.latitude) && Number.isFinite(poi.longitude));
      const filteredItems = safeItems.filter((poi) => poi.filterKey && (poiFilters[poi.filterKey] ?? false));
      const itemsToRender = filteredItems.length > 0 ? filteredItems : safeItems;

      poiMarkersRef.current = itemsToRender.map((poi) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "poiMarker";
        el.setAttribute("aria-label", poi.name);
        el.innerHTML = `<span class="material-symbols-rounded">${poi.filterKey ? iconMap[poi.filterKey] : "directions_boat"}</span>`;

        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true }).setHTML(
          `<div class="poiPopup"><div class="poiPopup__title">${escapeHtml(poi.name)}</div><div class="poiPopup__meta">${poi.latitude.toFixed(4)}, ${poi.longitude.toFixed(4)}</div></div>`
        );

        return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([poi.longitude, poi.latitude]).setPopup(popup).addTo(map);
      });
    };

    loadPoi()
      .then((items) => {
        if (cancelled || !mapRef.current) return;
        if (!mapRef.current.isStyleLoaded()) {
          mapRef.current.once("load", () => renderPoiMarkers(items));
          return;
        }
        renderPoiMarkers(items);
      })
      .catch((err) => {
        if (!cancelled) console.warn("[POI] failed to load places_of_interest.json", err);
      });

    return () => {
      cancelled = true;
    };
  }, [poiFilters, styleUrl, mapReady]);

  useEffect(() => {
    hotspotsOnlyRef.current = disableHotspots ? false : hotspotsEnabled;
  }, [hotspotsEnabled, disableHotspots]);

  useEffect(() => {
    showLastWeekRef.current = showLastWeek;
  }, [showLastWeek]);

  useEffect(() => {
    lastWeekModeRef.current = lastWeekMode;
  }, [lastWeekMode]);

  useEffect(() => {
    periodsRef.current = periods;
  }, [periods]);

  useEffect(() => {
    modelIdRef.current = modelId;
  }, [modelId]);

  useEffect(() => {
    resolutionRef.current = resolution;
  }, [resolution]);

  useEffect(() => {
    onGridCellSelectRef.current = onGridCellSelect;
  }, [onGridCellSelect]);

  useEffect(() => {
    onGridCellExpandRef.current = onGridCellExpand;
  }, [onGridCellExpand]);

  useEffect(() => {
    cellPopupHtmlBuilderRef.current = cellPopupHtmlBuilder;
  }, [cellPopupHtmlBuilder]);

  useEffect(() => {
    enableSparklinePopupRef.current = enableSparklinePopup;
  }, [enableSparklinePopup]);

  useEffect(() => {
    onMoveViewStateRef.current = onMoveViewState;
  }, [onMoveViewState]);

  useEffect(() => {
    onMoveEndViewStateRef.current = onMoveEndViewState;
  }, [onMoveEndViewState]);

  useEffect(() => {
    // Invalidate cached layer signatures whenever the forecast payload inputs change
    // so the next successful load cannot be skipped as a no-op rebuild.
    lastGridLayerSignatureRef.current = null;
  }, [
    resolution,
    modelId,
    forecastPath,
    fallbackForecastPath,
    derivedValuesByCell,
    derivedValueProperty,
    derivedFillExpr,
  ]);

  useEffect(() => {
    // Modeled hotspot mode intentionally uses expected activity as the number of highlighted cells.
    expectedActivityHotspotCellCountRef.current =
      coerceExpectedActivityHotspotCellCount(expectedActivityHotspotCellCount);
  }, [expectedActivityHotspotCellCount]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && mapReady && !disableHotspots) renderForecastLayer(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotspotMode, hotspotPercentile, expectedActivityHotspotCellCount, hotspotsEnabled, mapReady, disableHotspots]);

  useEffect(() => {
    selectedWeekRef.current = selectedWeek;
    selectedWeekYearRef.current = selectedWeekYear;
  }, [selectedWeek, selectedWeekYear]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !syncViewState) return;
    const currentCenter = map.getCenter();
    const sameCenter =
      Math.abs(currentCenter.lng - syncViewState.center[0]) < 1e-6 &&
      Math.abs(currentCenter.lat - syncViewState.center[1]) < 1e-6;
    const sameZoom = Math.abs(map.getZoom() - syncViewState.zoom) < 1e-6;
    const sameBearing = Math.abs(map.getBearing() - syncViewState.bearing) < 1e-6;
    const samePitch = Math.abs(map.getPitch() - syncViewState.pitch) < 1e-6;
    if (sameCenter && sameZoom && sameBearing && samePitch) return;
    map.jumpTo({
      center: syncViewState.center,
      zoom: syncViewState.zoom,
      bearing: syncViewState.bearing,
      pitch: syncViewState.pitch,
    });
  }, [syncViewState]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    logMapDebug("before-init");

    type MapOptionsPatched = maplibregl.MapOptions & {
      preserveDrawingBuffer?: boolean;
      cooperativeGestures?: boolean;
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      cooperativeGestures: false,
    } as MapOptionsPatched);

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
    map.on("error", (e: { error?: unknown }) => console.error("[MapLibre] error:", e?.error || e));

    lastWeekPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });

    const canvas = map.getCanvas();
    const onContextLost = (event: Event) => {
      event.preventDefault();
      console.warn("[MapLibre] WebGL context lost");
    };
    const onContextRestored = () => {
      console.warn("[MapLibre] WebGL context restored");
      if (!mapRef.current) return;
      const center = mapRef.current.getCenter();
      const zoom = mapRef.current.getZoom();
      const bearing = mapRef.current.getBearing();
      const pitch = mapRef.current.getPitch();
      const nextStyle = styleUrlRef.current;
      mapRef.current.setStyle(nextStyle);
      activeStyleUrlRef.current = nextStyle;
      lastGridLayerSignatureRef.current = null;
      restoreMapAfterStyleChange(
        mapRef.current,
        { center, zoom, bearing, pitch },
        styleUrlRef.current === DARK_STYLE
      );
    };

    canvas.addEventListener("webglcontextlost", onContextLost, false);
    canvas.addEventListener("webglcontextrestored", onContextRestored, false);

    const { handleSparklineClick, handleMouseEnter, handleMouseMove, handleMouseLeave } =
      createGridInteractionHandlers({
        map,
        overlayRef,
        periodsRef,
        modelIdRef,
        resolutionRef,
        selectedWeekRef,
        selectedWeekYearRef,
        sparklineCacheRef,
        forecastPeriodCacheRef,
        sightingsWeekCacheRef,
        sparkPopupRef,
        sparkRequestIdRef,
        hoveredCellRef,
        onGridCellSelect: (h3) => onGridCellSelectRef.current?.(h3),
        onGridCellExpand: (request) => onGridCellExpandRef.current?.(request),
        cellPopupHtmlBuilder: (cellId) => cellPopupHtmlBuilderRef.current?.(cellId),
        enableSparklinePopupRef,
      });

    map.on("click", "grid-fill", handleSparklineClick);
    map.on("mouseenter", "grid-fill", handleMouseEnter);
    map.on("mousemove", "grid-fill", handleMouseMove);
    map.on("mouseleave", "grid-fill", handleMouseLeave);

    map.once("load", () => {
      lastGridLayerSignatureRef.current = null;
      mapReadyRef.current = true;
      setMapReady(true);
      safeApplyBasemapVisualTuning(map, styleUrlRef.current === DARK_STYLE);
      map.resize();
      scheduleForecastRender(map);
      applyLastWeekFromCache(map);
      logMapDebug("load");
    });

    const handleStyleData = () => {
      if (mapRef.current) {
        safeApplyBasemapVisualTuning(mapRef.current, styleUrlRef.current === DARK_STYLE);
        if (!mapReadyRef.current && mapRef.current.isStyleLoaded()) {
          mapReadyRef.current = true;
          setMapReady(true);
          mapRef.current.resize();
          logMapDebug("style-ready");
        }
      }
    };
    map.on("styledata", handleStyleData);

    const handleMoveEnd = () => {
      if (!onMoveEndViewStateRef.current) return;
      const center = map.getCenter();
      onMoveEndViewStateRef.current({ center: [center.lng, center.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
    };
    const handleMove = debounce(() => {
      if (!onMoveViewStateRef.current) return;
      const center = map.getCenter();
      onMoveViewStateRef.current({ center: [center.lng, center.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
    }, 120);
    map.on("moveend", handleMoveEnd);
    map.on("move", handleMove);

    mapRef.current = map;
    if (import.meta.env.DEV && typeof window !== "undefined") {
      (window as { __ORCACAST_MAP?: MapLibreMap }).__ORCACAST_MAP = map;
    }
    logMapDebug("after-init");

    const raf = window.requestAnimationFrame(() => map.resize());
    const t1 = window.setTimeout(() => map.resize(), 50);
    const t2 = window.setTimeout(() => map.resize(), 250);
    const t3 = window.setTimeout(() => {
      if (!DEBUG_MAP) return;
      console.info("[MapDebug] style status", { styleLoaded: map.isStyleLoaded(), styleName: map.getStyle()?.name ?? null });
    }, 1000);
    if (DEBUG_MAP) {
      map.once("styledata", () => logMapDebug("styledata"));
      map.once("sourcedata", () => logMapDebug("sourcedata"));
      map.once("render", () => logMapDebug("render"));
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      if (import.meta.env.DEV && typeof window !== "undefined") {
        const win = window as { __ORCACAST_MAP?: MapLibreMap };
        if (win.__ORCACAST_MAP === map) delete win.__ORCACAST_MAP;
      }
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      map.off("click", "grid-fill", handleSparklineClick);
      map.off("mouseenter", "grid-fill", handleMouseEnter);
      map.off("mousemove", "grid-fill", handleMouseMove);
      map.off("mouseleave", "grid-fill", handleMouseLeave);
      map.off("styledata", handleStyleData);
      map.off("moveend", handleMoveEnd);
      map.off("move", handleMove);
      sparkPopupRef.current?.remove();
      sparkPopupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useHotspotAnimation({ mapReady, mapRef, hotspotsOnlyRef, resolution, forecastPath });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || activeStyleUrlRef.current === styleUrl) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();
    map.setStyle(styleUrl);
    activeStyleUrlRef.current = styleUrl;
    lastGridLayerSignatureRef.current = null;
    restoreMapAfterStyleChange(map, { center, zoom, bearing, pitch }, styleUrl === DARK_STYLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || overlayRef.current == null || derivedValuesByCell) return;
    const values = valuesByCellRef.current ?? {};
    applyScaleToCurrentValues(values);
    renderForecastLayer(map);
    moveLastWeekToTop(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorScaleValues, displayMode, mapReady, useExternalColorScale, activePalette, derivedValuesByCell]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!showLastWeek || lastWeekMode === "none" || !Number.isFinite(selectedWeekYear) || !Number.isFinite(selectedWeek) || selectedWeek <= 0) {
      setLastWeekVisibility(map, false);
      return;
    }

    const previous = getPreviousWeek(selectedWeekYear, selectedWeek);
    const key = `${selectedWeekYear}-W${selectedWeek}`;
    lastWeekKeyRef.current = key;
    let active = true;

    const run = async () => {
      if (!lastWeekSourceRef.current) {
        lastWeekSourceRef.current = await resolveLayerSource(LAST_WEEK_LAYER_CONFIG);
      }
      const resolved = lastWeekSourceRef.current;
      if (!resolved || !active) return;

      if (resolved.kind === "vector_tiles") {
        ensureLastWeekLayer(map, { type: "FeatureCollection", features: [] }, LAST_WEEK_VECTOR_SOURCE_ID, resolved.sourceLayer, resolved.url);
        applyLastWeekModeFilters(map, { year: selectedWeekYear, week: selectedWeek }, previous, lastWeekMode, resolved.sourceLayer);
        setLastWeekVisibility(map, true);
        return;
      }

      ensureLastWeekLayer(map, { type: "FeatureCollection", features: [] }, LAST_WEEK_SOURCE_ID);
      setLastWeekVisibility(map, false);

      const applyTagged = (raw: FeatureCollection | null) => {
        if (!raw) {
          setLastWeekVisibility(map, false);
          return;
        }
        const tagged = tagSightings(raw, lastWeekMode, { year: selectedWeekYear, week: selectedWeek }, previous);
        if ((tagged.features ?? []).length === 0) {
          setLastWeekVisibility(map, false);
          return;
        }
        ensureLastWeekLayer(map, tagged, LAST_WEEK_SOURCE_ID);
        setLastWeekVisibility(map, true);
      };

      if (key in lastWeekDataRef.current) {
        applyTagged(lastWeekDataRef.current[key] ?? null);
        return;
      }

      try {
        const versionToken = getDataVersionToken() ?? import.meta.env.VITE_BUILD_ID;
        const suffix = versionToken ? `?v=${encodeURIComponent(versionToken)}` : "";
        const res = await fetch(`${buildLastWeekUrl(key)}${suffix}`, { cache: "default" });
        if (res.status === 404 || res.status === 204) {
          lastWeekDataRef.current[key] = null;
          if (active) setLastWeekVisibility(map, false);
          return;
        }
        if (!res.ok) throw new Error(`Failed to fetch last week sightings: ${res.status}`);
        const text = (await res.text()).trim();
        if (text.startsWith("<") || text.length === 0) {
          lastWeekDataRef.current[key] = null;
          if (active) setLastWeekVisibility(map, false);
          return;
        }
        const data = JSON.parse(text) as FeatureCollection;
        lastWeekDataRef.current[key] = data;
        if (!active) return;
        if (!map.isStyleLoaded()) {
          map.once("styledata", () => {
            if (active) applyTagged(data);
          });
        } else {
          applyTagged(data);
        }
      } catch (err) {
        console.warn("[Sightings] failed to load last week sightings", err);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [showLastWeek, lastWeekMode, selectedWeek, selectedWeekYear]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const raf = window.requestAnimationFrame(() => {
      map.resize();
      map.triggerRepaint();
    });
    const t1 = window.setTimeout(() => {
      map.resize();
      map.triggerRepaint();
    }, 80);
    const t2 = window.setTimeout(() => {
      map.resize();
      map.triggerRepaint();
    }, 240);
    const t3 = window.setTimeout(() => {
      if (!map.isStyleLoaded()) {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const bearing = map.getBearing();
        const pitch = map.getPitch();
        map.setStyle(styleUrlRef.current);
        restoreMapAfterStyleChange(map, { center, zoom, bearing, pitch }, styleUrlRef.current === DARK_STYLE);
      }
    }, 420);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeseriesOpen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => {
      map.resize();
      map.triggerRepaint();
    }, 50);
    return () => window.clearTimeout(id);
  }, [legendSpec, deltaLegend]);

  type MapMouseEventWithFeatures = maplibregl.MapMouseEvent & {
    features?: Array<{ properties?: { datetime?: string } }>;
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lastWeekPopupRef.current) return;
    const popup = lastWeekPopupRef.current;
    const onMove = (e: MapMouseEventWithFeatures) => {
      const datetime = e.features?.[0]?.properties?.datetime;
      if (!datetime) return;
      popup.setLngLat(e.lngLat).setHTML(`<div style="font-size:12px;">${escapeHtml(datetime)}</div>`).addTo(map);
    };
    const onLeave = () => popup.remove();
    map.on("mousemove", LAST_WEEK_LAYER_ID, onMove);
    map.on("mouseleave", LAST_WEEK_LAYER_ID, onLeave);
    return () => {
      map.off("mousemove", LAST_WEEK_LAYER_ID, onMove);
      map.off("mouseleave", LAST_WEEK_LAYER_ID, onLeave);
      popup.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !overlayRef.current) return;
    if (!map.isStyleLoaded()) {
      scheduleForecastRender(map);
      return;
    }
    renderForecastLayer(map);
    moveLastWeekToTop(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMode, hotspotsEnabled, legendSpec, deltaLegend, disableHotspots]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const zeroModeledHotspots =
      hotspotMode === "modeled" &&
      coerceExpectedActivityHotspotCellCount(expectedActivityHotspotCellCount) === 0;
    const canShowSmooth = displayMode === "smooth" && overlayRef.current !== null && legendSpecRef.current !== null;
    setSmoothLayerVisibility(map, canShowSmooth);
    if (!hasForecastLegend) {
      setGridCoreLayerVisibility(map, true);
      setGridVisibility(map, true);
      setHotspotVisibility(map, false);
      return;
    }
    if (displayMode === "smooth") {
      setGridCoreLayerVisibility(map, false);
      setHotspotVisibility(map, !disableHotspots && hotspotsEnabled && !zeroModeledHotspots);
      return;
    }
    setGridCoreLayerVisibility(map, true);
    if (!disableHotspots && hotspotsEnabled) {
      setGridBaseVisibility(map, false);
      setHotspotVisibility(map, !zeroModeledHotspots);
      if (zeroModeledHotspots) setGridVisibility(map, false);
    } else {
      setGridVisibility(map, true);
      setHotspotVisibility(map, false);
    }
  }, [displayMode, hotspotsEnabled, mapReady, hasForecastLegend, disableHotspots, hotspotMode, expectedActivityHotspotCellCount]);

  useEffect(() => {
    if (hasForecastLegend) return;
    if (hotspotsEnabled) onHotspotsEnabledChange(false);
  }, [hasForecastLegend, hotspotsEnabled, onHotspotsEnabledChange]);

  useEffect(() => {
    if (disableHotspots && hotspotsEnabled) onHotspotsEnabledChange(false);
  }, [disableHotspots, hotspotsEnabled, onHotspotsEnabledChange]);

  return (
    <div className="mapStage">
      <div ref={containerRef} className="map" data-tour="map-canvas" />
      <MapControls
        hotspotsEnabled={hotspotsEnabled}
        hasForecastLegend={hasForecastLegend}
        disableHotspots={disableHotspots}
        legendOpen={legendOpen}
        legendSpec={legendSpec}
        deltaLegend={deltaLegend}
        onHotspotsEnabledChange={onHotspotsEnabledChange}
        onLegendToggle={() => setLegendOpen((value) => !value)}
      />
    </div>
  );
});
