import { useRef, useState } from "react";
import { buildLinearTicks, buildTickIndexes, getChartTheme, getModelColor } from "./chartUtils";
import { useResizeObserver } from "./useResizeObserver";
import type { GridSeriesPoint, ModelSeries } from "../types";
import { formatForecastValue, formatObservedFlag, isObservedActual } from "../utils/formatGridDetail";

type Props = {
  points: GridSeriesPoint[];
  modelSeries: ModelSeries[];
  selectedIndex: number;
  activeModelId: string;
  darkMode: boolean;
};

export function ModelOverlapChart({ points, modelSeries, selectedIndex, activeModelId, darkMode }: Props) {
  const visibleSeries = modelSeries.filter((series) => series.values.some((value) => value > 0));
  const panelRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const size = useResizeObserver(wrapRef);
  const width = Math.max(760, Math.floor(size.width || 980));
  const height = 400;
  const margin = { top: 28, right: 70, bottom: 100, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xFor = (index: number) => margin.left + index * xStep;
  const maxY = Math.max(0.01, ...visibleSeries.flatMap((series) => series.values));
  const yFor = (value: number) => margin.top + plotHeight * (1 - value / maxY);
  const selectedX = selectedIndex >= 0 ? xFor(selectedIndex) : null;
  const yTicks = buildLinearTicks(maxY, 4);
  const xTicks = buildTickIndexes(points.length);
  const { axisText, gridStroke, actualDotColor } = getChartTheme(darkMode);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const activeIndex = hoverIndex ?? (selectedIndex >= 0 ? selectedIndex : null);
  const activePoint = activeIndex !== null ? points[activeIndex] ?? null : null;
  const tooltipRows =
    activeIndex === null
      ? []
      : visibleSeries.map((series, index) => ({
          label: series.label,
          color: getModelColor(index),
          value: series.values[activeIndex] ?? 0,
          active: series.modelId === activeModelId,
        }));

  const updateTooltipPosition = (clientX: number, clientY: number) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tooltipWidth = 440;
    setTooltipPos({
      x: Math.min(rect.width - tooltipWidth - 12, Math.max(18, clientX - rect.left + 12)),
      y: Math.min(rect.height - 18, Math.max(18, clientY - rect.top - 16)),
    });
  };

  return (
    <>
      <div ref={panelRef} className="gridDetail__chartPanel">
        {activePoint && tooltipPos && (
          <div className="gridDetail__tooltip gridDetail__tooltip--models" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
            <span>{activePoint.weekLabel}</span>
            <span>Actual observation: {formatObservedFlag(activePoint.actual)}</span>
            {tooltipRows.map((row) => (
              <span key={row.label} style={{ color: row.color, fontWeight: row.active ? 700 : 500 }}>
                {row.label}: {formatForecastValue(row.value)}
              </span>
            ))}
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
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Overlapped model probability chart">
            {yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line x1={margin.left} x2={width - margin.right} y1={yFor(tick)} y2={yFor(tick)} stroke={gridStroke} strokeWidth={1} />
                <text x={margin.left - 10} y={yFor(tick) + 4} textAnchor="end" fontSize="11" fill={axisText}>
                  {formatForecastValue(tick)}
                </text>
              </g>
            ))}
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
            {visibleSeries.map((series, index) => {
              const color = getModelColor(index);
              const isActive = series.modelId === activeModelId;
              const path = series.values
                .map((value, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${xFor(pointIndex).toFixed(1)} ${yFor(value).toFixed(1)}`)
                .join(" ");
              return (
                <path
                  key={series.modelId}
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? 3.2 : 1.9}
                  strokeOpacity={hoverIndex !== null ? (isActive ? 1 : 0.18) : isActive ? 1 : 0.72}
                />
              );
            })}
            {points.map((point, index) => {
              if (!isObservedActual(point.actual)) return null;
              const isActive = activeIndex === index;
              return (
                <circle
                  key={`${point.periodKey}-model-actual`}
                  cx={xFor(index)}
                  cy={margin.top}
                  r={isActive ? 5 : 4}
                  fill={actualDotColor}
                  stroke={darkMode ? "rgba(8,18,44,0.92)" : "rgba(255,255,255,0.98)"}
                  strokeWidth={isActive ? 2 : 1.5}
                />
              );
            })}
            {activeIndex !== null &&
              visibleSeries.map((series, index) => (
                <circle
                  key={`${series.modelId}-dot`}
                  cx={xFor(activeIndex)}
                  cy={yFor(series.values[activeIndex] ?? 0)}
                  r={series.modelId === activeModelId ? 4 : 3}
                  fill={getModelColor(index)}
                  opacity={0.95}
                />
              ))}
            {activeIndex !== null && isObservedActual(points[activeIndex].actual) && (
              <circle
                cx={xFor(activeIndex)}
                cy={margin.top}
                r={5}
                fill={actualDotColor}
                stroke={darkMode ? "rgba(8,18,44,0.92)" : "rgba(255,255,255,0.98)"}
                strokeWidth={2}
              />
            )}
            {xTicks.map((index) => (
              <g key={`mx-${index}`}>
                <line x1={xFor(index)} x2={xFor(index)} y1={height - margin.bottom} y2={height - margin.bottom + 6} stroke={gridStroke} strokeWidth={1} />
                <text x={xFor(index)} y={height - margin.bottom + 20} textAnchor="middle" fontSize="11" fill={axisText}>
                  {points[index].weekLabel}
                </text>
              </g>
            ))}
            <text x={margin.left + plotWidth / 2} y={height - 18} textAnchor="middle" fontSize="12" fill={axisText} fontWeight="600">
              Forecast period
            </text>
            <text
              x={18}
              y={margin.top + plotHeight / 2}
              transform={`rotate(-90 18 ${margin.top + plotHeight / 2})`}
              textAnchor="middle"
              fontSize="12"
              fill={axisText}
              fontWeight="700"
            >
              Forecast probability
            </text>
            <text x={width - margin.right} y={height - 40} textAnchor="end" fontSize="11" fill={axisText}>
              Observed weeks shown as top dots
            </text>
            {points.map((point, index) => {
              const hitWidth = Math.max(12, plotWidth / Math.max(points.length, 24));
              const x = xFor(index) - hitWidth / 2;
              return (
                <rect
                  key={`hover-${point.periodKey}`}
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
      <div className="gridDetail__legend">
        {visibleSeries.map((series, index) => {
          const isActive = series.modelId === activeModelId;
          return (
            <div className={`gridDetail__legendItem${isActive ? " gridDetail__legendItem--active" : ""}`} key={series.modelId}>
              <span className="gridDetail__legendSwatch" style={{ background: getModelColor(index) }} />
              <span>{series.label}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
