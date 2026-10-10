import { getDataVersionToken } from "../data/meta";
import { resolveAppAssetPath } from "./basePath";

export type H3Resolution = "H4" | "H5" | "H6";

function withForecastCacheBust(url: string): string {
  const token = getDataVersionToken();
  if (!token) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}v=${encodeURIComponent(token)}`;
}

export const GRID_PATH: Record<H3Resolution, string> = {
  H4: resolveAppAssetPath("data/grids/H4.geojson"),
  H5: resolveAppAssetPath("data/grids/H5.geojson"),
  H6: resolveAppAssetPath("data/grids/H6.geojson"),
};

export const FORECAST_PATH_LATEST_WEEKLY: Record<H3Resolution, string> = {
  H4: withForecastCacheBust(
    resolveAppAssetPath("data/forecasts/latest/weekly/H4.json"),
  ),
  H5: withForecastCacheBust(
    resolveAppAssetPath("data/forecasts/latest/weekly/H5.json"),
  ),
  H6: withForecastCacheBust(
    resolveAppAssetPath("data/forecasts/latest/weekly/H6.json"),
  ),
};

export function getForecastPathForPeriod(
  resolution: H3Resolution,
  periodFileId: string,
  forecastDirectory = "forecasts/latest/weekly",
): string {
  return withForecastCacheBust(
    resolveAppAssetPath(
      `data/${forecastDirectory}/${periodFileId}_${resolution}.json`,
    ),
  );
}

export function getLatestForecastPath(
  resolution: H3Resolution,
  forecastDirectory: string,
): string {
  return withForecastCacheBust(
    resolveAppAssetPath(`data/${forecastDirectory}/${resolution}.json`),
  );
}

export function getSmoothedForecastPath(
  forecastDirectory: string,
  periodStart = "latest",
): string {
  return withForecastCacheBust(
    resolveAppAssetPath(
      `data/${forecastDirectory}/smoothed/${periodStart}.tif`,
    ),
  );
}

export function getSmoothedForecastTilePath(
  forecastDirectory: string,
  periodStart = "latest",
): string {
  return withForecastCacheBust(
    resolveAppAssetPath(
      `data/${forecastDirectory}/smoothed/tiles/${periodStart}/tilejson.json`,
    ),
  );
}

export function getActualsPathForPeriod(
  resolution: H3Resolution,
  periodFileId: string,
): string {
  return withForecastCacheBust(
    resolveAppAssetPath(
      `data/forecasts/latest/actuals/${periodFileId}_${resolution}.json`,
    ),
  );
}

export function getShapPathForPeriod(
  resolution: H3Resolution,
  periodFileId: string,
  modelId = "composite_linear_logit",
  kind: "local" | "global" = "local",
): string {
  const suffix = kind === "global" ? "_shap_global" : "_shap";
  return withForecastCacheBust(
    resolveAppAssetPath(
      `data/forecasts/latest/shap/${periodFileId}_${resolution}_${modelId}${suffix}.json`,
    ),
  );
}

export function getForecastPath(
  resolution: H3Resolution,
  opts: { kind?: "latest" | "explicit"; explicitPath?: string } = {},
): string {
  if (opts.kind === "explicit" && opts.explicitPath) return opts.explicitPath;
  return FORECAST_PATH_LATEST_WEEKLY[resolution];
}
