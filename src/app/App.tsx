import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SideDrawer } from "../shared/components/SideDrawer";
import { PageErrorBoundary } from "../shared/components/PageErrorBoundary";
import { MenuProvider, useMenu } from "../shared/state/MenuContext";
import { MapStateProvider, useMapState } from "../shared/state/MapStateContext";
import { APP_ROUTE_LIST, type AppRouteId } from "../shared/config/routes";
import { HashScrollHandler } from "./HashScrollHandler";
import { RouteMetadata } from "./RouteMetadata";
import "../shared/styles/base.css";
import "../shared/styles/layout.css";
import "../shared/styles/components.css";

const AboutPage = lazy(() =>
  import("../pages/AboutPage").then((m) => ({ default: m.AboutPage })),
);
const ModelPage = lazy(() =>
  import("../pages/ModelPage").then((m) => ({ default: m.ModelPage })),
);
const PlanPage = lazy(() =>
  import("../pages/PlanPage").then((m) => ({ default: m.PlanPage })),
);
const HomePage = lazy(() =>
  import("../pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const WatchPage = lazy(() =>
  import("../pages/WatchPage").then((m) => ({ default: m.WatchPage })),
);
const NotFoundPage = lazy(() =>
  import("../pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);
const ExplorePage = lazy(() =>
  import("../pages/ExplorePage").then((m) => ({ default: m.ExplorePage })),
);

const ROUTE_COMPONENTS: Record<
  AppRouteId,
  LazyExoticComponent<ComponentType>
> = {
  home: HomePage,
  watch: WatchPage,
  planner: PlanPage,
  explore: ExplorePage,
  about: AboutPage,
  model: ModelPage,
  notFound: NotFoundPage,
};

function withPageBoundary(pageName: string, page: ReactNode) {
  return <PageErrorBoundary pageName={pageName}>{page}</PageErrorBoundary>;
}

function AppFrame() {
  const { darkMode } = useMapState();
  const { menuOpen, setMenuOpen } = useMenu();

  return (
    <div
      className={darkMode ? "app app--dark" : "app"}
      data-theme={darkMode ? "dark" : "light"}
    >
      <HashScrollHandler />
      <RouteMetadata />
      <a className="skipLink" href="#main-content">
        Skip to main content
      </a>
      <Suspense
        fallback={
          <div className="routeLoadingState" role="status">
            Loading page…
          </div>
        }
      >
        <Routes>
          {APP_ROUTE_LIST.map((route) => {
            const Page = ROUTE_COMPONENTS[route.id];
            return (
              <Route
                key={route.id}
                path={route.path}
                element={withPageBoundary(route.pageName, <Page />)}
              />
            );
          })}
        </Routes>
      </Suspense>

      <SideDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <MapStateProvider>
      <MenuProvider>
        <BrowserRouter
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <AppFrame />
        </BrowserRouter>
      </MenuProvider>
    </MapStateProvider>
  );
}
