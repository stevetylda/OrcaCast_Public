import { useRef, useState } from "react";
import { buildLinearTicks, buildTickIndexes, getChartTheme } from "./chartUtils";
import { useResizeObserver } from "./useResizeObserver";
import type { GridSeriesPoint } from "../types";
import { formatForecastValue, formatObservedFlag, isObservedActual } from "../utils/formatGridDetail";

type Props = {
  points: GridSeriesPoint[];
  selectedIndex: number;
  darkMode: boolean;
};

export function ForecastVsActualChart({ points, selectedIndex, darkMode }: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useResizeObserver(wrapRef);
  const width = Math.max(760, Math.floor(size.width || 980));
  const height = 390;
  const margin = { top: 28, right: 70, bottom: 100, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const forecastMax = Math.max(0.01, ...points.map((point) => point.forecast));
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xFor = (index: number) => margin.left + index * xStep;
  const yForecast = (value: number) => margin.top + plotHeight * (1 - value / forecastMax);
  const yActual = margin.top;
  const forecastPath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yForecast(point.forecast).toFixed(1)}`)
    .join(" ");
  const xTicks = buildTickIndexes(points.length);
  const leftTicks = buildLinearTicks(forecastMax, 4);
  const selectedX = selectedIndex >= 0 ? xFor(selectedIndex) : null;
  const { axisText, gridStroke, actualDotColor } = getChartTheme(darkMode);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const activeIndex = hoverIndex ?? (selectedIndex >= 0 ? selectedIndex : null);
  const activePoint = activeIndex !== null ? points[activeIndex] ?? null : null;

  const updateTooltipPosition = (clientX: number, clientY: number) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooltipWidth = 360;
    setTooltipPos({
      x: Math.min(rect.width - tooltipWidth - 12, Math.max(18, clientX - rect.left + 12)),
      y: Math.min(rect.height - 18, Math.max(18, clientY - rect.top - 16)),
    });
  };

  return (
    <div ref={panelRef} className="gridDetail__chartPanel">
      {activePoint && tooltipPos && (
        <div className="gridDetail__tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
          <span>{activePoint.weekLabel}</span>
          <span>Forecast: {formatForecastValue(activePoint.forecast)}</span>
          <span>Actual observation: {formatObservedFlag(activePoint.actual)}</span>
        </div>
      )}
      <div
        ref={wrapRef}
        className="gridDetail__chartScroller"
        onMouseLeave={() => {
          setHoverIndex(null);
          setTooltipPos(null);
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Grid detail chart">
          {leftTicks.map((tick) => {
            const y = yForecast(tick);
            return (
              <g key={`left-${tick}`}>
                <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} stroke={gridStroke} strokeWidth={1} />
                <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill={axisText}>
                  {formatForecastValue(tick)}
                </text>
              </g>
            );
          })}
          <text x={width - margin.right + 10} y={yActual + 4} textAnchor="start" fontSize="11" fill={axisText}>
            1
          </text>
          {selectedX !== null && (
            <line
              x1={selectedX}
              x2={selectedX}
              y1={margin.top}
              y2={height - margin.bottom}
              stroke="rgba(255, 166, 43, 0.9)"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
          )}
          <path d={forecastPath} fill="none" stroke="#19f0d7" strokeWidth={2.5} />
          {points.map((point, index) => {
            if (!isObservedActual(point.actual)) return null;
            const isActive = activeIndex === index;
            return (
              <circle
                key={`${point.periodKey}-actual`}
                cx={xFor(index)}
                cy={yActual}
                r={isActive ? 5 : 4}
                fill={actualDotColor}
                stroke={darkMode ? "rgba(8,18,44,0.92)" : "rgba(255,255,255,0.98)"}
                strokeWidth={isActive ? 2 : 1.5}
              />
            );
          })}
          {activeIndex !== null && (
            <>
              <circle cx={xFor(activeIndex)} cy={yForecast(points[activeIndex].forecast)} r={4} fill="#19f0d7" />
              {isObservedActual(points[activeIndex].actual) && (
                <circle
                  cx={xFor(activeIndex)}
                  cy={yActual}
                  r={5}
                  fill={actualDotColor}
                  stroke={darkMode ? "rgba(8,18,44,0.92)" : "rgba(255,255,255,0.98)"}
                  strokeWidth={2}
                />
              )}
            </>
          )}
          {xTicks.map((index) => (
            <g key={`x-${index}`}>
              <line
                x1={xFor(index)}
                x2={xFor(index)}
                y1={height - margin.bottom}
                y2={height - margin.bottom + 6}
                stroke={gridStroke}
                strokeWidth={1}
              />
              <text x={xFor(index)} y={height - margin.bottom + 20} textAnchor="middle" fontSize="11" fill={axisText}>
                {points[index].weekLabel}
              </text>
            </g>
          ))}
          <text x={margin.left} y={14} fontSize="12" fill="#19f0d7" fontWeight="700">Forecast value</text>
          <text x={width - margin.right} y={height - 53} textAnchor="end" fontSize="12" fill="#f59e0b" fontWeight="700">
            Observed sighting week
          </text>
          <text x={width - margin.right} y={height - 37} textAnchor="end" fontSize="11" fill={axisText}>
            Observed weeks shown as top dots
          </text>
          <text x={margin.left + plotWidth / 2} y={height - 18} textAnchor="middle" fontSize="12" fill={axisText} fontWeight="600">
            Forecast period
          </text>
          <text
            x={18}
            y={margin.top + plotHeight / 2}
            transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`}
            textAnchor="middle"
            fontSize="12"
            fill="#19f0d7"
            fontWeight="700"
          >
            Forecast probability
          </text>
          {points.map((point, index) => {
            const hitWidth = Math.max(12, plotWidth / Math.max(points.length, 24));
            const x = xFor(index) - hitWidth / 2;
            return (
              <rect
                key={point.periodKey}
                x={x}
                y={margin.top}
                width={hitWidth}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={(event) => {
                  setHoverIndex(index);
                  updateTooltipPosition(event.clientX, event.clientY);
                }}
                onMouseMove={(event) => {
                  setHoverIndex(index);
                  updateTooltipPosition(event.clientX, event.clientY);
                }}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
