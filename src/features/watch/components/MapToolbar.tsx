import { useEffect, useRef, useState } from "react";
import { HotspotsSettingsSection } from "./HotspotsSettingsSection";
import {
  PALETTES,
  getPalette,
  type PaletteId,
} from "../../../shared/geo/palettes";

type Props = {
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
  className?: string;
};

export function MapToolbar({
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
  className,
}: Props) {
  const poiRef = useRef<HTMLDivElement | null>(null);
  const hotspotRef = useRef<HTMLDivElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const poiTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hotspotTriggerRef = useRef<HTMLButtonElement | null>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement | null>(null);
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
      window.requestAnimationFrame(() => poiTriggerRef.current?.focus());
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
      window.requestAnimationFrame(() => hotspotTriggerRef.current?.focus());
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
      window.requestAnimationFrame(() => paletteTriggerRef.current?.focus());
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [paletteOpen]);

  return (
    <div
      className={className ? `toolbar ${className}` : "toolbar"}
      data-tour="toolbar"
    >
      <div className="toolMenu">
        <button
          className={`toolBtn${surfaceMode === "surface" ? " toolBtn--active" : ""}`}
          onClick={() =>
            onSurfaceModeChange(surfaceMode === "surface" ? "grid" : "surface")
          }
          title={
            surfaceMode === "surface" ? "Show hex grid" : "Show smooth surface"
          }
          aria-label={
            surfaceMode === "surface" ? "Show hex grid" : "Show smooth surface"
          }
          aria-pressed={surfaceMode === "surface"}
        >
          <span className="toolBtn__iconStack" aria-hidden="true">
            <span className="material-symbols-rounded toolBtn__iconBase">
              blur_on
            </span>
            <span className="material-symbols-rounded toolBtn__iconBadge">
              {surfaceMode === "surface" ? "check" : "swap_horiz"}
            </span>
          </span>
        </button>
      </div>
      <div
        ref={poiRef}
        className={`toolMenu${poiOpen ? " toolMenu--open" : ""}`}
      >
        <button
          ref={poiTriggerRef}
          className={`toolBtn${poiActive ? " toolBtn--active" : ""}`}
          onClick={() => {
            onTogglePoiAll();
            setPoiOpen(true);
            window.requestAnimationFrame(() =>
              poiRef.current
                ?.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')
                ?.focus(),
            );
          }}
          title="POI filters"
          aria-label="POI filters"
          aria-haspopup="menu"
          aria-expanded={poiOpen}
          data-tour="poi"
        >
          <span className="material-symbols-rounded">pin_drop</span>
        </button>
        {poiOpen && (
          <div
            className="toolMenu__popover"
            role="menu"
            aria-label="Points of interest"
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitemcheckbox"]',
                ),
              );
              const currentIndex = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              let nextIndex = currentIndex;
              if (event.key === "ArrowDown") nextIndex += 1;
              else if (event.key === "ArrowUp") nextIndex -= 1;
              else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = items.length - 1;
              else return;
              event.preventDefault();
              items[
                Math.max(0, Math.min(items.length - 1, nextIndex))
              ]?.focus();
            }}
          >
            <button
              className={`toolMenu__option${poiFilters.Park ? " toolMenu__option--active" : ""}`}
              onClick={() => onTogglePoiType("Park")}
              title="Parks"
              aria-label="Parks"
              role="menuitemcheckbox"
              aria-checked={poiFilters.Park}
              tabIndex={0}
            >
              <span className="material-symbols-rounded">park</span>
            </button>
            <button
              className={`toolMenu__option${poiFilters.Marina ? " toolMenu__option--active" : ""}`}
              onClick={() => onTogglePoiType("Marina")}
              title="Marinas"
              aria-label="Marinas"
              role="menuitemcheckbox"
              aria-checked={poiFilters.Marina}
              tabIndex={-1}
            >
              <span className="material-symbols-rounded">sailing</span>
            </button>
            <button
              className={`toolMenu__option${poiFilters.Ferry ? " toolMenu__option--active" : ""}`}
              onClick={() => onTogglePoiType("Ferry")}
              title="Ferries"
              aria-label="Ferries"
              role="menuitemcheckbox"
              aria-checked={poiFilters.Ferry}
              tabIndex={-1}
            >
              <span className="material-symbols-rounded">directions_boat</span>
            </button>
          </div>
        )}
      </div>
      <div
        ref={hotspotRef}
        className={`toolMenu${hotspotOpen ? " toolMenu--open" : ""}`}
      >
        <button
          ref={hotspotTriggerRef}
          className={`toolBtn${hotspotsEnabled ? " toolBtn--active" : ""}`}
          onClick={() => setHotspotOpen((v) => !v)}
          title="Hotspot threshold"
          aria-label="Hotspot threshold"
          aria-haspopup="dialog"
          aria-expanded={hotspotOpen}
          data-tour="tools-hotspots"
        >
          <span className="toolBtn__iconStack" aria-hidden="true">
            <span className="material-symbols-rounded toolBtn__iconBase toolBtn__iconBase--hotspot">
              local_fire_department
            </span>
            <span className="material-symbols-rounded toolBtn__iconBadge">
              settings
            </span>
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
      <div
        ref={paletteRef}
        className={`toolMenu toolDrawer__paletteMenu${paletteOpen ? " toolMenu--open" : ""}`}
      >
        <button
          ref={paletteTriggerRef}
          className="toolBtn toolDrawer__paletteToggle"
          onClick={() => {
            setPaletteOpen((value) => !value);
            window.requestAnimationFrame(() =>
              paletteRef.current
                ?.querySelector<HTMLButtonElement>(
                  '[role="menuitemradio"][aria-checked="true"], [role="menuitemradio"]',
                )
                ?.focus(),
            );
          }}
          aria-label="Color palette"
          aria-haspopup="menu"
          aria-expanded={paletteOpen}
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
            <span className="material-symbols-rounded toolBtn__iconBadge">
              settings
            </span>
          </span>
        </button>
        {paletteOpen && (
          <div
            className="toolMenu__popover toolMenu__popover--stack toolDrawer__palettePopover"
            role="menu"
            aria-label="Sighting outlook palettes"
            onWheel={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitemradio"]',
                ),
              );
              const currentIndex = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              let nextIndex = currentIndex;
              if (event.key === "ArrowDown") nextIndex += 1;
              else if (event.key === "ArrowUp") nextIndex -= 1;
              else if (event.key === "Home") nextIndex = 0;
              else if (event.key === "End") nextIndex = items.length - 1;
              else return;
              event.preventDefault();
              items[
                Math.max(0, Math.min(items.length - 1, nextIndex))
              ]?.focus();
            }}
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
                  tabIndex={selected ? 0 : -1}
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
                  <span className="toolDrawer__paletteLabel">
                    {palette.name}
                  </span>
                  <span
                    className="toolDrawer__paletteCheck material-symbols-rounded"
                    aria-hidden="true"
                  >
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
