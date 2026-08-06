import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { APP_ROUTES, isRouteActive, routePath } from "../config/routes";

type Props = {
  className?: string;
  title: string;
  subtitle: string;
  onOpenMenu: () => void;
  rightSlot?: ReactNode;
  variant?: "default" | "home";
};

export function AppHeader({
  className = "",
  title,
  subtitle,
  onOpenMenu,
  rightSlot,
  variant = "default",
}: Props) {
  const { pathname } = useLocation();
  return (
    <header
      className={`header${variant === "home" ? " header--home" : ""}${className ? ` ${className}` : ""}`}
      data-tour="top-bar"
    >
      <div className="header__left">
        <button
          type="button"
          className="iconBtn iconBtn--menu"
          onClick={onOpenMenu}
          aria-label="Open main menu"
          data-tour="menu"
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            menu
          </span>
        </button>

        <Link
          className="brand brandBtn brandBtn--active"
          to={routePath("home")}
          aria-label="OrcaCast home"
          aria-current={
            isRouteActive(pathname, APP_ROUTES.home) ? "page" : undefined
          }
        >
          <div className="brand__title">
            {title} <span className="brand__subtitle">– {subtitle}</span>
          </div>
        </Link>
      </div>

      <div className="header__right">
        {rightSlot}
        <Link
          className="iconBtn"
          to={routePath("about")}
          aria-label="About OrcaCast"
          aria-current={
            isRouteActive(pathname, APP_ROUTES.about) ? "page" : undefined
          }
          data-tour="info"
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            info
          </span>
        </Link>
      </div>
    </header>
  );
}
