import { Link } from "react-router-dom";
import {
  periodRange,
  selectLatestPeriod,
} from "../../shared/config/forecastPeriod";
import {
  isoWeekFromDate,
  isoWeekYearFromDate,
} from "../../shared/time/forecastPeriodToIsoWeek";
import { routePath } from "../../shared/config/routes";
import { loadHomeForecastPeriods } from "./homeData";
import { useAsyncResource } from "../../shared/data/useAsyncResource";

export function HomeForecast() {
  const resource = useAsyncResource(loadHomeForecastPeriods);
  const now = new Date();
  const current = resource.data?.find(
    (period) =>
      period.year === isoWeekYearFromDate(now) &&
      period.stat_week === isoWeekFromDate(now),
  );
  const latest =
    resource.status === "ready" ? selectLatestPeriod(resource.data) : null;
  const displayed = current ?? latest;
  const range = displayed ? periodRange(displayed) : null;
  return (
    <article className="homePulseCard homePulseCard--outlook">
      <div className="homePulseCard__header">
        <span className="homePulseCard__icon homePulseCard__icon--yellow">
          <span className="material-symbols-rounded" aria-hidden="true">
            monitoring
          </span>
        </span>
        <strong>Weekly forecast</strong>
      </div>
      <h3 className="homeForecastTitle" role="status">
        {resource.status === "loading"
          ? "Checking availability…"
          : resource.status === "error"
            ? "Availability unknown"
            : current
              ? "This week is available"
              : "This week is unavailable"}
      </h3>
      {range && (
        <p className="homeForecastDates">
          <strong>
            {current ? "Published period" : "Latest published period"}
          </strong>
          <br />
          {range.start} – {range.end}
        </p>
      )}
      <p>Southern Resident orcas · Default model</p>
      <p>
        Modeled activity varies by place. Open the map to see the published
        outlook and its limitations.
      </p>
      {resource.status === "error" && (
        <button onClick={resource.retry}>Retry forecast availability</button>
      )}
      {resource.status === "ready" && !latest && (
        <p>No published forecast periods are listed.</p>
      )}
      <Link
        to={routePath("watch")}
        className="homePulseLink homePulseLink--yellow"
      >
        {current ? "View this week’s outlook" : "Open forecast map"}{" "}
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
