import { MapToolbar } from "./MapToolbar";
import type { PaletteId } from "../constants/palettes";
import type { ForecastDisplayMode } from "./ForecastMap/types";

type Props = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelectLastWeek: (mode: "previous" | "selected") => void;
  lastWeekMode: "none" | "previous" | "selected" | "both";
  showLastWeek: boolean;
  hotspotsEnabled: boolean;
  onHotspotsEnabledChange: (value: boolean) => void;
  hotspotMode: "modeled" | "custom";
  onHotspotModeChange: (value: "modeled" | "custom") => void;
  hotspotPercentile: number;
  onHotspotPercentileChange: (value: number) => void;
  hotspotTotalCells: number | null;
  hotspotModeledCount: number | null;
  onOpenTimeseries: () => void;
  poiFilters: { Park: boolean; Marina: boolean; Ferry: boolean };
  onTogglePoiAll: () => void;
  onTogglePoiType: (type: "Park" | "Marina" | "Ferry") => void;
  compareEnabled: boolean;
  compareDisabled: boolean;
  compareDisabledReason?: string;
  selectedPaletteId: PaletteId;
  onPaletteChange: (paletteId: PaletteId) => void;
  displayMode: ForecastDisplayMode;
  onDisplayModeChange: (mode: ForecastDisplayMode) => void;
  onToggleCompare: () => void;
};

export function ToolDrawer({
  open,
  onToggle,
  onClose,
  onSelectLastWeek,
  lastWeekMode,
  showLastWeek,
  hotspotsEnabled,
  onHotspotsEnabledChange,
  hotspotMode,
  onHotspotModeChange,
  hotspotPercentile,
  onHotspotPercentileChange,
  hotspotTotalCells,
  hotspotModeledCount,
  onOpenTimeseries,
  poiFilters,
  onTogglePoiAll,
  onTogglePoiType,
  compareEnabled,
  compareDisabled,
  compareDisabledReason,
  selectedPaletteId,
  onPaletteChange,
  displayMode,
  onDisplayModeChange,
  onToggleCompare,
}: Props) {
  return (
    <div className="toolDrawer">
      <button
        className="iconBtn toolDrawer__toggle"
        onClick={onToggle}
        aria-label="Tools"
        data-tour="tools"
      >
        <span className="material-symbols-rounded">settings</span>
      </button>

      {open && (
        <>
          <div className="toolDrawer__overlay" onClick={onClose} role="presentation" />
          <div className="toolDrawer__panel">
            <MapToolbar
              className="toolbar--drawer"
              onSelectLastWeek={onSelectLastWeek}
              lastWeekMode={lastWeekMode}
              showLastWeek={showLastWeek}
              hotspotsEnabled={hotspotsEnabled}
              onHotspotsEnabledChange={onHotspotsEnabledChange}
              hotspotMode={hotspotMode}
              onHotspotModeChange={onHotspotModeChange}
              hotspotPercentile={hotspotPercentile}
              onHotspotPercentileChange={onHotspotPercentileChange}
              hotspotTotalCells={hotspotTotalCells}
              hotspotModeledCount={hotspotModeledCount}
              onOpenTimeseries={onOpenTimeseries}
              poiFilters={poiFilters}
              onTogglePoiAll={onTogglePoiAll}
              onTogglePoiType={onTogglePoiType}
              compareEnabled={compareEnabled}
              compareDisabled={compareDisabled}
              compareDisabledReason={compareDisabledReason}
              selectedPaletteId={selectedPaletteId}
              onPaletteChange={onPaletteChange}
              displayMode={displayMode}
              onDisplayModeChange={onDisplayModeChange}
              onToggleCompare={onToggleCompare}
            />
          </div>
        </>
      )}
    </div>
  );
}
