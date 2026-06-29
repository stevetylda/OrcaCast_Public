import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";
import type { H3Resolution } from "../../config/dataPaths";
import type { DataLoadError } from "../../data/errors";
import type { Period } from "../../data/periods";
import type { PaletteId } from "../../constants/palettes";
import type { DeltaLegendSpec } from "../../map/deltaMap";

export type FillColorSpec = DataDrivenPropertyValueSpecification<string>;
export type LastWeekMode = "none" | "previous" | "selected" | "both";
export type ForecastDisplayMode = "hex" | "smooth";
export type LngLat = [number, number];
export type SparklineSeries = { forecast: number[]; sightings: number[] };

export type CompareMapViewState = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

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
  displayMode: ForecastDisplayMode;
  resolution: H3Resolution;
  showLastWeek: boolean;
  lastWeekMode: LastWeekMode;
  poiFilters: { Park: boolean; Marina: boolean; Ferry: boolean };
  modelId: string;
  periods: Period[];
  selectedWeek: number;
  selectedWeekYear: number;
  timeseriesOpen: boolean;
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
  derivedValuesByCell?: Record<string, number>;
  derivedValueProperty?: string;
  derivedFillExpr?: unknown[];
  deltaLegend?: DeltaLegendSpec | null;
  disableHotspots?: boolean;
  enableSparklinePopup?: boolean;
  cellPopupHtmlBuilder?: (cellId: string) => string | null | undefined;
  syncViewState?: CompareMapViewState | null;
  onMoveViewState?: (viewState: CompareMapViewState) => void;
  onMoveEndViewState?: (viewState: CompareMapViewState) => void;
  onFatalDataError?: (error: DataLoadError) => void;
};

export type ForecastMapHandle = {
  captureSnapshot: () => Promise<Blob | null>;
};
