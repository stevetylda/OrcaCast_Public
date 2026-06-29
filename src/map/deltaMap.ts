const DELTA_MIN = -1;
const DELTA_MAX = 1;

// Low -> high diverging palette from the provided Coolors set.
export const DELTA_DIVERGING_COLORS = [
  "#003d44",
  "#006D77",
  "#83C5BE",
  "#EDF6F9",
  "#FFDDD2",
  "#E29578",
  "#7f4634",
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateHex(startHex: string, endHex: string, t: number): string {
  const [sr, sg, sb] = hexToRgb(startHex);
  const [er, eg, eb] = hexToRgb(endHex);
  return rgbToHex(lerp(sr, er, t), lerp(sg, eg, t), lerp(sb, eb, t));
}

function buildExpandedDivergingColors(anchorColors: readonly string[], stepsPerSegment: number): string[] {
  if (anchorColors.length <= 1) return [...anchorColors];
  const steps = Math.max(2, Math.floor(stepsPerSegment));
  const out: string[] = [];
  for (let i = 0; i < anchorColors.length - 1; i += 1) {
    const start = anchorColors[i];
    const end = anchorColors[i + 1];
    for (let s = 0; s < steps; s += 1) {
      if (i > 0 && s === 0) continue;
      const t = s / (steps - 1);
      out.push(interpolateHex(start, end, t));
    }
  }
  return out;
}

const DELTA_DIVERGING_COLORS_EXPANDED = buildExpandedDivergingColors(DELTA_DIVERGING_COLORS, 17);

export type DeltaLegendSpec = {
  title: string;
  minLabel: string;
  midLabel: string;
  maxLabel: string;
  minHint: string;
  maxHint: string;
  note: string;
  colors: readonly string[];
};

export type DeltaComputationResult = {
  deltaByCell: Record<string, number>;
  percentileA: Record<string, number>;
  percentileB: Record<string, number>;
  domainSize: number;
  deltaMin: number;
  deltaMax: number;
};

export type DeltaCacheKeyParts = {
  weekA: string;
  weekB: string;
  resolutionA: string;
  resolutionB: string;
  modelA: string;
  modelB: string;
};

export const DEFAULT_DELTA_LEGEND: DeltaLegendSpec = {
  title: "Δ Percentile (A − B)",
  minLabel: "-1",
  midLabel: "0",
  maxLabel: "+1",
  // Scale direction: -1 (B higher) is warm/red, +1 (A higher) is cool/blue.
  minHint: "B higher",
  maxHint: "A higher",
  note: "Shows change in percentile rank: A − B (shared-scale setting is ignored).",
  colors: DELTA_DIVERGING_COLORS_EXPANDED,
};

type RankCell = {
  id: string;
  value: number;
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeValue(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function buildDeltaCacheKey(parts: DeltaCacheKeyParts): string {
  return [
    parts.weekA,
    parts.weekB,
    parts.resolutionA,
    parts.resolutionB,
    parts.modelA,
    parts.modelB,
  ].join("|");
}

export function buildDeltaFillExpr(valueProperty = "delta_pctl"): unknown[] {
  const expr: unknown[] = [
    "interpolate",
    ["linear"],
    [
      "max",
      DELTA_MIN,
      ["min", DELTA_MAX, ["coalesce", ["to-number", ["get", valueProperty]], 0]],
    ],
  ];

  DELTA_DIVERGING_COLORS_EXPANDED.forEach((color, index) => {
    const t = index / (DELTA_DIVERGING_COLORS_EXPANDED.length - 1);
    const delta = DELTA_MIN + t * (DELTA_MAX - DELTA_MIN);
    expr.push(delta, color);
  });
  return expr;
}

export function computePercentileRanks(
  valuesByCell: Record<string, number>,
  domainCellIds: readonly string[]
): Record<string, number> {
  if (domainCellIds.length === 0) return {};

  const rankedCells: RankCell[] = domainCellIds.map((id) => ({
    id,
    value: normalizeValue(valuesByCell[id]),
  }));

  rankedCells.sort((a, b) => (a.value - b.value) || a.id.localeCompare(b.id));

  const percentiles: Record<string, number> = {};
  const n = rankedCells.length;
  if (n <= 1) {
    const only = rankedCells[0];
    if (only) percentiles[only.id] = 0.5;
    return percentiles;
  }

  let idx = 0;
  while (idx < rankedCells.length) {
    const start = idx;
    const tieValue = rankedCells[idx].value;
    while (idx + 1 < rankedCells.length && rankedCells[idx + 1].value === tieValue) {
      idx += 1;
    }
    const end = idx;
    // Average-rank tie handling: all tied values receive the midpoint rank.
    const avgRank = (start + end) / 2;
    const p = avgRank / (n - 1);
    for (let j = start; j <= end; j += 1) {
      percentiles[rankedCells[j].id] = p;
    }
    idx += 1;
  }

  return percentiles;
}

export function computeDeltaPercentilesByCell(
  valuesA: Record<string, number>,
  valuesB: Record<string, number>,
  domainCellIds: readonly string[]
): DeltaComputationResult {
  // Domain choice: union of visible grid cells and all A/B keys from the selected period(s).
  // Missing cells are treated as value=0 before ranking so both layers are ranked over a shared domain.
  const domain = Array.from(new Set(domainCellIds));
  const percentileA = computePercentileRanks(valuesA, domain);
  const percentileB = computePercentileRanks(valuesB, domain);

  const deltaByCell: Record<string, number> = {};
  let deltaMin = Number.POSITIVE_INFINITY;
  let deltaMax = Number.NEGATIVE_INFINITY;

  domain.forEach((id) => {
    const pA = percentileA[id] ?? 0.5;
    const pB = percentileB[id] ?? 0.5;
    const delta = clamp(pA - pB, DELTA_MIN, DELTA_MAX);
    deltaByCell[id] = delta;
    if (delta < deltaMin) deltaMin = delta;
    if (delta > deltaMax) deltaMax = delta;
  });

  if (!Number.isFinite(deltaMin)) deltaMin = 0;
  if (!Number.isFinite(deltaMax)) deltaMax = 0;

  return {
    deltaByCell,
    percentileA,
    percentileB,
    domainSize: domain.length,
    deltaMin,
    deltaMax,
  };
}

export class LruCache<K, V> {
  private readonly maxEntries: number;
  private readonly map = new Map<K, V>();

  constructor(maxEntries: number) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size <= this.maxEntries) return;
    const oldestKey = this.map.keys().next().value as K | undefined;
    if (oldestKey !== undefined) this.map.delete(oldestKey);
  }

  clear() {
    this.map.clear();
  }
}
