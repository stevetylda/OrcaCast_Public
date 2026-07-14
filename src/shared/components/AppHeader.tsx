import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  title: string;
  subtitle: string;
  onOpenInfo: () => void;
  onOpenMenu: () => void;
  rightSlot?: ReactNode;
  variant?: "default" | "home";
};

export function AppHeader({
  title,
  subtitle,
  onOpenInfo,
  onOpenMenu,
  rightSlot,
  variant = "default",
}: Props) {
  return (
    <header
      className={`header${variant === "home" ? " header--home" : ""}`}
      data-tour="top-bar"
    >
      <div className="header__left">
        <button
          className="iconBtn iconBtn--menu"
          onClick={onOpenMenu}
          aria-label="Menu"
          data-tour="menu"
        >
          <span className="material-symbols-rounded">menu</span>
        </button>

        <Link
          className="brand brandBtn brandBtn--active"
          to="/"
          aria-label="OrcaCast home"
        >
          <div className="brand__title">
            {title} <span className="brand__subtitle">– {subtitle}</span>
          </div>
        </Link>
      </div>

      <div className="header__right">
        {rightSlot}
        <button
          className="iconBtn"
          onClick={onOpenInfo}
          aria-label="Info"
          data-tour="info"
        >
          <span className="material-symbols-rounded">info</span>
        </button>
      </div>
    </header>
  );
}
