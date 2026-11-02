import { z } from "zod";
import { fetchJson } from "../../shared/data/fetchClient";
import { getDataVersionToken } from "../../shared/data/meta";
import { loadPeriodsForResolution } from "../../shared/data/periods";
import {
  DEFAULT_FORECAST_ECOTYPE_ID,
  DEFAULT_FORECAST_MODEL_ID,
  getForecastDirectory,
} from "../../shared/config/forecastModels";
import {
  summarizeFridayHarborWeather,
  type MetNoTimeseriesEntry,
} from "./weather";

const summarySchema = z.object({
  histogram: z.array(
    z.object({
      day_of_year: z.number().int().min(1).max(366),
      count: z.number().finite().nonnegative(),
    }),
  ),
  year_min: z.number().int(),
  year_max: z.number().int(),
  source: z.string().min(1),
});
export async function loadHomeSeasonality() {
  const { data } = await fetchJson<unknown>(
    "data/trip_planner/seasonal-summary.json",
    { cacheToken: getDataVersionToken() },
  );
  return summarySchema.parse(data);
}
export async function loadHomeForecastPeriods() {
  const directory = getForecastDirectory(
    DEFAULT_FORECAST_ECOTYPE_ID,
    DEFAULT_FORECAST_MODEL_ID,
  );
  return loadPeriodsForResolution("H6", directory, { requireManifest: true });
}
export async function loadHomeWeather() {
  const { data } = await fetchJson<{
    properties?: {
      timeseries?: MetNoTimeseriesEntry[];
      meta?: { updated_at?: string };
    };
  }>(
    "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=48.52&lon=-123.01",
    { cache: "default", retries: 1 },
  );
  if (!Array.isArray(data.properties?.timeseries))
    throw new Error("Weather unavailable");
  const days = summarizeFridayHarborWeather(
    data.properties.timeseries,
    new Date(),
  );
  if (
    days.every(
      (day) => day.temperatureF === null && day.summary === "Unavailable",
    )
  )
    throw new Error("Weather unavailable");
  return days;
}
