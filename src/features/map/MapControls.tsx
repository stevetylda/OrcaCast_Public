import { memo } from "react";
import { ProbabilityLegend } from "./components/ProbabilityLegend";
import type { HeatScale } from "../../shared/geo/colorScale";
import { trackRender } from "../../shared/debug/perf";

type MapControlsProps = {
  hasForecastLegend: boolean;
  legendOpen: boolean;
  legendSpec: HeatScale | null;
  onLegendToggle: () => void;
};

export const MapControls = memo(function MapControls({
  hasForecastLegend,
  legendOpen,
  legendSpec,
  onLegendToggle,
}: MapControlsProps) {
  trackRender("MapControls");
  return (
    <>
      <div className="map__cornerLeftBottom">
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
      </div>
      {hasForecastLegend && legendOpen && <ProbabilityLegend scale={legendSpec} />}
    </>
  );
});
