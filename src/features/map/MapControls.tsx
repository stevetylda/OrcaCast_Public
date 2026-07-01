import { memo } from "react";
import { ProbabilityLegend } from "./components/ProbabilityLegend";
import type { HeatScale } from "../../shared/geo/colorScale";
import { trackRender } from "../../shared/debug/perf";

type MapControlsProps = {
  hasForecastLegend: boolean;
  legendOpen: boolean;
  legendSpec: HeatScale | null;
  onLegendToggle: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export const MapControls = memo(function MapControls({
  hasForecastLegend,
  legendOpen,
  legendSpec,
  onLegendToggle,
  onZoomIn,
  onZoomOut,
}: MapControlsProps) {
  trackRender("MapControls");
  return (
    <>
      <div className="map__controlRail">
        <button
          className={`iconBtn legendToggleBtn${!hasForecastLegend ? " legendToggleBtn--disabled" : ""}${
            legendOpen ? " legendToggleBtn--active" : ""
          }`}
          onClick={onLegendToggle}
          aria-label={legendOpen ? "Hide legend" : "Show legend"}
          data-tour="legend-toggle"
          disabled={!hasForecastLegend}
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            legend_toggle
          </span>
        </button>
        <div className="map__zoomStack" aria-label="Map zoom controls">
          <button type="button" className="map__zoomBtn" onClick={onZoomIn} aria-label="Zoom in">
            <span className="material-symbols-rounded" aria-hidden="true">
              add
            </span>
          </button>
          <button type="button" className="map__zoomBtn" onClick={onZoomOut} aria-label="Zoom out">
            <span className="material-symbols-rounded" aria-hidden="true">
              remove
            </span>
          </button>
        </div>
      </div>
      {hasForecastLegend && legendOpen && <ProbabilityLegend scale={legendSpec} />}
    </>
  );
});
