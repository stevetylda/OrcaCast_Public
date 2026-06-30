import { useEffect, useMemo, useRef, useState } from "react";
import { HotspotsSettingsSection } from "../../features/watch/components/HotspotsSettingsSection";
import { AttributionHover } from "./AttributionHover";
import { PALETTES, getPalette, type PaletteId } from "../geo/palettes";
import type { SuggestedPlace } from "../../features/locations/types";
import type { UnitsMode } from "../state/MapStateContext";

type Props = {
  onShareSnapshot?: () => void;
  onDownloadSnapshot?: () => void;
  shareBusy?: boolean;
  places: SuggestedPlace[];
  selectedPlaceId: string | null;
  onSelectPlace: (place: SuggestedPlace) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  unitsMode: UnitsMode;
  onUnitsModeChange: (mode: UnitsMode) => void;
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

type DockPanelId = "live-cams" | "hydrophones" | "settings" | null;

function formatPlaceType(type: SuggestedPlace["type"]) {
  if (type === "Ferry") return "Ferry terminal";
  return type;
}

export function AppFooter({
  onShareSnapshot,
  onDownloadSnapshot,
  shareBusy = false,
  places,
  selectedPlaceId,
  onSelectPlace,
  darkMode,
  onToggleDarkMode,
  unitsMode,
  onUnitsModeChange,
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
  const [activePanel, setActivePanel] = useState<DockPanelId>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const activePalette = getPalette(selectedPaletteId);

  const liveCamPlaces = useMemo(() => places.filter((place) => place.hasLiveFeed), [places]);
  const hydrophonePlaces = useMemo(() => places.filter((place) => place.hasHydrophone), [places]);
  const poiActive = poiFilters.Park || poiFilters.Marina || poiFilters.Ferry;

  useEffect(() => {
    if (!activePanel) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!dockRef.current?.contains(event.target as Node)) {
        setActivePanel(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePanel(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activePanel]);

  const renderPlacesPanel = (items: SuggestedPlace[], emptyLabel: string, ctaLabel: string) => (
    <div className="footerDock__panel footerDock__panel--places" role="dialog" aria-modal="false">
      <div className="footerDock__panelHeader">
        <div>
          <div className="footerDock__eyebrow">Watch tools</div>
          <div className="footerDock__title">{ctaLabel}</div>
        </div>
        <span className="footerDock__count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="footerDock__empty">{emptyLabel}</div>
      ) : (
        <div className="footerDock__placeList">
          {items.map((place) => {
            const selected = place.id === selectedPlaceId;
            return (
              <button
                key={place.id}
                type="button"
                className={`footerDock__placeItem${selected ? " isSelected" : ""}`}
                onClick={() => onSelectPlace(place)}
              >
                <span className="footerDock__placeText">
                  <span className="footerDock__placeName">{place.name}</span>
                  <span className="footerDock__placeMeta">
                    <span>{formatPlaceType(place.type)}</span>
                    {place.region && <span>{place.region}</span>}
                  </span>
                </span>
                <span className="footerDock__placeAction">
                  Show
                  <span className="material-symbols-rounded" aria-hidden="true">
                    place
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="footerDock" ref={dockRef}>
      <div className="footerDock__stack">
        {activePanel === "live-cams" &&
          renderPlacesPanel(
            liveCamPlaces,
            "No currently suggested places have live cameras attached.",
            "Live Cams"
          )}
        {activePanel === "hydrophones" &&
          renderPlacesPanel(
            hydrophonePlaces,
            "No currently suggested places have hydrophone coverage attached.",
            "Hydrophones"
          )}
        {activePanel === "settings" && (
          <div className="footerDock__panel footerDock__panel--settings" role="dialog" aria-modal="false">
            <div className="footerDock__panelHeader">
              <div className="footerDock__titleRow" data-tour="theme-toggle">
                <span className="material-symbols-rounded" aria-hidden="true">
                  settings
                </span>
                <span className="footerDock__title">Settings</span>
              </div>
            </div>

            <section className="footerDock__section">
              <div className="footerDock__sectionLabel">Appearance</div>
              <div className="footerDock__settingRow">
                <span>Night mode</span>
                <button
                  type="button"
                  className={`hotspotSwitch${darkMode ? " hotspotSwitch--on" : ""}`}
                  onClick={onToggleDarkMode}
                  aria-pressed={darkMode}
                >
                  <span className="hotspotSwitch__knob" />
                </button>
              </div>
              <div className="footerDock__settingBlock">
                <div className="footerDock__settingCaption">Units</div>
                <div className="footerDock__segmented" role="group" aria-label="Units">
                  <button
                    type="button"
                    className={unitsMode === "imperial" ? "footerDock__segment isActive" : "footerDock__segment"}
                    onClick={() => onUnitsModeChange("imperial")}
                  >
                    Imperial
                  </button>
                  <button
                    type="button"
                    className={unitsMode === "metric" ? "footerDock__segment isActive" : "footerDock__segment"}
                    onClick={() => onUnitsModeChange("metric")}
                  >
                    Metric
                  </button>
                </div>
              </div>
            </section>

            <section className="footerDock__section">
              <div className="footerDock__sectionLabel">Map layers</div>
              <div className="footerDock__settingBlock">
                <div className="footerDock__settingCaption">Surface view</div>
                <div className="footerDock__segmented">
                  <button
                    type="button"
                    className={surfaceMode === "grid" ? "footerDock__segment isActive" : "footerDock__segment"}
                    onClick={() => onSurfaceModeChange("grid")}
                  >
                    Hex grid
                  </button>
                  <button
                    type="button"
                    className={surfaceMode === "surface" ? "footerDock__segment isActive" : "footerDock__segment"}
                    onClick={() => onSurfaceModeChange("surface")}
                  >
                    Smooth
                  </button>
                </div>
              </div>
              <div className="footerDock__settingBlock" data-tour="poi">
                <div className="footerDock__settingCaption">Points of interest</div>
                <div className="footerDock__toggleGrid">
                  <button
                    type="button"
                    className={poiActive ? "footerDock__chip isActive" : "footerDock__chip"}
                    onClick={onTogglePoiAll}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={poiFilters.Park ? "footerDock__chip isActive" : "footerDock__chip"}
                    onClick={() => onTogglePoiType("Park")}
                  >
                    Parks
                  </button>
                  <button
                    type="button"
                    className={poiFilters.Marina ? "footerDock__chip isActive" : "footerDock__chip"}
                    onClick={() => onTogglePoiType("Marina")}
                  >
                    Marinas
                  </button>
                  <button
                    type="button"
                    className={poiFilters.Ferry ? "footerDock__chip isActive" : "footerDock__chip"}
                    onClick={() => onTogglePoiType("Ferry")}
                  >
                    Ferries
                  </button>
                </div>
              </div>
              <div className="footerDock__settingBlock" data-tour="hotspots">
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
            </section>

            <section className="footerDock__section" data-tour="palette-picker">
              <div className="footerDock__sectionLabel">Color scale</div>
              <div className="footerDock__paletteList">
                {Object.values(PALETTES).map((palette) => {
                  const selected = palette.id === selectedPaletteId;
                  return (
                    <button
                      key={palette.id}
                      type="button"
                      className={`footerDock__paletteRow${selected ? " isSelected" : ""}`}
                      onClick={() => onPaletteChange(palette.id)}
                    >
                      <span className="footerDock__paletteSwatches" aria-hidden="true">
                        {palette.colors.map((color, index) => (
                          <span
                            key={`${palette.id}-${index}`}
                            className="footerDock__paletteSwatch"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                      <span className="footerDock__paletteName">{palette.name}</span>
                      <span className="material-symbols-rounded footerDock__paletteCheck" aria-hidden="true">
                        {selected ? "check" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="footerDock__section">
              <div className="footerDock__sectionLabel">Utilities</div>
              <div className="footerDock__utilityRow">
                <AttributionHover className="footerDock__utilityPill" />
                <div className="footerDock__snapshotGroup">
                  <button
                    type="button"
                    className="footerDock__utilityIcon"
                    onClick={onDownloadSnapshot}
                    disabled={shareBusy || !onDownloadSnapshot}
                    title="Download snapshot"
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">
                      download
                    </span>
                  </button>
                  <button
                    type="button"
                    className="footerDock__utilityIcon"
                    onClick={onShareSnapshot}
                    disabled={shareBusy || !onShareSnapshot}
                    title="Share snapshot"
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">
                      ios_share
                    </span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="footerDock__rail" role="group" aria-label="Map dock">
          {[
            {
              id: "live-cams" as const,
              icon: "videocam",
              label: "Live Cams",
              count: liveCamPlaces.length,
            },
            {
              id: "hydrophones" as const,
              icon: "graphic_eq",
              label: "Hydrophones",
              count: hydrophonePlaces.length,
            },
            {
              id: "settings" as const,
              icon: activePalette.id === selectedPaletteId ? "palette" : "settings",
              label: "Settings",
            },
          ].map((item) => {
            const open = activePanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`footerDock__button${open ? " isActive" : ""}`}
                onClick={() => setActivePanel(open ? null : item.id)}
                data-tour={item.id === "settings" ? "tools" : undefined}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {typeof item.count === "number" && <span className="footerDock__buttonCount">{item.count}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
