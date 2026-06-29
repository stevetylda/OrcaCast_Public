export type LastWeekMode = "none" | "previous" | "selected" | "both";
export type NonNoneLastWeekMode = Exclude<LastWeekMode, "none">;

export type DeltaMapData = {
  deltaByCell: Record<string, number>;
  valueAByCell: Record<string, number>;
  valueBByCell: Record<string, number>;
  percentileAByCell: Record<string, number>;
  percentileBByCell: Record<string, number>;
  domainSize: number;
  deltaMin: number;
  deltaMax: number;
};
