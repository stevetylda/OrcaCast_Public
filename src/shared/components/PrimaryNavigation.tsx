import { Link, useLocation } from "react-router-dom";
import { getNavigationRoutes, isRouteActive } from "../config/routes";

type PrimaryNavigationProps = {
  className?: string;
  ariaLabel?: string;
};

export function PrimaryNavigation({
  className,
  ariaLabel = "Forecast navigation",
}: PrimaryNavigationProps) {
  const { pathname } = useLocation();
  const routes = getNavigationRoutes("primary");

  return (
    <nav className={className} aria-label={ariaLabel}>
      {routes.map((route) => (
        <Link
          key={route.id}
          to={route.path}
          aria-label={route.navigationLabel}
          aria-current={isRouteActive(pathname, route) ? "page" : undefined}
        >
          {route.navigationLabel}
        </Link>
      ))}
    </nav>
  );
}
