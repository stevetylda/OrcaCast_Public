import { loadHomeWeather } from "./homeData";
import { useAsyncResource } from "../../shared/data/useAsyncResource";

export function HomeWeather() {
  const weather = useAsyncResource(loadHomeWeather);
  return (
    <aside className="homeConditionsStrip" aria-label="Friday Harbor weather">
      <div className="homeConditionsStrip__title">
        <span className="material-symbols-rounded" aria-hidden="true">
          partly_cloudy_day
        </span>
        <div>
          <strong>Friday Harbor weather</strong>
          <small>Next 3 days · highs in °F</small>
        </div>
      </div>
      {weather.status === "ready" ? (
        <div className="homeConditionsStrip__days">
          {weather.data.map((day) => (
            <span key={day.key}>
              <b>{day.label}</b> {day.summary}
              {day.temperatureF !== null ? ` · ${day.temperatureF}°F` : ""}
            </span>
          ))}
        </div>
      ) : (
        <p role="status">
          {weather.status === "loading"
            ? "Loading weather…"
            : "Weather unavailable."}{" "}
          {weather.status === "error" && (
            <button onClick={weather.retry}>Retry weather</button>
          )}
        </p>
      )}
      <a href="https://www.met.no/en" target="_blank" rel="noopener noreferrer">
        Weather source: MET Norway{" "}
        <span className="visuallyHidden">(opens in a new tab)</span> ↗
      </a>
    </aside>
  );
}
