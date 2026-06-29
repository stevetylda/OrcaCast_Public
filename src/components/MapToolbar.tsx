import { useEffect, useRef, useState } from "react";
import { HotspotsSettingsSection } from "./map/settings/HotspotsSettingsSection";
import { PALETTES, getPalette, type PaletteId } from "../constants/palettes";

type Props = {
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
  className?: string;
};

export function MapToolbar({
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
  className,
}: Props) {
  const poiRef = useRef<HTMLDivElement | null>(null);
  const hotspotRef = useRef<HTMLDivElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const [poiOpen, setPoiOpen] = useState(false);
  const [hotspotOpen, setHotspotOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const poiActive = poiFilters.Park || poiFilters.Marina || poiFilters.Ferry;
  const activePalette = getPalette(selectedPaletteId);

  useEffect(() => {
    if (!poiOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!poiRef.current) return;
      if (poiRef.current.contains(event.target as Node)) return;
      setPoiOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPoiOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [poiOpen]);

  useEffect(() => {
    if (!hotspotOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!hotspotRef.current) return;
      if (hotspotRef.current.contains(event.target as Node)) return;
      setHotspotOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setHotspotOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [hotspotOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!paletteRef.current) return;
      if (paletteRef.current.contains(event.target as Node)) return;
      setPaletteOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPaletteOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [paletteOpen]);

  return (
    <div className={className ? `toolbar ${className}` : "toolbar"} data-tour="toolbar">
      <div ref={poiRef} className={`toolMenu${poiOpen ? " toolMenu--open" : ""}`}>
        <button
          className={`toolBtn${poiActive ? " toolBtn--active" : ""}`}
          onClick={() => {
            onTogglePoiAll();
            setPoiOpen(true);
          }}
          title="POI filters"
          aria-label="POI filters"
          data-tour="poi"
        >
          <span className="material-symbols-rounded">pin_drop</span>
        </button>
        {poiOpen && (
          <div className="toolMenu__popover" role="menu" aria-label="Points of interest">
            <button
              className={`toolMenu__option${poiFilters.Park ? " toolMenu__option--active" : ""}`}
              onClick={() => onTogglePoiType("Park")}
              title="Parks"
              aria-label="Parks"
            >
              <span className="material-symbols-rounded">park</span>
            </button>
            <button
              className={`toolMenu__option${poiFilters.Marina ? " toolMenu__option--active" : ""}`}
              onClick={() => onTogglePoiType("Marina")}
              title="Marinas"
              aria-label="Marinas"
            >
              <span className="material-symbols-rounded">sailing</span>
            </button>
            <button
              className={`toolMenu__option${poiFilters.Ferry ? " toolMenu__option--active" : ""}`}
              onClick={() => onTogglePoiType("Ferry")}
              title="Ferries"
              aria-label="Ferries"
            >
              <span className="material-symbols-rounded">directions_boat</span>
            </button>
          </div>
        )}
      </div>
      <div ref={hotspotRef} className={`toolMenu${hotspotOpen ? " toolMenu--open" : ""}`}>
        <button
          className={`toolBtn${hotspotsEnabled ? " toolBtn--active" : ""}`}
          onClick={() => setHotspotOpen((v) => !v)}
          title="Hotspot threshold"
          aria-label="Hotspot threshold"
          data-tour="tools-hotspots"
        >
          <span className="toolBtn__iconStack" aria-hidden="true">
            <span className="material-symbols-rounded toolBtn__iconBase toolBtn__iconBase--hotspot">
              local_fire_department
            </span>
            <span className="material-symbols-rounded toolBtn__iconBadge">settings</span>
          </span>
        </button>
        {hotspotOpen && (
          <div
            className="toolMenu__popover toolMenu__popover--stack"
            role="dialog"
            aria-label="Hotspots settings"
          >
            <HotspotsSettingsSection
              enabled={hotspotsEnabled}
              onEnabledChange={onHotspotsEnabledChange}
              mode={hotspotMode}
              onModeChange={onHotspotModeChange}
              percentile={hotspotPercentile}
              onPercentileChange={onHotspotPercentileChange}
              totalCells={hotspotTotalCells}
              modeledCount={hotspotModeledCount}
            />
          </div>
        )}
      </div>
      <div ref={paletteRef} className={`toolMenu toolDrawer__paletteMenu${paletteOpen ? " toolMenu--open" : ""}`}>
        <button
          className="toolBtn toolDrawer__paletteToggle"
          onClick={() => setPaletteOpen((v) => !v)}
          aria-label="Color palette"
          title="Color palette"
          data-tour="palette-picker"
        >
          <span className="toolBtn__iconStack" aria-hidden="true">
            <span
              className="material-symbols-rounded toolBtn__iconBase toolBtn__iconBase--palette"
              style={{ color: activePalette.dominant }}
            >
              palette
            </span>
            <span className="material-symbols-rounded toolBtn__iconBadge">settings</span>
          </span>
        </button>
        {paletteOpen && (
          <div
            className="toolMenu__popover toolMenu__popover--stack toolDrawer__palettePopover"
            role="menu"
            aria-label="Sighting outlook palettes"
            onWheel={(event) => event.stopPropagation()}
          >
            {Object.values(PALETTES).map((palette) => {
              const selected = palette.id === selectedPaletteId;
              return (
                <button
                  key={palette.id}
                  type="button"
                  className={`toolDrawer__paletteRow${selected ? " isSelected" : ""}`}
                  onClick={() => {
                    onPaletteChange(palette.id);
                    setPaletteOpen(false);
                  }}
                  role="menuitemradio"
                  aria-checked={selected}
                >
                  <span className="toolDrawer__paletteChips" aria-hidden="true">
                    {palette.colors.map((color, idx) => (
                      <span
                        key={`${palette.id}-chip-${idx}`}
                        className="toolDrawer__paletteChip"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span className="toolDrawer__paletteLabel">{palette.name}</span>
                  <span className="toolDrawer__paletteCheck material-symbols-rounded" aria-hidden="true">
                    {selected ? "check" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
