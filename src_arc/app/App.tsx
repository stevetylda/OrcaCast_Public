import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SideDrawer } from "../shared/components/SideDrawer";
import { WatchPage } from "../pages/WatchPage";
import { MenuProvider, useMenu } from "../shared/state/MenuContext";
import { MapStateProvider, useMapState } from "../shared/state/MapStateContext";
import "../shared/styles/base.css";
import "../shared/styles/layout.css";
import "../shared/styles/map.css";
import "../shared/styles/components.css";

const AboutPage = lazy(() => import("../pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const PlanPage = lazy(() => import("../pages/PlanPage").then((m) => ({ default: m.PlanPage })));

function AppFrame() {
  const { darkMode } = useMapState();
  const { menuOpen, setMenuOpen } = useMenu();

  return (
    <div className={darkMode ? "app app--dark" : "app"} data-theme={darkMode ? "dark" : "light"}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<WatchPage />} />
          <Route path="/planner" element={<PlanPage />} />
          <Route path="/about" element={<AboutPage />} />
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
