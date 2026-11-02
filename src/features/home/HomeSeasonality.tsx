import {
  buildSeasonalWeekBars,
  computeRelativeActivity,
  seasonalWeekIndex,
  buildHighlightedDays,
} from "../seasonal-activity/seasonalActivity";
import { loadHomeSeasonality } from "./homeData";
import { useAsyncResource } from "../../shared/data/useAsyncResource";

export function HomeSeasonality() {
  const resource = useAsyncResource(loadHomeSeasonality);
  const current = seasonalWeekIndex(new Date());
  const bars =
    resource.status === "ready"
      ? buildSeasonalWeekBars(
          resource.data.histogram,
          buildHighlightedDays(
            current * 7 + 1,
            Math.min(366, current * 7 + 7),
            false,
          ),
        )
      : [];
  const activity = computeRelativeActivity(bars, current);
  const max = Math.max(1, ...bars.map((bar) => bar.count));
  return (
    <article className="homePulseCard homePulseCard--trend">
      <div className="homePulseCard__chartHeader">
        <span className="homePulseCard__icon homePulseCard__icon--teal">
          <span className="material-symbols-rounded" aria-hidden="true">
            equalizer
          </span>
        </span>
        <strong>Historical seasonality</strong>
      </div>
      {resource.status !== "ready" ? (
        <p role="status">
          {resource.status === "loading"
            ? "Loading seasonal reports…"
            : "Seasonal reports unavailable."}{" "}
          {resource.status === "error" && (
            <button onClick={resource.retry}>Retry seasonal reports</button>
          )}
        </p>
      ) : !activity ? (
        <p>No seasonal reports are available in this record.</p>
      ) : (
        <>
          <p className="homeSeasonSummary">
            <strong>{activity.label}</strong> report frequency for this time of
            year, relative to other weeks.
          </p>
          <div
            className="homeSeasonChart"
            role="img"
            aria-label={`Historical reports throughout the year. This time of year has ${activity.label.toLowerCase()} report frequency. Exact counts are available below.`}
          >
            <div
              className="homeSeasonChart__bars"
              style={{
                gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))`,
              }}
            >
              {bars.map((bar) => (
                <span
                  key={bar.index}
                  className={bar.highlighted ? "is-highlighted" : ""}
                  style={{
                    height: `${(bar.count / max) * 100}%`,
                    minHeight: 0,
                    visibility: bar.count === 0 ? "hidden" : undefined,
                  }}
                />
              ))}
            </div>
            <div className="homeSeasonChart__axis" aria-hidden="true">
              <span>Jan</span>
              <span>Apr</span>
              <span>Jul</span>
              <span>Oct</span>
              <span>Dec</span>
            </div>
          </div>
          <p className="homeSourceNote">
            {resource.data.year_min}–{resource.data.year_max} · Historical
            sighting reports. Reporting effort varies; this is not a sighting
            probability or a current forecast.
          </p>
          <details className="homeSeasonData">
            <summary>View seasonal report counts</summary>
            <p>
              Source: {resource.data.source}. Seven-day seasonal bins from
              January 1; the last bin is shorter. Highlighted bar: current time
              of year.
            </p>
            <table>
              <caption>Historical reports by seasonal bin</caption>
              <thead>
                <tr>
                  <th scope="col">Days of year</th>
                  <th scope="col">Reports</th>
                </tr>
              </thead>
              <tbody>
                {bars.map((bar) => (
                  <tr key={bar.index}>
                    <th scope="row">
                      {bar.index * 7 + 1}–{Math.min(366, bar.index * 7 + 7)}
                    </th>
                    <td>{bar.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </article>
  );
}
