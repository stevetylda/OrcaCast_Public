import { driver } from "driver.js";

type TourStepDef = {
  id: string;
  title: string;
  description: string;
  detail?: string;
  targetSelector?: string;
  targetSelectors?: string[];
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  offset?: number;
  spotlightPadding?: number;
  spotlightMode?: "union" | "bridge";
};

const SPOTLIGHT_ID = "orcacast-tour-spotlight";
const SPOTLIGHT_PADDING = 14;

const ALL_STEPS: TourStepDef[] = [
  {
    id: "top-bar",
    title: "Top bar",
    description: "Global controls for navigation, forecast period, and view options. Use this row to set the week and overall map look.",
    detail: "",
    targetSelector: '[data-tour="top-bar"]',
    side: "bottom",
    align: "center",
    offset: 12,
  },
  {
    id: "map-canvas",
    title: "Map canvas",
    description: "Pan and zoom to explore the forecast surface.",
    detail: "Hotter cells mean higher relative likelihood.",
    targetSelector: '[data-tour="map-canvas"]',
    side: "bottom",
    align: "center",
    offset: 12,
  },
  {
    id: "menu",
    title: "Menu",
    description: "Open pages like About, Models, Explainability, and Data.",
    detail: "Best when you want model context or data sources.",
    targetSelector: '[data-tour="menu"]',
    side: "right",
    align: "start",
    offset: 12,
  },
  {
    id: "forecast-period",
    title: "Forecast period",
    description: "Scrub and play through forecast weeks.",
    detail: "Use playback to compare shifts across the season.",
    targetSelector: '[data-tour="forecast-period"]',
    side: "bottom",
    align: "center",
    offset: 12,
  },
  {
    id: "resolution",
    title: "Resolution",
    description: "Cycle regional, sub-regional, and local hex detail.",
    detail: "Start broad, then zoom into local hotspots.",
    targetSelector: '[data-tour="resolution"]',
    side: "bottom",
    align: "center",
    offset: 12,
  },
  {
    id: "theme-toggle",
    title: "Theme",
    description: "Switch between light and dark mode.",
    detail: "Use dark mode for lower glare at night.",
    targetSelector: '[data-tour="theme-toggle"]',
    side: "bottom",
    align: "center",
    offset: 12,
  },
  {
    id: "info",
    title: "Info",
    description: "Re-open this modal any time for sources and the tour.",
    detail: "Great for explaining the forecast to someone new.",
    targetSelector: '[data-tour="info"]',
    side: "bottom",
    align: "center",
    offset: 12,
  },
  {
    id: "tools",
    title: "Settings & options",
    description: "Open the tools drawer for overlays and filters.",
    detail: "These switches add context to the forecast.",
    targetSelector: '[data-tour="tools"]',
    side: "left",
    align: "center",
    offset: 12,
  },
  {
    id: "history",
    title: "Last week sightings",
    description: "Toggle previous or selected-week sightings.",
    detail: "Use it to compare forecast vs. recent observations.",
    targetSelector: '[data-tour="history"]',
    side: "left",
    align: "center",
    offset: 10,
  },
  {
    id: "timeseries",
    title: "Timeseries",
    description: "Open the weekly activity chart.",
    detail: "Best for spotting seasonal peaks and dips.",
    targetSelector: '[data-tour="timeseries"]',
    side: "left",
    align: "center",
    offset: 10,
  },
  {
    id: "compare",
    title: "Compare mode",
    description: "Open side-by-side compare mode for two models/periods.",
    detail: "Use this to inspect differences with shared or separate scales.",
    targetSelector: '[data-tour="tools-compare-toggle"]',
    side: "left",
    align: "center",
    offset: 10,
  },
  {
    id: "palette-picker",
    title: "Color palette",
    description: "Switch the 8-bin Sighting Outlook color palette.",
    detail: "Palette changes restyle both map fills and legend immediately.",
    targetSelector: '[data-tour="palette-picker"]',
    side: "left",
    align: "center",
    offset: 10,
  },
  {
    id: "poi",
    title: "Parks + viewpoints",
    description: "Toggle the parks/POI overlay.",
    detail: "Use this for planning or context at a glance.",
    targetSelector: '[data-tour="poi"]',
    side: "left",
    align: "center",
    offset: 10,
  },
  {
    id: "hotspots",
    title: "Hotspots",
    description: "Toggle the hotspots-only view on map controls.",
    detail: "Use this to isolate the highest-likelihood cells.",
    targetSelector: '[data-tour="hotspots"]',
    side: "left",
    align: "center",
    offset: 10,
  },
  {
    id: "legend",
    title: "Probability legend",
    description: "Explains how to read the heat scale (No probability → Peak).",
    detail: "Toggle the legend on/off here; colors are relative within the selected week.",
    targetSelectors: ['[data-tour="legend"]', '[data-tour="legend-toggle"]'],
    side: "left",
    align: "center",
    offset: 12,
    spotlightPadding: 4,
    spotlightMode: "bridge",
  },
  {
    id: "zoom-controls",
    title: "Zoom controls",
    description: "Use + and - to zoom the map.",
    detail: "Keyboard and trackpad zoom still work too.",
    targetSelector: ".maplibregl-ctrl-bottom-right .maplibregl-ctrl-group",
    side: "left",
    align: "center",
    offset: 12,
  },
  {
    id: "model-selector",
    title: "Model selection",
    description: "Choose which forecast model powers the map.",
    detail: "Try alternatives if you want a different bias.",
    targetSelector: '[data-tour="model-selector"]',
    side: "top",
    align: "center",
    offset: 12,
  },
  {
    id: "re-run",
    title: "Re-run the tour",
    description: "You can start this walkthrough any time from the info menu.",
    detail: "If anything changes, this tour stays up to date.",
    targetSelector: '[data-tour="info"]',
    side: "bottom",
    align: "center",
    offset: 12,
  },
];

