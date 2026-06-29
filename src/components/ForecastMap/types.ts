import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";
import type { H3Resolution } from "../../config/dataPaths";
import type { DataLoadError } from "../../data/errors";
import type { Period } from "../../data/periods";
import type { PaletteId } from "../../constants/palettes";

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
  onFatalDataError?: (error: DataLoadError) => void;
};

export type ForecastMapHandle = {
  captureSnapshot: () => Promise<Blob | null>;
};
