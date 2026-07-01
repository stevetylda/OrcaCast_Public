import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Period } from "../../shared/data/periods";
import {
  addGridOverlay,
  addSurfaceOverlay,
  setGridBaseVisibility,
  setGridCoreLayerVisibility,
  setGridHoverCell,
  setGridVisibility,
  setHotspotVisibility,
  setSurfaceVisibility,
} from "../../shared/geo/gridOverlay";
import { buildAutoColorExprFromValues, buildFillExprFromScale, buildHotspotOnlyExpr } from "../../shared/geo/colorScale";
import type { HeatScale } from "../../shared/geo/colorScale";
import { getPaletteOrDefault } from "../../shared/geo/palettes";
import { trackLayerRebuild, trackRender } from "../../shared/debug/perf";
import { MapControls } from "./MapControls";
import { createGridInteractionHandlers } from "./MapInteractions";
import { applyBasemapVisualTuning, createGridLayerBuildSignature, DARK_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM, VOYAGER_STYLE } from "./buildLayers";
import { useForecastData } from "./useForecastData";
import { useHotspotAnimation } from "./useHotspotAnimation";
import type { FillColorSpec, ForecastMapHandle, ForecastMapProps, LngLat, SparklineSeries } from "./types";

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
    if (!style || !Array.isArray(style.layers) || style.layers.length === 0) return false;
    applyBasemapVisualTuning(map, isDarkBasemap);
    return true;
  } catch {
    return false;
  }
}

function coerceExpectedActivityHotspotCellCount(value: number | null): number | null {
  return value === null || !Number.isFinite(value) ? null : Math.max(0, Math.round(value));
}

const SUGGESTED_PLACE_CLUSTER_DISTANCE_KM = 18;
const SUGGESTED_PLACE_CLUSTER_MAX_ZOOM = 10.75;

function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371.0088;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function clusterSuggestedPlaces<T extends { longitude: number; latitude: number; score: number }>(places: T[]) {
  if (places.length <= 1) return places.map((place) => ({ members: [place], center: [place.longitude, place.latitude] as [number, number] }));

  const visited = new Set<number>();
  const clusters: Array<{ members: T[]; center: [number, number] }> = [];

  for (let index = 0; index < places.length; index += 1) {
    if (visited.has(index)) continue;
    const stack = [index];
    const memberIndexes: number[] = [];
    visited.add(index);

    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null) continue;
      memberIndexes.push(current);
      const currentPlace = places[current];
      const currentPoint: [number, number] = [currentPlace.longitude, currentPlace.latitude];

      for (let next = 0; next < places.length; next += 1) {
        if (visited.has(next)) continue;
        const candidate = places[next];
        const candidatePoint: [number, number] = [candidate.longitude, candidate.latitude];
        if (haversineKm(currentPoint, candidatePoint) > SUGGESTED_PLACE_CLUSTER_DISTANCE_KM) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    const members = memberIndexes.map((memberIndex) => places[memberIndex]).sort((a, b) => b.score - a.score);
    const weighted = members.reduce(
      (acc, member) => {
        const weight = Math.max(0.15, member.score);
        return {
          lon: acc.lon + member.longitude * weight,
          lat: acc.lat + member.latitude * weight,
          weight: acc.weight + weight,
        };
      },
      { lon: 0, lat: 0, weight: 0 }
    );

    clusters.push({
      members,
      center: weighted.weight > 0 ? [weighted.lon / weighted.weight, weighted.lat / weighted.weight] : [members[0].longitude, members[0].latitude],
    });
  }

  return clusters;
}