type Rect = { left: number; top: number; right: number; bottom: number };

function getTargets(step: TourStepDef) {
  const selectors = step.targetSelectors ?? (step.targetSelector ? [step.targetSelector] : []);
  return selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
}

function stepIsAvailable(step: TourStepDef) {
  return getTargets(step).length > 0;
}

function getUnionRect(elements: Element[]): Rect | null {
  if (elements.length === 0) return null;
  const first = elements[0]?.getBoundingClientRect();
  if (!first) return null;

  let left = first.left;
  let top = first.top;
  let right = first.right;
  let bottom = first.bottom;

  elements.slice(1).forEach((el) => {
    const rect = el.getBoundingClientRect();
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  });

  return { left, top, right, bottom };
}

function getBridgeRect(elements: Element[]): Rect | null {
  if (elements.length === 0) return null;
  const rects = elements
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return null;

  const largest = rects.reduce((best, rect) => {
    const bestArea = best.width * best.height;
    const rectArea = rect.width * rect.height;
    return rectArea > bestArea ? rect : best;
  }, rects[0]);

  const remaining = rects.filter((rect) => rect !== largest);
  if (remaining.length === 0) {
    return {
      left: largest.left,
      top: largest.top,
      right: largest.right,
      bottom: largest.bottom,
    };
  }

  const nearest = remaining.reduce((best, rect) => {
    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const bestCenterX = (best.left + best.right) / 2;
    const bestCenterY = (best.top + best.bottom) / 2;
    const dx = centerX - (largest.left + largest.right) / 2;
    const dy = centerY - (largest.top + largest.bottom) / 2;
    const bestDx = bestCenterX - (largest.left + largest.right) / 2;
    const bestDy = bestCenterY - (largest.top + largest.bottom) / 2;
    return dx * dx + dy * dy < bestDx * bestDx + bestDy * bestDy ? rect : best;
  }, remaining[0]);

  return {
    left: Math.min(largest.left, nearest.left),
    top: Math.min(largest.top, nearest.top),
    right: Math.max(largest.right, nearest.right),
    bottom: Math.max(largest.bottom, nearest.bottom),
  };
}

