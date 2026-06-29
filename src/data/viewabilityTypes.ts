import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import type { ViewabilityPaletteId } from "../constants/palettes";

export type ViewabilityScoreType = "base" | "dynamic";
export type ViewabilityDisplayMode = "hex" | "smooth";

export type ViewabilityMapMode = "overview" | "source-inspector" | "target-inspector";

export type SourceCellType = "land" | "water" | "mixed" | "unknown";

export type ViewabilityTargetProperties = {
  h3: string;
  base_viewability_score?: number;
  dynamic_viewability_score?: number;
  weather_viewability_score?: number;
  daylight_viewability_score?: number;
  lunar_viewability_score?: number;
  weather_modifier?: number;
  daylight_modifier?: number;
  lunar_modifier?: number;
};

export type ViewabilitySourceProperties = {
  h3: string;
  source_type?: SourceCellType;
  source_viewyness_score?: number;
  base_viewyness_score?: number;
  dynamic_viewyness_score?: number;
  weather_viewyness_score?: number;
  daylight_viewyness_score?: number;
  lunar_viewyness_score?: number;
  weather_modifier_mean?: number;
  daylight_modifier_mean?: number;
  lunar_modifier_mean?: number;
  reachable_target_count?: number;
  visible_target_count?: number;
  weight_sum?: number;
  dynamic_weight_sum?: number;
  mean_target_weight?: number;
  max_target_weight?: number;
  effective_view_radius_km?: number;
};

export type SourceTargetVisibilityProperties = {
  source_h3: string;
  target_h3: string;
  source_h3s?: string[];
  target_h3s?: string[];
  selected_source_count?: number;
  selected_target_count?: number;
  source_target_weight?: number;
  base_source_target_weight?: number;
  dynamic_source_target_weight?: number;
  source_target_modifier?: number;
  distance_km?: number;
  weight_distance?: number;
  weight_terrain?: number;
  weight_vegetation?: number;
};

export type ViewabilityTargetFeature = Feature<Polygon | MultiPolygon, ViewabilityTargetProperties>;
export type ViewabilitySourceFeature = Feature<Polygon | MultiPolygon | Point, ViewabilitySourceProperties>;

export type ViewabilityTargetFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  ViewabilityTargetProperties
>;

export type ViewabilitySourceFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon | Point,
  ViewabilitySourceProperties
>;

export type SourceTargetVisibilityRecord = SourceTargetVisibilityProperties;

export type SourceCellTimeSeriesPoint = {
  period: string;
  dynamic_viewability?: number;
  sighting_count?: number;
};

export type ViewabilityAreaConditionPoint = {
  date: string;
  weather?: number;
  weatherLow?: number;
  weatherHigh?: number;
  daylight?: number;
  daylightLow?: number;
  daylightHigh?: number;
  lunar?: number;
  lunarLow?: number;
  lunarHigh?: number;
};

export type ViewabilityColorScaleSettings = {
  paletteId: ViewabilityPaletteId;
  normalizeValues: boolean;
  reversePalette: boolean;
};
