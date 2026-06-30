import type { SpreadSeriesPoint } from "../types";

export function buildTickIndexes(length: number): number[] {
  if (length <= 1) return [0];
  const step = Math.max(1, Math.ceil(length / 8));
  const ticks: number[] = [];
  for (let index = 0; index < length; index += step) ticks.push(index);
  if (ticks[ticks.length - 1] !== length - 1) ticks.push(length - 1);
  return ticks;
}

export function buildLinearTicks(maxValue: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, index) => (maxValue * index) / count);
}

export function buildBandPath(
  points: SpreadSeriesPoint[],
  xFor: (index: number) => number,
  yFor: (value: number) => number
): string {
  if (points.length === 0) return "";
  const upper = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yFor(point.max).toFixed(1)}`)
    .join(" ");
  const lower = [...points]
    .reverse()
    .map((point, reverseIndex) => {
      const index = points.length - 1 - reverseIndex;
      return `L${xFor(index).toFixed(1)} ${yFor(point.min).toFixed(1)}`;
    })
    .join(" ");
  return `${upper} ${lower} Z`;
}

export function getModelColor(index: number): string {
  const palette = ["#19f0d7", "#f59e0b", "#60a5fa", "#f472b6", "#34d399", "#a78bfa", "#fb7185", "#facc15"];
  return palette[index % palette.length];
}

export function getNeighborColor(ringIndex: number): string {
  const palette = ["#f97316", "#22d3ee", "#facc15", "#a78bfa", "#34d399", "#fb7185", "#60a5fa"];
  return palette[Math.max(0, Math.min(palette.length - 1, ringIndex))];
}

export function getChartTheme(darkMode: boolean) {
  return {
    axisText: darkMode ? "rgba(255,255,255,0.82)" : "rgba(18,44,78,0.84)",
    gridStroke: darkMode ? "rgba(255,255,255,0.08)" : "rgba(26,58,96,0.14)",
    actualDotColor: darkMode ? "#cbd5e1" : "#334155",
  };
}
