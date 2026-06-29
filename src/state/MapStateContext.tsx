import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { H3Resolution } from "../config/dataPaths";
import { appConfig } from "../config/appConfig";
import { DEFAULT_PALETTE_ID, getPaletteOrDefault, type PaletteId } from "../constants/palettes";

type ThemeMode = "light" | "dark" | "system";
type ForecastPlaybackDirection = 1 | -1;

type MapState = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  darkMode: boolean;
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
};

const MapStateContext = createContext<MapState | null>(null);
const THEME_MODE_STORAGE_KEY = "orcacast.themeMode";
const PALETTE_STORAGE_KEY = "orcacast.paletteId";

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
  const [resolution, setResolution] = useState<H3Resolution>("H4");
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PALETTE_STORAGE_KEY, selectedPaletteId);
  }, [selectedPaletteId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const darkMode = useMemo(() => {
    if (themeMode === "system") return getSystemPrefersDark();
    return themeMode === "dark";
  }, [themeMode]);

  const value = useMemo(
    () => ({
      themeMode,
      setThemeMode,
      darkMode,
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
    }),
    [
      themeMode,
      darkMode,
      resolution,
      modelId,
      forecastIndex,
      forecastPlaybackPlaying,
      forecastPlaybackDirection,
      hotspotsEnabled,
      hotspotMode,
      hotspotPercentile,
      selectedPaletteId,
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
