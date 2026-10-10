import forecastModelRegistry from "../../../config/forecast-models.json";

export type ForecastEcotypeId = "srkw" | "transient";

export type ForecastModelOption = {
  id: string;
  label: string;
};

export type ForecastEcotypeOption = {
  id: ForecastEcotypeId;
  label: string;
  models: ForecastModelOption[];
};

export const FORECAST_ECOTYPES =
  forecastModelRegistry as ForecastEcotypeOption[];

export const DEFAULT_FORECAST_ECOTYPE_ID: ForecastEcotypeId = "srkw";
export const DEFAULT_FORECAST_MODEL_ID = "kernel_decay_model";

export function getForecastModelsForEcotype(ecotypeId: ForecastEcotypeId) {
  return (
    FORECAST_ECOTYPES.find((ecotype) => ecotype.id === ecotypeId)?.models ?? []
  );
}

export function getForecastDirectory(
  ecotypeId: ForecastEcotypeId,
  modelId: string,
) {
  return `forecasts/latest/weekly/${ecotypeId}/${modelId}`;
}