export const ForecastMap = forwardRef<ForecastMapHandle, ForecastMapProps>(function ForecastMap(
  {
    darkMode,
    paletteId,
    surfaceMode,
    resolution,
    poiFilters,
    modelId,
    periods,
    selectedWeek,
    selectedWeekYear,
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
    externalValues,
    pulseAllGridCells = false,
    mapModeLabel,
    onFatalDataError,
    suggestedPlaces = [],
    selectedPlaceId = null,
    onPlaceSelect,
    sidebarOffsetPx = 0,
  }: ForecastMapProps,
  ref
) {
  trackRender("ForecastMap", { resolution, modelId, darkMode });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleUrl = useMemo(() => (darkMode ? DARK_STYLE : VOYAGER_STYLE), [darkMode]);
  const sidebarPaddingRight = useMemo(
    () => (sidebarOffsetPx > 0 ? Math.max(0, Math.round(sidebarOffsetPx * 0.72)) : 0),
    [sidebarOffsetPx]
  );
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
  const sortedValuesDescRef = useRef<number[]>([]);
  const totalCellsRef = useRef(0);
  const shimmerThresholdRef = useRef<number | undefined>(undefined);
  const legendSpecRef = useRef<HeatScale | null>(null);
  const styleUrlRef = useRef(styleUrl);
  const activeStyleUrlRef = useRef(styleUrl);
  const mapReadyRef = useRef(false);
  const hotspotsOnlyRef = useRef(hotspotsEnabled);
  const lastGridLayerSignatureRef = useRef<string | null>(null);
  const hoveredCellRef = useRef<string | null>(null);
  const poiMarkersRef = useRef<maplibregl.Marker[]>([]);
  const suggestedPlaceMarkersRef = useRef<maplibregl.Marker[]>([]);
  const poiLoadedRef = useRef(false);
  const poiDataRef = useRef<Array<{ type: string; name: string; latitude: number; longitude: number }> | null>(null);
  const periodsRef = useRef<Period[]>(periods);
  const modelIdRef = useRef(modelId);
  const resolutionRef = useRef(resolution);
  const selectedWeekRef = useRef(selectedWeek);
  const selectedWeekYearRef = useRef(selectedWeekYear);
  const sparklineCacheRef = useRef<Map<string, SparklineSeries>>(new Map());
  const forecastPeriodCacheRef = useRef<Map<string, Promise<Record<string, number>>>>(new Map());
  const sightingsWeekCacheRef = useRef<Map<string, Promise<LngLat[]>>>(new Map());
  const sparkPopupRef = useRef<maplibregl.Popup | null>(null);
  const sparkRequestIdRef = useRef(0);
  const onGridCellSelectRef = useRef(onGridCellSelect);
  const onGridCellExpandRef = useRef(onGridCellExpand);

  const [legendSpec, setLegendSpec] = useState<HeatScale | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [suggestedPlaceZoom, setSuggestedPlaceZoom] = useState(DEFAULT_ZOOM);

  const hasForecastLegend = legendSpec !== null;

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

  const renderForecastLayer = useCallback(
    (map: MapLibreMap) => {
      if (!overlayRef.current) return;

      const threshold = resolveHotspotThreshold();
      const hotspots = hotspotsOnlyRef.current;
      const zeroModeledHotspots =
        hotspots &&
        hotspotMode !== "custom" &&
        expectedActivityHotspotCellCountRef.current !== null &&
        Number.isFinite(expectedActivityHotspotCellCountRef.current) &&
        expectedActivityHotspotCellCountRef.current <= 0;
      const hotspotOverlayVisible = hotspots && !zeroModeledHotspots;
      const scale = legendSpecRef.current;

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

      addSurfaceOverlay(map, overlayRef.current, activePalette.colors, scale);

      if (hotspots) {
        if (surfaceMode === "surface") {
          setGridBaseVisibility(map, false);
          setSurfaceVisibility(map, true);
          setHotspotVisibility(map, hotspotOverlayVisible);
        } else if (hotspotOverlayVisible) {
          setGridBaseVisibility(map, false);
          setSurfaceVisibility(map, false);
          setHotspotVisibility(map, true);
        } else {
          setGridVisibility(map, true);
          setSurfaceVisibility(map, false);
          setHotspotVisibility(map, false);
        }
      } else if (surfaceMode === "surface") {
        setGridBaseVisibility(map, false);
        setSurfaceVisibility(map, true);
        setHotspotVisibility(map, false);
      } else {
        setGridVisibility(map, true);
        setSurfaceVisibility(map, false);
        setHotspotVisibility(map, false);
      }

      setGridHoverCell(map, hoveredCellRef.current);
    },
    [
      activePalette.colors,
      darkMode,
      gridBorderColor,
      gridLineAccentColor,
      hotspotMode,
      resolution,
      resolveHotspotThreshold,
      surfaceMode,
    ]
  );

  const scheduleForecastRender = useCallback(
    (map: MapLibreMap, isCancelled?: () => boolean) => {
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
        try {
          renderForecastLayer(map);
          done = true;
          cleanup();
        } catch {
          // Retry while style/data settles.
        }
      };

      const poll = () => {
        if (done) return;
        tryRender();
        if (done) return;
        attempts += 1;
        if (attempts > 300) {
          cleanup();
          return;
        }
        timeoutId = window.setTimeout(poll, 60);
      };

      map.on("styledata", tryRender);
      map.on("load", tryRender);
      poll();
    },
    [renderForecastLayer]
  );

  const requestForecastRender = useCallback(
    (map: MapLibreMap) => {
      if (!overlayRef.current || !mapRef.current || mapRef.current !== map) return;
      if (!map.isStyleLoaded()) {
        scheduleForecastRender(map);
        return;
      }
      try {
        renderForecastLayer(map);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("style") || message.toLowerCase().includes("loading")) {
          scheduleForecastRender(map);
          return;
        }
        throw error;
      }
    },
    [renderForecastLayer, scheduleForecastRender]
  );

  const scheduleForecastRenderRef = useRef(scheduleForecastRender);

  useEffect(() => {
    scheduleForecastRenderRef.current = scheduleForecastRender;
  }, [scheduleForecastRender]);

  const captureMapSnapshot = useCallback(
    async ({
      center,
      zoom,
      width,
      height,
      includeForecastOverlay = true,
    }: {
      center?: LngLat;
      zoom?: number;
      width?: number;
      height?: number;
      includeForecastOverlay?: boolean;
    } = {}) => {
      const sourceMap = mapRef.current;
      const sourceCanvas = sourceMap?.getCanvas();
      const overlay = overlayRef.current;
      if (!sourceMap || !sourceCanvas) return null;
      if (includeForecastOverlay && !overlay) return null;

      type MapOptionsPatched = maplibregl.MapOptions & {
        preserveDrawingBuffer?: boolean;
        cooperativeGestures?: boolean;
      };

      const container = document.createElement("div");
      const snapshotWidth = Math.max(
        1,
        width ?? sourceCanvas.clientWidth ?? containerRef.current?.clientWidth ?? 1024
      );
      const snapshotHeight = Math.max(
        1,
        height ?? sourceCanvas.clientHeight ?? containerRef.current?.clientHeight ?? 768
      );
      container.style.cssText = `position:fixed;left:-10000px;top:0;width:${snapshotWidth}px;height:${snapshotHeight}px;pointer-events:none;opacity:0;`;
      document.body.appendChild(container);

      let tempMap: MapLibreMap | null = null;
      try {
      const sourceCenter = sourceMap.getCenter();
      tempMap = new maplibregl.Map({
        container,
        style: styleUrlRef.current,
        center: center ?? [sourceCenter.lng, sourceCenter.lat],
          zoom: zoom ?? sourceMap.getZoom(),
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
        if (includeForecastOverlay && overlay) {
          addGridOverlay(
            tempMap,
            overlay,
            fillExprRef.current ?? undefined,
            resolveHotspotThreshold(),
            hotspotsOnlyRef.current,
            shimmerThresholdRef.current,
            gridBorderColor,
            gridLineAccentColor
          );
          if (hotspotsOnlyRef.current) {
            setGridBaseVisibility(tempMap, false);
            setHotspotVisibility(tempMap, true);
          } else {
            setGridVisibility(tempMap, true);
            setHotspotVisibility(tempMap, false);
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
      } catch {
        return null;
      } finally {
        tempMap?.remove();
        container.remove();
      }
    },
    [gridBorderColor, gridLineAccentColor, resolveHotspotThreshold]
  );

  const captureCurrentMapSnapshot = useCallback(async () => {
    return captureMapSnapshot();
  }, [captureMapSnapshot]);

  const capturePlacePreview = useCallback(
    async ({
      center,
      zoom = 11.8,
      width = 720,
      height = 320,
    }: {
      center: LngLat;
      zoom?: number;
      width?: number;
      height?: number;
    }) =>
      captureMapSnapshot({
        center,
        zoom,
        width,
        height,
        includeForecastOverlay: true,
      }),
    [captureMapSnapshot]
  );

  useImperativeHandle(
    ref,
    () => ({
      captureSnapshot: captureCurrentMapSnapshot,
      capturePlacePreview,
    }),
    [captureCurrentMapSnapshot, capturePlacePreview]
  );

  useForecastData({
    resolution,
    mapReady,
    forecastPath,
    fallbackForecastPath,
    modelId,
    externalValues,
    pulseAllGridCells,
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
    sortedValuesDescRef,
    totalCellsRef,
    shimmerThresholdRef,
    setLegendSpec,
    scheduleForecastRender,
    onFatalDataError,
  });

  useEffect(() => {
    styleUrlRef.current = styleUrl;
    activeStyleUrlRef.current = styleUrl;
  }, [styleUrl]);

  useEffect(() => {
    colorScaleValuesRef.current = colorScaleValues;
  }, [colorScaleValues]);

  useEffect(() => {
    legendSpecRef.current = legendSpec;
  }, [legendSpec]);

  useEffect(() => {
    mapReadyRef.current = mapReady;
  }, [mapReady]);

  useEffect(() => {
    periodsRef.current = periods;
    modelIdRef.current = modelId;
    resolutionRef.current = resolution;
    selectedWeekRef.current = selectedWeek;
    selectedWeekYearRef.current = selectedWeekYear;
    onGridCellSelectRef.current = onGridCellSelect;
    onGridCellExpandRef.current = onGridCellExpand;
  }, [periods, modelId, resolution, selectedWeek, selectedWeekYear, onGridCellSelect, onGridCellExpand]);

  useEffect(() => {
    hotspotsOnlyRef.current = hotspotsEnabled;
  }, [hotspotsEnabled]);

  useEffect(() => {
    expectedActivityHotspotCellCountRef.current =
      coerceExpectedActivityHotspotCellCount(expectedActivityHotspotCellCount);
  }, [expectedActivityHotspotCellCount]);

  useEffect(() => {
    lastGridLayerSignatureRef.current = null;
  }, [resolution, modelId, forecastPath, fallbackForecastPath, externalValues, pulseAllGridCells, activePalette]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    type MapOptionsPatched = maplibregl.MapOptions & {
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

    map.on("error", (e: { error?: unknown }) => console.error("[MapLibre] error:", e?.error || e));

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
        enableSparklinePopupRef: { current: true },
      });

    map.on("click", "grid-fill", handleSparklineClick);
    map.on("mouseenter", "grid-fill", handleMouseEnter);
    map.on("mousemove", "grid-fill", handleMouseMove);
    map.on("mouseleave", "grid-fill", handleMouseLeave);

    map.once("load", () => {
      lastGridLayerSignatureRef.current = null;
      mapReadyRef.current = true;
      setMapReady(true);
      setSuggestedPlaceZoom(map.getZoom());
      safeApplyBasemapVisualTuning(map, styleUrlRef.current === DARK_STYLE);
      map.resize();
      scheduleForecastRenderRef.current(map);
    });

    const handleStyleData = () => {
      safeApplyBasemapVisualTuning(map, styleUrlRef.current === DARK_STYLE);
      if (!mapReadyRef.current && map.isStyleLoaded()) {
        mapReadyRef.current = true;
        setMapReady(true);
        map.resize();
      }
    };
    map.on("styledata", handleStyleData);
    const handleZoomEnd = () => setSuggestedPlaceZoom(map.getZoom());
    map.on("zoomend", handleZoomEnd);

    mapRef.current = map;

    const raf = window.requestAnimationFrame(() => map.resize());
    const t1 = window.setTimeout(() => map.resize(), 50);
    const t2 = window.setTimeout(() => map.resize(), 250);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      map.off("click", "grid-fill", handleSparklineClick);
      map.off("mouseenter", "grid-fill", handleMouseEnter);
      map.off("mousemove", "grid-fill", handleMouseMove);
      map.off("mouseleave", "grid-fill", handleMouseLeave);
      map.off("styledata", handleStyleData);
      map.off("zoomend", handleZoomEnd);
      sparkPopupRef.current?.remove();
      sparkPopupRef.current = null;
      suggestedPlaceMarkersRef.current.forEach((marker) => marker.remove());
      suggestedPlaceMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

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
    const restore = () => {
      if (!mapRef.current || mapRef.current !== map || !map.isStyleLoaded()) {
        window.requestAnimationFrame(restore);
        return;
      }
      map.jumpTo({ center, zoom, bearing, pitch });
      safeApplyBasemapVisualTuning(map, styleUrl === DARK_STYLE);
      map.resize();
      scheduleForecastRender(map);
    };
    window.requestAnimationFrame(restore);
  }, [mapReady, scheduleForecastRender, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || overlayRef.current == null) return;
    const values = valuesByCellRef.current ?? {};
    const scaleSourceValues =
      useExternalColorScale && colorScaleValuesRef.current && Object.keys(colorScaleValuesRef.current).length > 0
        ? colorScaleValuesRef.current
        : values;
    const { fillColorExpr, scale } = buildAutoColorExprFromValues(scaleSourceValues, activePalette.colors);
    fillExprRef.current = fillColorExpr as unknown as FillColorSpec;
    legendSpecRef.current = scale;
    setLegendSpec(scale);
    requestForecastRender(map);
  }, [activePalette, colorScaleValues, mapReady, requestForecastRender, useExternalColorScale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !overlayRef.current) return;
    requestForecastRender(map);
  }, [hotspotsEnabled, legendSpec, requestForecastRender]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || surfaceMode !== "surface") return;

    const handleSurfaceViewportChange = () => {
      if (!overlayRef.current || !mapRef.current || mapRef.current !== map) return;
      requestForecastRender(map);
    };

    map.on("moveend", handleSurfaceViewportChange);
    map.on("zoomend", handleSurfaceViewportChange);
    return () => {
      map.off("moveend", handleSurfaceViewportChange);
      map.off("zoomend", handleSurfaceViewportChange);
    };
  }, [mapReady, requestForecastRender, surfaceMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const zeroModeledHotspots =
      hotspotMode === "modeled" &&
      coerceExpectedActivityHotspotCellCount(expectedActivityHotspotCellCount) === 0;

    if (!hasForecastLegend) {
      setGridCoreLayerVisibility(map, true);
      setGridVisibility(map, true);
      setHotspotVisibility(map, false);
      return;
    }

    setGridCoreLayerVisibility(map, true);
    if (hotspotsEnabled) {
      setGridBaseVisibility(map, false);
      setHotspotVisibility(map, !zeroModeledHotspots);
      if (zeroModeledHotspots) setGridVisibility(map, false);
    } else {
      setGridVisibility(map, true);
      setHotspotVisibility(map, false);
    }
  }, [expectedActivityHotspotCellCount, hasForecastLegend, hotspotMode, hotspotsEnabled, mapReady]);

  useEffect(() => {
    if (hasForecastLegend) return;
    if (hotspotsEnabled) onHotspotsEnabledChange(false);
  }, [hasForecastLegend, hotspotsEnabled, onHotspotsEnabledChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    suggestedPlaceMarkersRef.current.forEach((marker) => marker.remove());
    suggestedPlaceMarkersRef.current = [];

    const useClusters = suggestedPlaceZoom < SUGGESTED_PLACE_CLUSTER_MAX_ZOOM;
    const clusters = useClusters ? clusterSuggestedPlaces(suggestedPlaces) : suggestedPlaces.map((place) => ({
      members: [place],
      center: [place.longitude, place.latitude] as [number, number],
    }));

    suggestedPlaceMarkersRef.current = clusters.map((cluster) => {
      const [primaryPlace] = cluster.members;
      const selected = cluster.members.some((place) => place.id === selectedPlaceId);
      const isCluster = cluster.members.length > 1;
      const el = document.createElement("button");
      el.type = "button";
      el.className = `poiMarker poiMarker--suggested poiMarker--${primaryPlace.viewingPotential}${
        selected ? " poiMarker--selected" : ""
      }${isCluster ? " poiMarker--cluster" : ""}`;
      el.setAttribute(
        "aria-label",
        isCluster ? `Show ${cluster.members.length} suggested places in this area` : `Select ${primaryPlace.name}`
      );
      el.innerHTML = isCluster
        ? `<svg class="poiMarker__starIcon" aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M12 1.9l2.98 6.04 6.67.97-4.82 4.69 1.14 6.64L12 17.11l-5.97 3.13 1.14-6.64-4.82-4.69 6.67-.97L12 1.9z"/></svg>`
        : `<span class="material-symbols-rounded">visibility</span>`;

      el.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!isCluster) {
          onPlaceSelect?.(primaryPlace);
          return;
        }
        map.flyTo({
          center: cluster.center,
          zoom: Math.max(map.getZoom(), SUGGESTED_PLACE_CLUSTER_MAX_ZOOM + 0.85),
          duration: 650,
          essential: true,
          padding: { top: 0, right: sidebarPaddingRight, bottom: 0, left: 0 },
        });
      });

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true }).setHTML(
        isCluster
          ? `<div class="poiPopup"><div class="poiPopup__title">${cluster.members.length} suggested places</div><div class="poiPopup__meta">${primaryPlace.region ?? "Clustered forecast area"}</div></div>`
          : `<div class="poiPopup"><div class="poiPopup__title">${primaryPlace.name}</div><div class="poiPopup__meta">${primaryPlace.viewingPotential.toUpperCase()} viewing potential</div></div>`
      );

      return new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(cluster.center)
        .setPopup(popup)
        .addTo(map);
    });

    return () => {
      suggestedPlaceMarkersRef.current.forEach((marker) => marker.remove());
      suggestedPlaceMarkersRef.current = [];
    };
  }, [mapReady, onPlaceSelect, selectedPlaceId, sidebarPaddingRight, suggestedPlaceZoom, suggestedPlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedPlaceId) return;
    const selected = suggestedPlaces.find((place) => place.id === selectedPlaceId);
    if (!selected) return;
    map.flyTo({
      center: [Number(selected.longitude), Number(selected.latitude)],
      zoom: Math.max(map.getZoom(), 11),
      duration: 850,
      essential: true,
      padding: { top: 0, right: sidebarPaddingRight, bottom: 0, left: 0 },
    });
  }, [mapReady, selectedPlaceId, sidebarPaddingRight, suggestedPlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({
      center: map.getCenter(),
      duration: 0,
      padding: { top: 0, right: sidebarPaddingRight, bottom: 0, left: 0 },
    });
  }, [mapReady, sidebarPaddingRight]);

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
      const candidates = Array.from(
        new Set([
          `${normalizedBase}data/places_of_interest.json`,
          "/data/places_of_interest.json",
          "data/places_of_interest.json",
        ])
      );

      for (const url of candidates) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const payload = (await response.json()) as
            | { items?: Array<{ type: string; name: string; latitude: number; longitude: number }> }
            | Array<{ type: string; name: string; latitude: number; longitude: number }>
            | { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }> };

          const items = Array.isArray(payload)
            ? payload
            : "items" in payload && Array.isArray(payload.items)
              ? payload.items
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
          return items;
        } catch {
          // Try next candidate URL.
        }
      }

      throw new Error("Failed to load POI data");
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
        .map((poi) => ({ ...poi, filterKey: typeToFilterKey(String(poi.type ?? "")) }))
        .filter(
          (poi) => poi.filterKey !== null && Number.isFinite(Number(poi.latitude)) && Number.isFinite(Number(poi.longitude))
        );
      const filteredItems = safeItems.filter((poi) => poi.filterKey && (poiFilters[poi.filterKey] ?? false));
      const itemsToRender = filteredItems.length > 0 ? filteredItems : safeItems;

      poiMarkersRef.current = itemsToRender.map((poi) => {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "poiMarker";
        el.setAttribute("aria-label", poi.name);
        el.innerHTML = `<span class="material-symbols-rounded">${poi.filterKey ? iconMap[poi.filterKey] : "directions_boat"}</span>`;

        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true }).setHTML(
          `<div class="poiPopup"><div class="poiPopup__title">${poi.name}</div><div class="poiPopup__meta">${Number(poi.latitude).toFixed(4)}, ${Number(poi.longitude).toFixed(4)}</div></div>`
        );

        return new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([Number(poi.longitude), Number(poi.latitude)])
          .setPopup(popup)
          .addTo(map);
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
  }, [mapReady, poiFilters, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`mapStage${pulseAllGridCells ? " mapStage--tripLoading" : ""}`}>
      <div ref={containerRef} className="map" data-tour="map-canvas" />
      {pulseAllGridCells && (
        <div className="mapStage__tripLoading" aria-live="polite">
          <span className="mapStage__tripLoadingIcon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>{mapModeLabel ?? "Choose dates to build a seasonal occurrence map"}</span>
        </div>
      )}
      <MapControls
        hasForecastLegend={hasForecastLegend}
        legendOpen={legendOpen}
        legendSpec={legendSpec}
        onLegendToggle={() => setLegendOpen((value) => !value)}
        onZoomIn={() => mapRef.current?.zoomIn({ duration: 180 })}
        onZoomOut={() => mapRef.current?.zoomOut({ duration: 180 })}
      />
    </div>
  );
});
