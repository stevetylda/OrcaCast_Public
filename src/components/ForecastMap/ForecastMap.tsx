import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
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
import { getPaletteOrDefault } from "../../constants/palettes";
import { trackLayerRebuild, trackRender } from "../../debug/perf";
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

export const ForecastMap = forwardRef<ForecastMapHandle, ForecastMapProps>(function ForecastMap(
  {
    darkMode,
    paletteId,
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
    onFatalDataError,
  }: ForecastMapProps,
  ref
) {
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

      if (hotspots) {
        if (hotspotOverlayVisible) {
          setGridBaseVisibility(map, false);
          setHotspotVisibility(map, true);
        } else {
          setGridVisibility(map, true);
          setHotspotVisibility(map, false);
        }
      } else {
        setGridVisibility(map, true);
        setHotspotVisibility(map, false);
      }

      setGridHoverCell(map, hoveredCellRef.current);
    },
    [gridBorderColor, gridLineAccentColor, hotspotMode, resolution, resolveHotspotThreshold]
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
    container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;pointer-events:none;opacity:0;`;
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
  }, [gridBorderColor, gridLineAccentColor, resolveHotspotThreshold]);

  useImperativeHandle(ref, () => ({ captureSnapshot: captureCurrentMapSnapshot }), [captureCurrentMapSnapshot]);

  useForecastData({
    resolution,
    mapReady,
    forecastPath,
    fallbackForecastPath,
    modelId,
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
  }, [resolution, modelId, forecastPath, fallbackForecastPath, activePalette]);

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

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
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
      safeApplyBasemapVisualTuning(map, styleUrlRef.current === DARK_STYLE);
      map.resize();
      scheduleForecastRender(map);
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
      sparkPopupRef.current?.remove();
      sparkPopupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [scheduleForecastRender, styleUrl]);

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
    renderForecastLayer(map);
  }, [activePalette, colorScaleValues, mapReady, renderForecastLayer, useExternalColorScale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !overlayRef.current) return;
    if (!map.isStyleLoaded()) {
      scheduleForecastRender(map);
      return;
    }
    renderForecastLayer(map);
  }, [hotspotsEnabled, legendSpec, renderForecastLayer, scheduleForecastRender]);

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
    <div className="mapStage">
      <div ref={containerRef} className="map" data-tour="map-canvas" />
      <MapControls
        hotspotsEnabled={hotspotsEnabled}
        hasForecastLegend={hasForecastLegend}
        legendOpen={legendOpen}
        legendSpec={legendSpec}
        onHotspotsEnabledChange={onHotspotsEnabledChange}
        onLegendToggle={() => setLegendOpen((value) => !value)}
      />
    </div>
  );
});
