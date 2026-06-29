import { lazy, Suspense, useState } from "react";
import { WelcomeModal } from "../../components/WelcomeModal";
import { startMapTour } from "../../tour/startMapTour";
import "../../features/models/models.css";
import { MapPageErrorBoundary } from "./MapPageErrorBoundary";
import { MapPageLayout } from "./MapPageLayout";
import { useMapPageController } from "./useMapPageController";

const InfoModal = lazy(() => import("../../components/InfoModal").then((m) => ({ default: m.InfoModal })));
const TimeseriesModal = lazy(() =>
  import("../../components/modals/TimeseriesModal").then((m) => ({ default: m.TimeseriesModal }))
);
const GridDetailModal = lazy(() =>
  import("../../components/modals/GridDetailModal").then((m) => ({ default: m.GridDetailModal }))
);

export function MapPage() {
  const [boundaryKey, setBoundaryKey] = useState(0);
  const controller = useMapPageController();
  return (
    <MapPageErrorBoundary onRetry={() => setBoundaryKey((value) => value + 1)} key={boundaryKey}>
      <>
        <MapPageLayout controller={controller} />
        <Suspense fallback={<div className="modalLoading">Loading…</div>}>
          {controller.welcomeOpen && (
            <WelcomeModal
              open={controller.welcomeOpen}
              onClose={() => controller.setWelcomeOpen(false)}
              onStartTour={() => startMapTour()}
              onLearnMore={() => {
                controller.setWelcomeOpen(false);
                controller.setInfoOpen(true);
              }}
            />
          )}
          {controller.infoOpen && (
            <InfoModal
              open={controller.infoOpen}
              onClose={() => controller.setInfoOpen(false)}
              onStartTour={() => startMapTour()}
              darkMode={controller.darkMode}
            />
          )}
          {controller.timeseriesOpen && (
            <TimeseriesModal
              open={controller.timeseriesOpen}
              onClose={() => controller.setTimeseriesOpen(false)}
              darkMode={controller.darkMode}
              currentWeek={controller.currentWeek}
              forecastPeriodLabel={controller.forecastPeriodText}
              forecastPath={controller.forecastPath}
              resolution={controller.resolution}
            />
          )}
          {controller.gridDetailOpen && (
            <GridDetailModal
              open={controller.gridDetailOpen}
              onClose={() => controller.setGridDetailOpen(false)}
              darkMode={controller.darkMode}
              cellId={controller.gridDetailCellId}
              periods={controller.periods}
              resolution={controller.gridDetailResolution}
              modelId={controller.gridDetailModelId}
              selectedWeek={controller.gridDetailSelectedWeek ?? controller.currentWeek}
              selectedWeekYear={controller.gridDetailSelectedWeekYear ?? controller.currentWeekYear}
            />
          )}
        </Suspense>
      </>
    </MapPageErrorBoundary>
  );
}
