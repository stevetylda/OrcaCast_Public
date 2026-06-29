import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SideDrawer } from "./components/SideDrawer";
import { MapPage } from "./pages/MapPage";
import { MenuProvider, useMenu } from "./state/MenuContext";
import { MapStateProvider, useMapState } from "./state/MapStateContext";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/map.css";
import "./styles/components.css";

const AboutPage = lazy(() => import("./pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const PlannerPage = lazy(() =>
  import("./pages/PlannerPage").then((m) => ({ default: m.PlannerPage }))
);

function AppFrame() {
  const { darkMode } = useMapState();
  const { menuOpen, setMenuOpen } = useMenu();

  return (
    <div className={darkMode ? "app app--dark" : "app"} data-theme={darkMode ? "dark" : "light"}>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/planner" element={<PlannerPage />} />
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
