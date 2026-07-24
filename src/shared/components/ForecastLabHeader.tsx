import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "./AppHeader";
import "./ForecastLabHeader.css";

type ForecastLabHeaderProps = {
  onOpenMenu: () => void;
};

const navigationItems = [
  { label: "This week", path: "/watch" },
  { label: "Plan a trip", path: "/planner" },
  { label: "Explore", path: "/explore" },
] as const;

export function ForecastLabHeader({ onOpenMenu }: ForecastLabHeaderProps) {
  const { pathname } = useLocation();

  return (
    <AppHeader
      className="forecastLabHeader"
      title="OrcaCast"
      subtitle="Forecast Lab"
      variant="home"
      onOpenMenu={onOpenMenu}
      rightSlot={
        <nav className="homeNav" aria-label="Forecast navigation">
          {navigationItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              aria-label={item.label}
              aria-current={pathname === item.path ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      }
    />
  );
}
