import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTES, type PaletteId } from "../geo/palettes";
import type { SuggestedPlace } from "../../features/locations/types";
import type { UnitsMode } from "../state/MapStateContext";
import { H3ResolutionPill } from "../../features/watch/components/H3ResolutionPill";

type Props = {
  onShareSnapshot?: () => void;
  onDownloadSnapshot?: () => void;
  shareBusy?: boolean;
  places: SuggestedPlace[];
  selectedPlaceId: string | null;
  onSelectPlace: (place: SuggestedPlace) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  resolution: "H4" | "H5" | "H6";
  onResolutionChange: (value: "H4" | "H5" | "H6") => void;
  unitsMode: UnitsMode;
  onUnitsModeChange: (mode: UnitsMode) => void;
  surfaceMode: "grid" | "surface";
  onSurfaceModeChange: (value: "grid" | "surface") => void;
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
  resolution,
  onResolutionChange,
  unitsMode,
  onUnitsModeChange,
  surfaceMode,
  onSurfaceModeChange,
  poiFilters,
  onTogglePoiAll,
  onTogglePoiType,
  selectedPaletteId,
  onPaletteChange,
}: Props) {
  const [activePanel, setActivePanel] = useState<DockPanelId>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (activePanel !== "settings") setPaletteOpen(false);
  }, [activePanel]);

  const activePalette = PALETTES[selectedPaletteId];

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
            <div className="footerDock__panelHeader footerDock__panelHeader--settings">
              <div className="footerDock__titleRow" data-tour="theme-toggle">
                <span className="footerDock__title">Settings</span>
              </div>
              <div className="footerDock__headerActions">
                <button
                  type="button"
                  className="footerDock__utilityIcon footerDock__utilityIcon--header"
                  onClick={onDownloadSnapshot}
                  disabled={shareBusy || !onDownloadSnapshot}
                  title="Download snapshot"
                  aria-label="Download snapshot"
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    download
                  </span>
                </button>
                <button
                  type="button"
                  className="footerDock__utilityIcon footerDock__utilityIcon--header"
                  onClick={onShareSnapshot}
                  disabled={shareBusy || !onShareSnapshot}
                  title="Share snapshot"
                  aria-label="Share snapshot"
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    ios_share
                  </span>
                </button>
                <button
                  type="button"
                  className="footerDock__closeButton"
                  onClick={() => setActivePanel(null)}
                  title="Close settings"
                  aria-label="Close settings"
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
            </div>

            <section className="footerDock__section footerDock__section--settings">
              <div className="footerDock__sectionLabel">Appearance</div>
              <div className="footerDock__settingRow footerDock__settingRow--button">
                <span className="footerDock__settingLabel">Theme</span>
                <button
                  type="button"
                  className="footerDock__modeButton"
                  onClick={onToggleDarkMode}
                  aria-pressed={darkMode}
                  aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    {darkMode ? "light_mode" : "dark_mode"}
                  </span>
                  <span>{darkMode ? "Dark mode" : "Light mode"}</span>
                </button>
              </div>
              <label className="footerDock__settingRow footerDock__settingRow--select">
                <span className="footerDock__settingLabel">Units</span>
                <span className="footerDock__selectWrap">
                  <select
                    className="select select--footer"
                    value={unitsMode}
                    onChange={(event) => onUnitsModeChange(event.target.value as UnitsMode)}
                    aria-label="Units"
                  >
                    <option value="imperial">Imperial</option>
                    <option value="metric">Metric</option>
                  </select>
                  <span className="material-symbols-rounded footerDock__selectChevron" aria-hidden="true">
                    expand_more
                  </span>
                </span>
              </label>
            </section>

            <section className="footerDock__section footerDock__section--settings">
              <div className="footerDock__sectionLabel">Map layers</div>
              <label className="footerDock__settingRow footerDock__settingRow--select">
                <span className="footerDock__settingLabel">Surface view</span>
                <span className="footerDock__settingControls footerDock__settingControls--layers">
                  <span className="footerDock__resolutionInline" data-tour="resolution">
                    <H3ResolutionPill
                      value={resolution === "H4" ? 4 : resolution === "H5" ? 5 : 6}
                      onChange={(next) => onResolutionChange(next === 4 ? "H4" : next === 5 ? "H5" : "H6")}
                      compact
                    />
                  </span>
                  <select
                    className="select select--footer"
                    value={surfaceMode}
                    onChange={(event) => onSurfaceModeChange(event.target.value as "grid" | "surface")}
                    aria-label="Surface view"
                  >
                    <option value="grid">Hex grid</option>
                    <option value="surface">Smooth</option>
                  </select>
                  <span className="material-symbols-rounded footerDock__selectChevron" aria-hidden="true">
                    expand_more
                  </span>
                </span>
              </label>
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
                    <span className="footerDock__chipInner">
                      <span className="footerDock__chipIcons footerDock__chipIcons--park" aria-hidden="true">
                        <span className="material-symbols-rounded">park</span>
                      </span>
                      <span>Parks</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={poiFilters.Marina ? "footerDock__chip isActive" : "footerDock__chip"}
                    onClick={() => onTogglePoiType("Marina")}
                  >
                    <span className="footerDock__chipInner">
                      <span className="footerDock__chipIcons footerDock__chipIcons--marina" aria-hidden="true">
                        <span className="material-symbols-rounded">anchor</span>
                      </span>
                      <span>Marinas</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={poiFilters.Ferry ? "footerDock__chip isActive" : "footerDock__chip"}
                    onClick={() => onTogglePoiType("Ferry")}
                  >
                    <span className="footerDock__chipInner">
                      <span className="footerDock__chipIcons footerDock__chipIcons--ferry" aria-hidden="true">
                        <span className="material-symbols-rounded">directions_boat</span>
                      </span>
                      <span>Ferries</span>
                    </span>
                  </button>
                </div>
              </div>
            </section>

            <section className="footerDock__section footerDock__section--settings" data-tour="palette-picker">
              <div className="footerDock__sectionLabel">Color scale</div>
              <div className="footerDock__settingBlock">
                <div className="footerDock__settingCaption">Palette</div>
                <button
                  type="button"
                  className={`footerDock__paletteTrigger${paletteOpen ? " isOpen" : ""}`}
                  onClick={() => setPaletteOpen((value) => !value)}
                  aria-expanded={paletteOpen}
                  aria-label="Color scale"
                >
                  <span className="footerDock__paletteTriggerMain">
                    <span className="footerDock__paletteSwatches" aria-hidden="true">
                      {activePalette.colors.slice(0, 5).map((color, index) => (
                        <span
                          key={`${activePalette.id}-active-${index}`}
                          className="footerDock__paletteSwatch"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="footerDock__paletteName">{activePalette.name}</span>
                  </span>
                  <span className="material-symbols-rounded footerDock__paletteChevron" aria-hidden="true">
                    expand_more
                  </span>
                </button>
                {paletteOpen && (
                  <div className="footerDock__paletteList" role="listbox" aria-label="Color scale palettes">
                    {Object.values(PALETTES).map((palette) => {
                      const selected = palette.id === selectedPaletteId;
                      return (
                        <button
                          key={palette.id}
                          type="button"
                          className={`footerDock__paletteRow${selected ? " isSelected" : ""}`}
                          onClick={() => {
                            onPaletteChange(palette.id);
                            setPaletteOpen(false);
                          }}
                        >
                          <span className="footerDock__paletteSwatches" aria-hidden="true">
                            {palette.colors.slice(0, 5).map((color, index) => (
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
                )}
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
              icon: "settings",
              label: "Settings",
            },
          ].map((item) => {
            const open = activePanel === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`footerDock__button${item.id === "settings" ? " footerDock__button--iconOnly" : ""}${open ? " isActive" : ""}`}
                onClick={() => setActivePanel(open ? null : item.id)}
                data-tour={item.id === "settings" ? "tools" : undefined}
                aria-label={item.label}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  {item.icon}
                </span>
                {item.id !== "settings" && <span>{item.label}</span>}
                {typeof item.count === "number" && <span className="footerDock__buttonCount">{item.count}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
