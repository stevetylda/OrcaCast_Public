import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle: string;
  onOpenInfo: () => void;
  onOpenMenu: () => void;
  onBrandClick?: () => void;
  rightSlot?: ReactNode;
  variant?: "default" | "home";
};

export function AppHeader({
  title,
  subtitle,
  onOpenInfo,
  onOpenMenu,
  onBrandClick,
  rightSlot,
  variant = "default",
}: Props) {
  return (
    <header className={`header${variant === "home" ? " header--home" : ""}`} data-tour="top-bar">
      <div className="header__left">
        <button
          className="iconBtn iconBtn--menu"
          onClick={onOpenMenu}
          aria-label="Menu"
          data-tour="menu"
        >
          <span className="material-symbols-rounded">menu</span>
        </button>

        <button
          type="button"
          className={`brand brandBtn${onBrandClick ? " brandBtn--active" : ""}`}
          onClick={onBrandClick}
          aria-label={onBrandClick ? "Reset map" : undefined}
          title={onBrandClick ? "Reset map" : undefined}
        >
          <div className="brand__title">
            {title} <span className="brand__subtitle">– {subtitle}</span>
          </div>
        </button>
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
