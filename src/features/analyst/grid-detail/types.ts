import type { H3Resolution } from "../../../shared/config/dataPaths";
import type { Period } from "../../../shared/data/periods";

export type GridSeriesPoint = {
  periodKey: string;
  label: string;
  weekLabel: string;
  forecast: number;
  actual: number;
};

export type ModelSeries = {
  modelId: string;
  label: string;
  values: number[];
};

export type SpreadSeriesPoint = {
  periodKey: string;
  weekLabel: string;
  selected: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  percentile: number;
};

export type NeighborhoodSeries = {
  cellId: string;
  label: string;
  forecast: number[];
  actual: number[];
  isSelected: boolean;
  ringIndex: number;
  polygons: number[][][][];
};

export type GridDetailPayload = {
  selectedSeries: GridSeriesPoint[];
  modelSeries: ModelSeries[];
  spreadSeries: SpreadSeriesPoint[];
  neighborhoodSeries: NeighborhoodSeries[];
  neighborhoodContextPolygons: number[][][][];
};

export type GridDetailTab = "forecast" | "models" | "spread" | "neighbors";

export type GridDetailModalProps = {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  cellId: string | null;
  periods: Period[];
  resolution: H3Resolution;
  modelId: string;
  selectedWeek: number;
  selectedWeekYear: number;
};

export type NeighborhoodSeedEntry = {
  cellId: string;
  label: string;
  isSelected: boolean;
  ringIndex: number;
  polygons: number[][][][];
};
