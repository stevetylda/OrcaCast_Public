import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SideDrawer } from "../shared/components/SideDrawer";
import { PageErrorBoundary } from "../shared/components/PageErrorBoundary";
import { MenuProvider, useMenu } from "../shared/state/MenuContext";
import { MapStateProvider, useMapState } from "../shared/state/MapStateContext";
import "../shared/styles/base.css";
import "../shared/styles/layout.css";
import "../shared/styles/map.css";
import "../shared/styles/components.css";

const AboutPage = lazy(() => import("../pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const ModelPage = lazy(() => import("../pages/ModelPage").then((m) => ({ default: m.ModelPage })));
const PlanPage = lazy(() => import("../pages/PlanPage").then((m) => ({ default: m.PlanPage })));
const HomePage = lazy(() => import("../pages/HomePage").then((m) => ({ default: m.HomePage })));
const WatchPage = lazy(() => import("../pages/WatchPage").then((m) => ({ default: m.WatchPage })));

function withPageBoundary(pageName: string, page: ReactNode) {
  return <PageErrorBoundary pageName={pageName}>{page}</PageErrorBoundary>;
}

function AppFrame() {
  const { darkMode } = useMapState();
  const { menuOpen, setMenuOpen } = useMenu();

  return (
    <div className={darkMode ? "app app--dark" : "app"} data-theme={darkMode ? "dark" : "light"}>
      <Suspense fallback={<div className="routeLoadingState" role="status">Loading page…</div>}>
        <Routes>
          <Route path="/" element={withPageBoundary("Home", <HomePage />)} />
          <Route path="/watch" element={withPageBoundary("Watch", <WatchPage />)} />
          <Route path="/planner" element={withPageBoundary("Planner", <PlanPage />)} />
          <Route path="/about" element={withPageBoundary("About", <AboutPage />)} />
          <Route path="/about/model" element={withPageBoundary("Model", <ModelPage />)} />
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
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppFrame />
        </BrowserRouter>
      </MenuProvider>
    </MapStateProvider>
  );
}
