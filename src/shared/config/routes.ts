export type NavigationPlacement = "primary" | "drawer" | "notFound";
export type RouteActiveMatch = "exact" | "prefix";

export type RouteMetadata = {
  title: string;
  description: string;
};

export type AppRouteDefinition = {
  path: string;
  pageName: string;
  navigationLabel: string;
  metadata: RouteMetadata;
  navigation?: Partial<Record<NavigationPlacement, number>>;
  drawerIcon?: string;
  activeMatch: RouteActiveMatch;
  navigable: boolean;
};

export const APP_ROUTES = {
  home: {
    path: "/",
    pageName: "Home",
    navigationLabel: "Home",
    metadata: {
      title: "OrcaCast | Salish Sea Orca Forecasts",
      description:
        "Explore weekly orca activity outlooks, seasonal context, and shore-based trip-planning tools for the Salish Sea.",
    },
    navigation: { drawer: 10 },
    drawerIcon: "home",
    activeMatch: "exact",
    navigable: true,
  },
  watch: {
    path: "/watch",
    pageName: "Watch",
    navigationLabel: "This Week",
    metadata: {
      title: "This Week's Orca Forecast | OrcaCast",
      description:
        "View this week's modeled orca activity outlook across the Salish Sea, with regional maps, sightings context, and observation tools.",
    },
    navigation: { primary: 10, drawer: 20, notFound: 10 },
    drawerIcon: "map_search",
    activeMatch: "exact",
    navigable: true,
  },
  planner: {
    path: "/planner",
    pageName: "Planner",
    navigationLabel: "Plan a Trip",
    metadata: {
      title: "Plan an Orca-Watching Trip | OrcaCast",
      description:
        "Build a shore-based Salish Sea itinerary using dates, locations, seasonal activity, viewpoints, cameras, and local conditions.",
    },
    navigation: { primary: 20, drawer: 30, notFound: 20 },
    drawerIcon: "event_note",
    activeMatch: "exact",
    navigable: true,
  },
  explore: {
    path: "/explore",
    pageName: "Explore",
    navigationLabel: "Explore",
    metadata: {
      title: "Explore Whales and the Salish Sea | OrcaCast",
      description:
        "A forthcoming OrcaCast guide to whales, responsible whale watching, identification tips, and other wildlife of the Salish Sea.",
    },
    navigation: { primary: 30, drawer: 40, notFound: 30 },
    drawerIcon: "explore",
    activeMatch: "exact",
    navigable: true,
  },
  about: {
    path: "/about",
    pageName: "About",
    navigationLabel: "About",
    metadata: {
      title: "About OrcaCast | Forecast Lab",
      description:
        "Learn what OrcaCast is, how to interpret its outlooks, where its data comes from, and how to use forecasts responsibly.",
    },
    navigation: { drawer: 50, notFound: 40 },
    drawerIcon: "info",
    activeMatch: "prefix",
    navigable: true,
  },
  model: {
    path: "/about/model",
    pageName: "Model",
    navigationLabel: "How the Model Works",
    metadata: {
      title: "How the OrcaCast Model Works",
      description:
        "Explore the data, modeling workflow, validation approach, limitations, and personalized outputs behind OrcaCast forecasts.",
    },
    navigation: { notFound: 50 },
    activeMatch: "exact",
    navigable: true,
  },
  notFound: {
    path: "*",
    pageName: "Not found",
    navigationLabel: "Page Not Found",
    metadata: {
      title: "Page Not Found | OrcaCast",
      description:
        "That OrcaCast page could not be found. Return home or explore current Salish Sea forecasts and trip-planning tools.",
    },
    activeMatch: "exact",
    navigable: false,
  },
} as const satisfies Record<string, AppRouteDefinition>;

export type AppRouteId = keyof typeof APP_ROUTES;
export type NavigableRouteId = Exclude<AppRouteId, "notFound">;
export type RegisteredRoute = AppRouteDefinition & { id: AppRouteId };

export const APP_ROUTE_LIST: RegisteredRoute[] = Object.entries(APP_ROUTES).map(
  ([id, route]) => ({ id: id as AppRouteId, ...route }),
);

export const NAVIGABLE_ROUTE_LIST = APP_ROUTE_LIST.filter(
  (route): route is RegisteredRoute & { navigable: true } => route.navigable,
);

export function routePath<RouteId extends NavigableRouteId>(
  routeId: RouteId,
): (typeof APP_ROUTES)[RouteId]["path"] {
  return APP_ROUTES[routeId].path;
}

export function normalizeRoutePath(pathname: string): string {
  if (pathname === "/") return pathname;
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export function findRouteByPath(pathname: string) {
  const normalizedPath = normalizeRoutePath(pathname);
  return (
    NAVIGABLE_ROUTE_LIST.find((route) => route.path === normalizedPath) ??
    APP_ROUTE_LIST.find((route) => route.id === "notFound")!
  );
}

export function isRouteActive(
  pathname: string,
  route: Pick<AppRouteDefinition, "path" | "activeMatch">,
): boolean {
  const normalizedPath = normalizeRoutePath(pathname);
  if (route.activeMatch === "prefix" && route.path !== "/") {
    return (
      normalizedPath === route.path ||
      normalizedPath.startsWith(`${route.path}/`)
    );
  }
  return normalizedPath === route.path;
}

export function getNavigationRoutes(placement: NavigationPlacement) {
  return NAVIGABLE_ROUTE_LIST.filter(
    (route) => route.navigation?.[placement] !== undefined,
  ).sort(
    (left, right) =>
      (left.navigation?.[placement] ?? 0) -
      (right.navigation?.[placement] ?? 0),
  );
}
