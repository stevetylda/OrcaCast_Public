import { getActualsPathForPeriod, getForecastPathForPeriod, type H3Resolution } from "../../config/dataPaths";

export type CompareSource = "forecast" | "actual";

export type CompareOption = {
  value: string;
  label: string;
  modelId: string;
  source: CompareSource;
};

export function buildCompareOptionValue(source: CompareSource, modelId: string): string {
  return `${source}:${modelId}`;
}

export function createCompareOption(source: CompareSource, modelId: string, label: string): CompareOption {
  return {
    value: buildCompareOptionValue(source, modelId),
    label: source === "actual" ? `${label} Actuals` : label,
    modelId,
    source,
  };
}

export function getComparePath(
  option: Pick<CompareOption, "source">,
  resolution: H3Resolution,
  periodFileId: string
): string {
  return option.source === "actual"
    ? getActualsPathForPeriod(resolution, periodFileId)
    : getForecastPathForPeriod(resolution, periodFileId);
}
