export type SourceKind = "geojson" | "vector_tiles";

export type LayerConfig = {
  id: string;
  type: "fill" | "line" | "circle";
  source_kind: SourceKind;
  source_url: string;
  source_layer?: string;
  fallback_source_kind?: SourceKind;
  fallback_source_url?: string;
  fallback_source_layer?: string;
  minzoom?: number;
  maxzoom?: number;
  metadata?: Record<string, unknown>;
};

function withBase(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${trimmed}`;
}

export const LAST_WEEK_LAYER_CONFIG: LayerConfig = {
  id: "last-week-sightings",
  type: "circle",
  source_kind: "geojson",
  source_url: withBase("data/last_week_sightings"),
  minzoom: 0,
  maxzoom: 14,
  metadata: {
    properties: ["YEAR", "WEEK", "datetime"],
    dynamic_filtering: true,
  },
};

export type LayerSourceConfig = LayerConfig;
