import { MapToolbar } from "./MapToolbar";
import type { PaletteId } from "../../../shared/geo/palettes";

type Props = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  surfaceMode: "grid" | "surface";
  onSurfaceModeChange: (value: "grid" | "surface") => void;
  hotspotsEnabled: boolean;
  onHotspotsEnabledChange: (value: boolean) => void;
  hotspotMode: "modeled" | "custom";
  onHotspotModeChange: (value: "modeled" | "custom") => void;
  hotspotPercentile: number;
  onHotspotPercentileChange: (value: number) => void;
  hotspotTotalCells: number | null;
  hotspotModeledCount: number | null;
  poiFilters: { Park: boolean; Marina: boolean; Ferry: boolean };
  onTogglePoiAll: () => void;
  onTogglePoiType: (type: "Park" | "Marina" | "Ferry") => void;
  selectedPaletteId: PaletteId;
  onPaletteChange: (paletteId: PaletteId) => void;
};

export function ToolDrawer({
  open,
  onToggle,
  onClose,
  surfaceMode,
  onSurfaceModeChange,
  hotspotsEnabled,
  onHotspotsEnabledChange,
  hotspotMode,
  onHotspotModeChange,
  hotspotPercentile,
  onHotspotPercentileChange,
  hotspotTotalCells,
  hotspotModeledCount,
  poiFilters,
  onTogglePoiAll,
  onTogglePoiType,
  selectedPaletteId,
  onPaletteChange,
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
              surfaceMode={surfaceMode}
              onSurfaceModeChange={onSurfaceModeChange}
              hotspotsEnabled={hotspotsEnabled}
              onHotspotsEnabledChange={onHotspotsEnabledChange}
              hotspotMode={hotspotMode}
              onHotspotModeChange={onHotspotModeChange}
              hotspotPercentile={hotspotPercentile}
              onHotspotPercentileChange={onHotspotPercentileChange}
              hotspotTotalCells={hotspotTotalCells}
              hotspotModeledCount={hotspotModeledCount}
              poiFilters={poiFilters}
              onTogglePoiAll={onTogglePoiAll}
              onTogglePoiType={onTogglePoiType}
              selectedPaletteId={selectedPaletteId}
              onPaletteChange={onPaletteChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
