import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";
import type { H3Resolution } from "../../shared/config/dataPaths";
import type { OrcasoundHydrophone } from "../../shared/data/orcasoundHydrophones";
import type { DataLoadError } from "../../shared/data/errors";
import type { Period } from "../../shared/data/periods";
import type { PlannerBaseLocation } from "../../shared/data/plannerBaseLocations";
import type { PaletteId } from "../../shared/geo/palettes";
import type { SuggestedPlace, ViewingLocation } from "../locations/types";

export type FillColorSpec = DataDrivenPropertyValueSpecification<string>;
export type LngLat = [number, number];
export type MapViewportPadding =
  number | { top: number; right: number; bottom: number; left: number };
export type SparklineSeries = { forecast: number[]; sightings: number[] };

export type GridCellExpandRequest = {
  h3: string;
  resolution: H3Resolution;
  modelId: string;
  selectedWeek: number;
  selectedWeekYear: number;
};

export type ForecastMapProps = {
  darkMode: boolean;
  basemapMode?: "vector" | "raster";
  showMapControls?: boolean;
  showLegendControl?: boolean;
  colorNoData?: boolean;
  paletteId: PaletteId;
  surfaceMode: "grid" | "surface";
  resolution: H3Resolution;
  poiFilters: { Park: boolean; Marina: boolean; Ferry: boolean };
  modelId: string;
  periods: Period[];
  selectedWeek: number;
  selectedWeekYear: number;
  hotspotsEnabled: boolean;
  hotspotMode: "modeled" | "custom";
  hotspotPercentile: number;
  expectedActivityHotspotCellCount: number | null;
  onHotspotsEnabledChange: (next: boolean) => void;
  onGridCellCount?: (count: number) => void;
  onGridCellSelect?: (h3: string) => void;
  onGridCellExpand?: (request: GridCellExpandRequest) => void;
  enableGridInteraction?: boolean;
  forecastPath?: string;
  fallbackForecastPath?: string;
  colorScaleValues?: Record<string, number>;
  useExternalColorScale?: boolean;
  externalValues?: Record<string, number>;
  forecastOverlayEnabled?: boolean;
  pulseAllGridCells?: boolean;
  mapModeLabel?: string;
  forecastOverlayLoadKey?: string;
  onForecastOverlayReady?: (loadKey: string) => void;
  onFatalDataError?: (error: DataLoadError) => void;
  suggestedPlaces?: SuggestedPlace[];
  itineraryPlaceIds?: string[];
  selectedPlaceId?: string | null;
  cameraLocations?: ViewingLocation[];
  selectedCameraId?: string | null;
  selectedHydrophoneId?: string | null;
  pulseSelectedPlaceMarker?: boolean;
  onPlaceSelect?: (place: SuggestedPlace) => void;
  showTripHotspotMarkers?: boolean;
  forceDomSuggestedMarkers?: boolean;
  baseLocation?: PlannerBaseLocation | null;
  maxTravelDistanceMiles?: number | null;
  showCameras?: boolean;
  hydrophoneLocations?: OrcasoundHydrophone[];
  showHydrophones?: boolean;
  sidebarOffsetPx?: number;
  gridPresentation?: "default" | "quiet";
};

export type ForecastMapHandle = {
  captureSnapshot: () => Promise<Blob | null>;
  captureItinerarySnapshot: (locations: LngLat[]) => Promise<Blob | null>;
  capturePlacePreview: (options: {
    center: LngLat;
    zoom?: number;
    width?: number;
    height?: number;
  }) => Promise<Blob | null>;
  fitLocations: (
    locations: LngLat[],
    options?: { padding?: MapViewportPadding; maxZoom?: number },
  ) => void;
};
