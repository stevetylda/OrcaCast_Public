import React from "react";
import { Link } from "react-router-dom";
import { useMapState } from "../state/MapStateContext";
import { useMenu } from "../state/MenuContext";

type Props = {
  title: string;
  children: React.ReactNode;
  fullBleed?: boolean;

  /** Map chrome controls */
  showBottomRail?: boolean;
  showFooter?: boolean;

  /** Optional extra class on the stage wrapper (lets pages set background, etc.) */
  stageClassName?: string;
};

export function PageShell({
  title,
  children,
  fullBleed = false,
  showBottomRail = true,
  showFooter = true,
  stageClassName = "",
}: Props) {
  const { setMenuOpen } = useMenu();
  const { darkMode, setThemeMode } = useMapState();
  const chromeOn = showBottomRail || showFooter;

  const stageClasses = [
    "pageStage",
    chromeOn ? "pageStage--chrome" : "pageStage--noChrome",
    stageClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={stageClasses}>
      <header className="pageHeader">
        <div className="pageHeader__left">
          <button
            className="iconBtn iconBtn--menu"
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            type="button"
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              menu
            </span>
          </button>
          <div className="pageHeader__title">{title}</div>
        </div>

        <div className="pageHeader__right">
          <button
            className="iconBtn"
            onClick={() => setThemeMode(darkMode ? "light" : "dark")}
            aria-label="Toggle dark mode"
            title="Dark/Light Mode"
            type="button"
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              {darkMode ? "light_mode" : "dark_mode"}
            </span>
          </button>
          <Link className="backToMap" to="/" aria-label="Back to map" title="Back to map">
            <span className="backToMap__icon">
              <span className="material-symbols-rounded" aria-hidden="true">
                map
              </span>
              <span className="material-symbols-rounded" aria-hidden="true">
                subdirectory_arrow_left
              </span>
            </span>
          </Link>
        </div>
      </header>

      <main className={fullBleed ? "page page--fullBleed" : "page"}>
        <div className={fullBleed ? "page__content page__content--fullBleed" : "page__content"}>
          {children}
        </div>
      </main>

      {/* keep the exact same footer chrome as map pages (optional) */}
      {showFooter && (
        <div className="app__footer">
          <div className="footer">{/* optional attribution / links later */}</div>
        </div>
      )}

      {/* optional rail (map chrome) */}
      {showBottomRail && <div className="appShell__bottomRail" aria-hidden="true" />}
    </div>
  );
}
