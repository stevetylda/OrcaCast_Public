export function quantile(values: number[], q: number): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (q <= 0) return sorted[0];
  if (q >= 1) return sorted[sorted.length - 1];
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function computePercentile(value: number, rankedValues: number[]): number {
  if (rankedValues.length === 0) return 0;
  let count = 0;
  for (const ranked of rankedValues) {
    if (ranked <= value) count += 1;
  }
  return count / rankedValues.length;
}

export function minMaxScale(values: number[]): number[] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return values.map(() => 0);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;
  if (range <= Number.EPSILON) return values.map(() => 0.5);
  return values.map((value) => (Number.isFinite(value) ? (value - min) / range : 0));
}
