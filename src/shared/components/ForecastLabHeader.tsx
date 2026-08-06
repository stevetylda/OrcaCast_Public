import { AppHeader } from "./AppHeader";
import { PrimaryNavigation } from "./PrimaryNavigation";
import "./ForecastLabHeader.css";

type ForecastLabHeaderProps = {
  onOpenMenu: () => void;
};

export function ForecastLabHeader({ onOpenMenu }: ForecastLabHeaderProps) {
  return (
    <AppHeader
      className="forecastLabHeader"
      title="OrcaCast"
      subtitle="Forecast Lab"
      variant="home"
      onOpenMenu={onOpenMenu}
      rightSlot={<PrimaryNavigation className="homeNav" />}
    />
  );
}
