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

export const FORECAST_ECOTYPES: ForecastEcotypeOption[] = [
  {
    id: "srkw",
    label: "Southern Resident (SRKW)",
    models: [
      { id: "kernel_decay_model", label: "Kernel decay model" },
      {
        id: "log_gaussian_cox_process",
        label: "Log-Gaussian Cox process",
      },
    ],
  },
  {
    id: "transient",
    label: "Transient (Bigg's)",
    models: [
      { id: "sightings_ensemble", label: "Sightings ensemble" },
      { id: "transport_graph_model", label: "Transport graph model" },
    ],
  },
];

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
