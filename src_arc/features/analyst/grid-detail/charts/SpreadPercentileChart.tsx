import { useRef } from "react";
import { buildBandPath, buildLinearTicks, buildTickIndexes, getChartTheme } from "./chartUtils";
import { useResizeObserver } from "./useResizeObserver";
import type { SpreadSeriesPoint } from "../types";
import { formatForecastValue } from "../utils/formatGridDetail";

type Props = {
  points: SpreadSeriesPoint[];
  selectedIndex: number;
  darkMode: boolean;
};

export function SpreadPercentileChart({ points, selectedIndex, darkMode }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useResizeObserver(wrapRef);
  const width = Math.max(760, Math.floor(size.width || 980));
  const height = 380;
  const margin = { top: 28, right: 70, bottom: 72, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xFor = (index: number) => margin.left + index * xStep;
  const maxSpread = Math.max(0.01, ...points.map((point) => point.max));
  const ySpread = (value: number) => margin.top + plotHeight * (1 - value / maxSpread);
  const yPct = (value: number) => margin.top + plotHeight * (1 - value);
  const xTicks = buildTickIndexes(points.length);
  const leftTicks = buildLinearTicks(maxSpread, 4);
  const selectedX = selectedIndex >= 0 ? xFor(selectedIndex) : null;
  const { axisText, gridStroke } = getChartTheme(darkMode);
  const bandPath = buildBandPath(points, xFor, ySpread);
  const selectedPath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${ySpread(point.selected).toFixed(1)}`)
    .join(" ");
  const pctPath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yPct(point.percentile).toFixed(1)}`)
    .join(" ");

  return (
    <div ref={wrapRef} className="gridDetail__chartScroller">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Model spread and percentile chart">
        {leftTicks.map((tick) => (
          <g key={`spread-${tick}`}>
            <line x1={margin.left} x2={width - margin.right} y1={ySpread(tick)} y2={ySpread(tick)} stroke={gridStroke} strokeWidth={1} />
            <text x={margin.left - 10} y={ySpread(tick) + 4} textAnchor="end" fontSize="11" fill={axisText}>
              {formatForecastValue(tick)}
            </text>
          </g>
        ))}
        {selectedX !== null && (
          <line x1={selectedX} x2={selectedX} y1={margin.top} y2={height - margin.bottom} stroke="rgba(255,166,43,0.9)" strokeWidth={2} strokeDasharray="5 4" />
        )}
        <path d={bandPath} fill="rgba(96,165,250,0.16)" stroke="none" />
        <path d={selectedPath} fill="none" stroke="#19f0d7" strokeWidth={2.8} />
        <path d={pctPath} fill="none" stroke="#a78bfa" strokeWidth={2.4} strokeDasharray="6 5" />
        {xTicks.map((index) => (
          <g key={`spread-x-${index}`}>
            <line x1={xFor(index)} x2={xFor(index)} y1={height - margin.bottom} y2={height - margin.bottom + 6} stroke={gridStroke} strokeWidth={1} />
            <text x={xFor(index)} y={height - margin.bottom + 20} textAnchor="middle" fontSize="11" fill={axisText}>
              {points[index].weekLabel}
            </text>
          </g>
        ))}
        <text x={margin.left} y={14} fontSize="12" fill="#60a5fa" fontWeight="700">Model spread</text>
        <text x={width - margin.right} y={14} textAnchor="end" fontSize="12" fill="#a78bfa" fontWeight="700">Grid percentile</text>
        <text x={margin.left + plotWidth / 2} y={height - 18} textAnchor="middle" fontSize="12" fill={axisText} fontWeight="600">
          Forecast period
        </text>
        <text x={18} y={margin.top + plotHeight / 2} transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`} textAnchor="middle" fontSize="12" fill="#60a5fa" fontWeight="700">
          Forecast probability
        </text>
        <text x={width - 14} y={margin.top + plotHeight / 2} transform={`rotate(90 ${width - 14} ${margin.top + plotHeight / 2})`} textAnchor="middle" fontSize="12" fill="#a78bfa" fontWeight="700">
          Percentile
        </text>
      </svg>
      <div className="gridDetail__legend">
        <div className="gridDetail__legendItem"><span className="gridDetail__legendSwatch" style={{ background: "#60a5fa" }} />IQR and min-max spread</div>
        <div className="gridDetail__legendItem"><span className="gridDetail__legendSwatch" style={{ background: "#19f0d7" }} />Selected model value</div>
        <div className="gridDetail__legendItem"><span className="gridDetail__legendSwatch" style={{ background: "#a78bfa" }} />Selected-model percentile</div>
      </div>
    </div>
  );
}
