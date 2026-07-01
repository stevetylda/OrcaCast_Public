import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { H3Resolution } from "../config/dataPaths";
import { appConfig } from "../config/appConfig";
import { DEFAULT_PALETTE_ID, getPaletteOrDefault, type PaletteId } from "../geo/palettes";

type ThemeMode = "light" | "dark" | "system";
type ForecastPlaybackDirection = 1 | -1;
type SurfaceMode = "grid" | "surface";
export type UnitsMode = "imperial" | "metric";

type MapState = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  darkMode: boolean;
  surfaceMode: SurfaceMode;
  setSurfaceMode: (value: SurfaceMode) => void;
  resolution: H3Resolution;
  setResolution: (value: H3Resolution) => void;
  modelId: string;
  setModelId: (value: string) => void;
  forecastIndex: number;
  setForecastIndex: (value: number | ((prev: number) => number)) => void;
  forecastPlaybackPlaying: boolean;
  setForecastPlaybackPlaying: (value: boolean) => void;
  forecastPlaybackDirection: ForecastPlaybackDirection;
  setForecastPlaybackDirection: (value: ForecastPlaybackDirection) => void;
  hotspotsEnabled: boolean;
  setHotspotsEnabled: (value: boolean) => void;
  hotspotMode: "modeled" | "custom";
  setHotspotMode: (value: "modeled" | "custom") => void;
  hotspotPercentile: number;
  setHotspotPercentile: (value: number) => void;
  selectedPaletteId: PaletteId;
  setSelectedPaletteId: (value: PaletteId) => void;
  unitsMode: UnitsMode;
  setUnitsMode: (value: UnitsMode) => void;
};

const MapStateContext = createContext<MapState | null>(null);
const THEME_MODE_STORAGE_KEY = "orcacast.themeMode";
const PALETTE_STORAGE_KEY = "orcacast.paletteId";
const SURFACE_MODE_STORAGE_KEY = "orcacast.surfaceMode";
const UNITS_MODE_STORAGE_KEY = "orcacast.unitsMode";

const getSystemPrefersDark = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
};

const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "dark";
};

export function MapStateProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredThemeMode);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>(() => {
    if (typeof window === "undefined") return "grid";
    return window.localStorage.getItem(SURFACE_MODE_STORAGE_KEY) === "surface" ? "surface" : "grid";
  });
  const [resolution, setResolution] = useState<H3Resolution>("H6");
  const [modelId, setModelId] = useState(appConfig.compositeModelId);
  const [forecastIndex, setForecastIndex] = useState(-1);
  const [forecastPlaybackPlaying, setForecastPlaybackPlaying] = useState(false);
  const [forecastPlaybackDirection, setForecastPlaybackDirection] =
    useState<ForecastPlaybackDirection>(-1);
  const [hotspotsEnabled, setHotspotsEnabled] = useState(false);
  const [hotspotMode, setHotspotMode] = useState<"modeled" | "custom">("modeled");
  const [hotspotPercentile, setHotspotPercentile] = useState(1);
  const [selectedPaletteId, setSelectedPaletteId] = useState<PaletteId>(() => {
    if (typeof window === "undefined") return DEFAULT_PALETTE_ID;
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    return getPaletteOrDefault(stored).id;
  });
  const [unitsMode, setUnitsMode] = useState<UnitsMode>(() => {
    if (typeof window === "undefined") return "imperial";
    return window.localStorage.getItem(UNITS_MODE_STORAGE_KEY) === "metric" ? "metric" : "imperial";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PALETTE_STORAGE_KEY, selectedPaletteId);
  }, [selectedPaletteId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SURFACE_MODE_STORAGE_KEY, surfaceMode);
  }, [surfaceMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UNITS_MODE_STORAGE_KEY, unitsMode);
  }, [unitsMode]);

  const darkMode = useMemo(() => {
    if (themeMode === "system") return getSystemPrefersDark();
    return themeMode === "dark";
  }, [themeMode]);

  const value = useMemo(
    () => ({
      themeMode,
      setThemeMode,
      darkMode,
      surfaceMode,
      setSurfaceMode,
      resolution,
      setResolution,
      modelId,
      setModelId,
      forecastIndex,
      setForecastIndex,
      forecastPlaybackPlaying,
      setForecastPlaybackPlaying,
      forecastPlaybackDirection,
      setForecastPlaybackDirection,
      hotspotsEnabled,
      setHotspotsEnabled,
      hotspotMode,
      setHotspotMode,
      hotspotPercentile,
      setHotspotPercentile,
      selectedPaletteId,
      setSelectedPaletteId,
      unitsMode,
      setUnitsMode,
    }),
    [
      themeMode,
      darkMode,
      surfaceMode,
      resolution,
      modelId,
      forecastIndex,
      forecastPlaybackPlaying,
      forecastPlaybackDirection,
      hotspotsEnabled,
      hotspotMode,
      hotspotPercentile,
      selectedPaletteId,
      unitsMode,
    ]
  );

  return <MapStateContext.Provider value={value}>{children}</MapStateContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMapState() {
  const ctx = useContext(MapStateContext);
  if (!ctx) throw new Error("useMapState must be used within MapStateProvider");
  return ctx;
}