function ensureSpotlightElement() {
  let el = document.getElementById(SPOTLIGHT_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = SPOTLIGHT_ID;
  el.setAttribute("aria-hidden", "true");
  el.style.position = "fixed";
  el.style.pointerEvents = "none";
  el.style.left = "0";
  el.style.top = "0";
  el.style.width = "0";
  el.style.height = "0";
  document.body.appendChild(el);
  return el;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function applySpotlight(step: TourStepDef) {
  const elements = getTargets(step);
  const rect =
    step.spotlightMode === "bridge" ? getBridgeRect(elements) : getUnionRect(elements);
  if (!rect) return;

  const padding = step.spotlightPadding ?? SPOTLIGHT_PADDING;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = clamp(rect.left - padding, 8, viewportWidth - 8);
  const top = clamp(rect.top - padding, 8, viewportHeight - 8);
  const right = clamp(rect.right + padding, 8, viewportWidth - 8);
  const bottom = clamp(rect.bottom + padding, 8, viewportHeight - 8);

  const spotlight = ensureSpotlightElement();
  spotlight.style.left = `${left}px`;
  spotlight.style.top = `${top}px`;
  spotlight.style.width = `${Math.max(0, right - left)}px`;
  spotlight.style.height = `${Math.max(0, bottom - top)}px`;
}

function ensureToolDrawerOpen() {
  const toggle = document.querySelector('[data-tour="tools"]') as HTMLElement | null;
  if (!toggle) return;
  const panel = document.querySelector(".toolDrawer__panel");
  if (!panel) toggle.click();
}

function ensureLegendOpen() {
  const legend = document.querySelector('[data-tour="legend"]');
  if (legend) return;
  const toggle = document.querySelector('[data-tour="legend-toggle"]') as HTMLElement | null;
  if (toggle) toggle.click();
}

function setMapInteractions(enabled: boolean) {
  const map = (window as { __ORCACAST_MAP?: unknown }).__ORCACAST_MAP as
    | {
        scrollZoom?: { disable: () => void; enable: () => void };
        dragPan?: { disable: () => void; enable: () => void };
      }
    | undefined;

  if (!map) return;
  if (enabled) {
    map.scrollZoom?.enable?.();
    map.dragPan?.enable?.();
    return;
  }

  map.scrollZoom?.disable?.();
  map.dragPan?.disable?.();
}

export function startMapTour() {
  ensureToolDrawerOpen();
  setMapInteractions(false);

  window.setTimeout(() => {
    ensureLegendOpen();

    window.setTimeout(() => {
      const availableDefs = ALL_STEPS.filter(stepIsAvailable);
      if (availableDefs.length === 0) return;

      const steps = availableDefs.map((step) => ({
        element: `#${SPOTLIGHT_ID}`,
        popover: {
          title: step.title,
          description: step.detail
            ? `${step.description} ${step.detail}`
            : step.description,
          side: step.side,
          align: step.align,
          offset: step.offset,
        },
        id: step.id,
      }));

      const updateProgress = (id: string | undefined) => {
        if (!id) return;
        const index = availableDefs.findIndex((step) => step.id === id);
        if (index < 0) return;
        const progress = (index + 1) / availableDefs.length;
        document.documentElement.style.setProperty("--tour-progress", `${progress}`);
      };

      applySpotlight(availableDefs[0]);
      updateProgress(availableDefs[0]?.id);

      const tour = driver({
        showProgress: true,
        overlayOpacity: 0.65,
        animate: true,
        allowClose: true,
        stagePadding: 12,
        stageRadius: 14,
        popoverClass: "orcacast-tour",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        closeBtnText: "Skip",
        steps,
        onHighlightStarted: (_element: unknown, step: { id?: string } | undefined) => {
          const current = availableDefs.find((entry) => entry.id === step?.id);
          if (!current) return;
          applySpotlight(current);
          updateProgress(current.id);
        },
        onDestroyed: () => {
          localStorage.setItem("orcacast.tour.seen", "true");
          setMapInteractions(true);
          document.documentElement.style.removeProperty("--tour-progress");
          const spotlight = document.getElementById(SPOTLIGHT_ID);
          if (spotlight) spotlight.remove();
        },
      } as Parameters<typeof driver>[0]);

      tour.drive();
    }, 140);
  }, 80);
}
