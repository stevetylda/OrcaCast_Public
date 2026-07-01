import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";
import type { H3Resolution } from "../../shared/config/dataPaths";
import type { DataLoadError } from "../../shared/data/errors";
import type { Period } from "../../shared/data/periods";
import type { PaletteId } from "../../shared/geo/palettes";
import type { SuggestedPlace } from "../locations/types";

export type FillColorSpec = DataDrivenPropertyValueSpecification<string>;
export type LngLat = [number, number];
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
  forecastPath?: string;
  fallbackForecastPath?: string;
  colorScaleValues?: Record<string, number>;
  useExternalColorScale?: boolean;
  externalValues?: Record<string, number>;
  pulseAllGridCells?: boolean;
  mapModeLabel?: string;
  onFatalDataError?: (error: DataLoadError) => void;
  suggestedPlaces?: SuggestedPlace[];
  selectedPlaceId?: string | null;
  onPlaceSelect?: (place: SuggestedPlace) => void;
  sidebarOffsetPx?: number;
};

export type ForecastMapHandle = {
  captureSnapshot: () => Promise<Blob | null>;
  capturePlacePreview: (options: {
    center: LngLat;
    zoom?: number;
    width?: number;
    height?: number;
  }) => Promise<Blob | null>;
};
