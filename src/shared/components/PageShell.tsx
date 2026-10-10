import React from "react";
import { Link } from "react-router-dom";
import { routePath } from "../config/routes";
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
            aria-label="Open main menu"
            type="button"
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              menu
            </span>
          </button>
          <div className="pageHeader__title">{title}</div>
        </div>

        <div className="pageHeader__right">
          <Link
            className="backToMap"
            to={routePath("home")}
            aria-label="Back home"
            title="Back home"
          >
            <span className="backToMap__icon">
              <span className="material-symbols-rounded" aria-hidden="true">
                home
              </span>
              <span className="material-symbols-rounded" aria-hidden="true">
                subdirectory_arrow_left
              </span>
            </span>
          </Link>
        </div>
      </header>

      <main className={fullBleed ? "page page--fullBleed" : "page"}>
        <div
          className={
            fullBleed
              ? "page__content page__content--fullBleed"
              : "page__content"
          }
        >
          {children}
        </div>
      </main>

      {/* keep the exact same footer chrome as map pages (optional) */}
      {showFooter && (
        <div className="app__footer">
          <div className="footer">
            {/* optional attribution / links later */}
          </div>
        </div>
      )}

      {/* optional rail (map chrome) */}
      {showBottomRail && (
        <div className="appShell__bottomRail" aria-hidden="true" />
      )}
    </div>
  );
}
