import { memo } from "react";
import { ProbabilityLegend } from "../ProbabilityLegend";
import type { HeatScale } from "../../map/colorScale";
import { trackRender } from "../../debug/perf";

type MapControlsProps = {
  hotspotsEnabled: boolean;
  hasForecastLegend: boolean;
  legendOpen: boolean;
  legendSpec: HeatScale | null;
  onHotspotsEnabledChange: (next: boolean) => void;
  onLegendToggle: () => void;
};

export const MapControls = memo(function MapControls({
  hotspotsEnabled,
  hasForecastLegend,
  legendOpen,
  legendSpec,
  onHotspotsEnabledChange,
  onLegendToggle,
}: MapControlsProps) {
  trackRender("MapControls");
  return (
    <>
      <div className="map__cornerRightBottom" data-tour="legend-controls">
        <div className="legendClusterItem">
          <button
            className={
              hotspotsEnabled
                ? `iconBtn legendClusterBtn legendHotspots legendHotspots--active${!hasForecastLegend ? " legendClusterBtn--disabled" : ""}`
                : `iconBtn legendClusterBtn legendHotspots${!hasForecastLegend ? " legendClusterBtn--disabled" : ""}`
            }
            onClick={() => onHotspotsEnabledChange(!hotspotsEnabled)}
            aria-label="Toggle hotspots"
            data-tour="hotspots"
            disabled={!hasForecastLegend}
          >
            <span className="material-symbols-rounded">local_fire_department</span>
          </button>
        </div>
        <button
          className={`iconBtn legendClusterBtn${!hasForecastLegend ? " legendClusterBtn--disabled" : ""}`}
          onClick={onLegendToggle}
          aria-label={legendOpen ? "Hide legend" : "Show legend"}
          data-tour="legend-toggle"
          disabled={!hasForecastLegend}
        >
          <span className="material-symbols-rounded">legend_toggle</span>
        </button>
      </div>
      {legendOpen && <ProbabilityLegend scale={legendSpec} />}
    </>
  );
});
