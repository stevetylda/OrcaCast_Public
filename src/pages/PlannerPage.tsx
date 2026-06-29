import { PageShell } from "../components/PageShell";

export function PlannerPage() {
  return (
    <PageShell title="Planner" showBottomRail={false}>
      <section className="plannerPage">
        <div className="plannerPage__eyebrow">Notional Page</div>
        <h1 className="plannerPage__title">Planner</h1>
        <p className="plannerPage__body">
          This page is reserved for future trip-planning workflows. The public app currently exposes
          it as a placeholder alongside Map and About.
        </p>
      </section>
    </PageShell>
  );
}
