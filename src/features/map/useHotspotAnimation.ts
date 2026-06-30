import { useEffect, type MutableRefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

type UseHotspotAnimationArgs = {
  mapReady: boolean;
  mapRef: MutableRefObject<MapLibreMap | null>;
  hotspotsOnlyRef: MutableRefObject<boolean>;
  resolution: string;
  forecastPath?: string;
};

export function useHotspotAnimation({
  mapReady,
  mapRef,
  hotspotsOnlyRef,
  resolution,
  forecastPath,
}: UseHotspotAnimationArgs) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let rafId = 0;
    let lastTick = 0;

    const hasStyleLayer = (layerId: string) => {
      try {
        return map.isStyleLoaded() && !!map.getStyle()?.layers && !!map.getLayer(layerId);
      } catch {
        return false;
      }
    };

    const setLayerPaint = (layerId: string, property: string, value: number | string) => {
      try {
        if (hasStyleLayer(layerId)) {
          map.setPaintProperty(layerId, property, value);
        }
      } catch {
        // Style can be transiently unavailable during setStyle()/dark-mode transitions.
      }
    };

    const tick = (time: number) => {
      if (!mapRef.current || mapRef.current !== map) return;
      if (!map.isStyleLoaded()) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (time - lastTick > 120) {
        lastTick = time;
        const t = time / 1000;
        const hideGrid = hotspotsOnlyRef.current;
        const z = map.getZoom();
        const edgeBaseWidth =
          z <= 6 ? 0.9 : z <= 9 ? 0.9 + ((z - 6) / 3) * 0.35 : z <= 12 ? 1.25 + ((z - 9) / 3) * 0.55 : 1.8;
        const edgePulseWidth = edgeBaseWidth + 0.1 * Math.sin(t * 1.7 + 0.5);
        const opacityPairs: Array<[string, string, number]> = [
          ["grid-shimmer-fill", "fill-opacity", hideGrid ? 0 : 0.16 + 0.06 * Math.sin(t * 0.6)],
          ["grid-peak-shine", "line-opacity", hideGrid ? 0 : 0.22 + 0.06 * Math.sin(t * 0.5 + 0.8)],
          ["grid-bio-glow-fill", "fill-opacity", hideGrid ? 0 : 0.13 + 0.06 * Math.sin(t * 1.35 + 0.4)],
          ["grid-bio-core-fill", "fill-opacity", hideGrid ? 0 : 0.06 + 0.035 * Math.sin(t * 1.9 + 1.2)],
          ["grid-bio-edge", "line-opacity", hideGrid ? 0 : 0.28 + 0.08 * Math.sin(t * 1.4 + 0.2)],
          ["grid-hover-fill", "fill-opacity", hideGrid ? 0 : 0.16 + 0.06 * Math.sin(t * 1.5 + 0.2)],
          ["grid-hover-glow", "line-opacity", hideGrid ? 0 : 0.42 + 0.18 * Math.sin(t * 1.9)],
          ["grid-hover-core", "line-opacity", hideGrid ? 0 : 0.72 + 0.18 * Math.sin(t * 1.2 + 0.9)],
        ];

        opacityPairs.forEach(([layerId, property, value]) => {
          setLayerPaint(layerId, property, value);
        });
        setLayerPaint(
          "grid-shimmer-fill",
          "fill-color",
          `rgba(140,255,245,${0.28 + 0.08 * Math.sin(t * 0.35)})`
        );
        setLayerPaint("grid-bio-edge", "line-width", edgePulseWidth);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mapReady, mapRef, hotspotsOnlyRef, resolution, forecastPath]);
}
