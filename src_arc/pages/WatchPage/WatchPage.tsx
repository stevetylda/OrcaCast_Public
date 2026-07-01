import { lazy, Suspense, useState } from "react";
import { WelcomeModal } from "../../shared/components/WelcomeModal";
import { startMapTour } from "../../shared/tour/startMapTour";
import { WatchPageErrorBoundary } from "./WatchPageErrorBoundary";
import { WatchPageLayout } from "./WatchPageLayout";
import { useWatchPageController } from "./useWatchPageController";

const InfoModal = lazy(() => import("../../shared/components/InfoModal").then((m) => ({ default: m.InfoModal })));
const AnalystGridDetailModal = lazy(() =>
  import("../../features/analyst/grid-detail/AnalystGridDetailModal").then((m) => ({ default: m.AnalystGridDetailModal }))
);

export function WatchPage() {
  const [boundaryKey, setBoundaryKey] = useState(0);
  const controller = useWatchPageController();
  return (
    <WatchPageErrorBoundary onRetry={() => setBoundaryKey((value) => value + 1)} key={boundaryKey}>
      <>
        <WatchPageLayout controller={controller} />
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
          {controller.gridDetailOpen && (
            <AnalystGridDetailModal
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
    </WatchPageErrorBoundary>
  );
}
