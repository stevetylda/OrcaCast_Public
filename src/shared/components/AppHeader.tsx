import type { H3Resolution } from "../config/dataPaths";
import { H3ResolutionPill } from "../../features/watch/components/H3ResolutionPill";

type Resolution = H3Resolution;

type Props = {
  title: string;
  subtitle: string;
  resolution: Resolution;
  onResolutionChange: (v: Resolution) => void;
  onOpenInfo: () => void;
  onOpenMenu: () => void;
  onBrandClick?: () => void;
};

export function AppHeader({
  title,
  subtitle,
  resolution,
  onResolutionChange,
  onOpenInfo,
  onOpenMenu,
  onBrandClick,
}: Props) {
  return (
    <header className="header" data-tour="top-bar">
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
        <H3ResolutionPill
          value={resolution === "H4" ? 4 : resolution === "H5" ? 5 : 6}
          onChange={(next) =>
            onResolutionChange(next === 4 ? "H4" : next === 5 ? "H5" : "H6")
          }
          tourId="resolution"
        />

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
