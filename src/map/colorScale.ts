export type HeatScale = {
  thresholds: number[];
  binColorsRgba: string[];
  labels: string[];
  binRanges: Array<{
    percentileMin: number;
    percentileMax: number;
    probMin: number;
    probMax: number;
  }>;
  hotspotThreshold?: number;
};

type ColorScaleResult = {
  fillColorExpr: unknown[];
  scale: HeatScale | null;
};

export const ZERO_COLOR = "rgba(25,240,215,0.12)";
export const OUTLOOK_BIN_LABELS = [
  "Very Low",
  "Low",
  "Moderate",
  "Elevated",
  "High",
  "Very High",
  "Extreme",
  "Peak",
] as const;

const LABELS: string[] = [
  "Not Scored",
  ...OUTLOOK_BIN_LABELS,
];

const Q_LEVELS = [0.6, 0.9, 0.94, 0.96, 0.975, 0.9875, 0.995];

function quantileThresholds(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const rawThresholds = Q_LEVELS.map((q) => {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))));
    return sorted[idx];
  });
  const span = Math.max(1, sorted[sorted.length - 1] - sorted[0]);
  const epsilon = span * 1e-9;
  const adjusted: number[] = [];
  rawThresholds.forEach((value, idx) => {
    if (idx === 0) {
      adjusted.push(value);
      return;
    }
    const prev = adjusted[idx - 1];
    adjusted.push(value <= prev ? prev + epsilon : value);
  });
  return adjusted;
}

function normalizePaletteColors(palette: string[], bins: number): string[] {
  if (palette.length >= bins) return palette.slice(0, bins);
  if (palette.length === 0) return Array.from({ length: bins }, () => "#ffffff");
  const last = palette[palette.length - 1];
  return [...palette, ...Array.from({ length: bins - palette.length }, () => last)];
}

export function buildAutoColorExprFromValues(
  probsByH3: Record<string, number>,
  palette: string[],
  valueExpr: unknown[] = ["get", "prob"]
): ColorScaleResult {
  const values = Object.values(probsByH3)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (values.length === 0) {
    return {
      fillColorExpr: ["case", ["<=", ["coalesce", valueExpr, 0], 0], ZERO_COLOR, ZERO_COLOR],
      scale: null,
    };
  }

  const thresholds = quantileThresholds(values);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const bins = Math.max(1, thresholds.length + 1);
  const colors = normalizePaletteColors(palette, bins);
  const quantileBounds = [0, ...Q_LEVELS, 1];
  const binRanges = Array.from({ length: bins }, (_, idx) => ({
    percentileMin: quantileBounds[idx] * 100,
    percentileMax: quantileBounds[idx + 1] * 100,
    probMin: idx === 0 ? minValue : thresholds[idx - 1],
    probMax: idx < thresholds.length ? thresholds[idx] : maxValue,
  }));

  if (thresholds.length === 0) {
    return {
      fillColorExpr: ["case", ["<=", ["coalesce", valueExpr, 0], 0], ZERO_COLOR, colors[0] ?? ZERO_COLOR],
      scale: {
        thresholds: [],
        binColorsRgba: colors.length ? colors : [ZERO_COLOR],
        labels: LABELS,
        binRanges,
        hotspotThreshold: maxValue,
      },
    };
  }

  const stepExpr: unknown[] = ["step", valueExpr, colors[0]];
  thresholds.forEach((t, i) => {
    stepExpr.push(t, colors[Math.min(i + 1, colors.length - 1)]);
  });

  const expr: unknown[] = ["case", ["<=", ["coalesce", valueExpr, 0], 0], ZERO_COLOR, stepExpr];

  return {
    fillColorExpr: expr,
    scale: {
      thresholds,
      binColorsRgba: colors,
      labels: LABELS,
      binRanges,
      hotspotThreshold: thresholds[thresholds.length - 1],
    },
  };
}

export function buildFillExprFromScale(
  scale: HeatScale,
  zeroColor = ZERO_COLOR,
  valueExpr: unknown[] = ["get", "prob"]
): unknown[] {
  if (scale.thresholds.length === 0) {
    return [
      "case",
      ["<=", ["coalesce", valueExpr, 0], 0],
      zeroColor,
      scale.binColorsRgba[0] ?? zeroColor,
    ];
  }
  const stepExpr: unknown[] = ["step", valueExpr, scale.binColorsRgba[0]];
  scale.thresholds.forEach((t, i) => {
    stepExpr.push(t, scale.binColorsRgba[Math.min(i + 1, scale.binColorsRgba.length - 1)]);
  });
  return ["case", ["<=", ["coalesce", valueExpr, 0], 0], zeroColor, stepExpr];
}

export function buildHotspotOnlyExpr(
  threshold: number,
  hotspotFill = "rgba(255,45,170,0.78)",
  zeroColor = "rgba(0,0,0,0)",
  valueExpr: unknown[] = ["get", "prob"]
): unknown[] {
  return [
    "case",
    [">=", ["coalesce", valueExpr, 0], threshold],
    hotspotFill,
    zeroColor,
  ];
}
