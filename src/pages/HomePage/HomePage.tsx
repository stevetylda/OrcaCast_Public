import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "../../shared/components/AppHeader";
import { ReturnToTopButton } from "../../shared/components/ReturnToTopButton";
import { SiteFooter } from "../../shared/components/SiteFooter";
import { useMenu } from "../../shared/state/MenuContext";
import { useMapState } from "../../shared/state/MapStateContext";
import {
  loadTripPlannerOccurrencePayload,
  type TripPlannerHistogramBin,
} from "../../shared/data/tripPlanner";
import {
  buildHighlightedDays,
  buildSeasonalWeekBars,
  computeRelativeActivity,
  seasonalWeekIndex,
} from "../../features/seasonal-activity/seasonalActivity";
import {
  summarizeFridayHarborWeather,
  type MetNoTimeseriesEntry,
  type WeatherDaySummary,
} from "../../features/home/weather";
import "./HomePage.css";

const InfoModal = lazy(() => import("../../shared/components/InfoModal").then((m) => ({ default: m.InfoModal })));

type WeatherState =
  | { status: "loading" | "error"; week: WeatherDaySummary[] }
  | { status: "ready"; week: WeatherDaySummary[] };

type ActivityState =
  | { status: "loading" | "error"; histogram: TripPlannerHistogramBin[] }
  | { status: "ready"; histogram: TripPlannerHistogramBin[] };

const FRIDAY_HARBOR_COORDS = { lat: 48.52, lon: -123.01 } as const;
const WEATHER_API_URL = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${FRIDAY_HARBOR_COORDS.lat}&lon=${FRIDAY_HARBOR_COORDS.lon}`;

const WEEK_TICKS = [
  { index: 0, label: "Jan" },
  { index: 13, label: "Apr" },
  { index: 26, label: "Jul" },
  { index: 39, label: "Oct" },
  { index: 48, label: "Dec" },
] as const;

const FORECAST_RIBBON = [
  "Plan smarter",
  "Chase fewer maybes",
  "Find the good water",
  "Cameras + hydrophones",
  "Built for the Salish Sea",
] as const;

export function HomePage() {
  const { setMenuOpen } = useMenu();
  const { darkMode } = useMapState();
  const [infoOpen, setInfoOpen] = useState(false);
  const [activityState, setActivityState] = useState<ActivityState>({ status: "loading", histogram: [] });
  const [weatherState, setWeatherState] = useState<WeatherState>({ status: "loading", week: [] });

  useEffect(() => {
    let cancelled = false;
    loadTripPlannerOccurrencePayload("H6")
      .then((payload) => {
        if (!cancelled) setActivityState({ status: "ready", histogram: payload.histogram });
      })
      .catch(() => {
        if (!cancelled) setActivityState({ status: "error", histogram: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestedAt = new Date();

    void fetch(WEATHER_API_URL, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
        const forecast = (await response.json()) as { properties?: { timeseries?: MetNoTimeseriesEntry[] } };
        setWeatherState({
          status: "ready",
          week: summarizeFridayHarborWeather(forecast.properties?.timeseries ?? [], requestedAt),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setWeatherState({ status: "error", week: [] });
      });

    return () => controller.abort();
  }, []);

  const currentWeekIndex = useMemo(() => seasonalWeekIndex(new Date()), []);
  const currentWeekDays = useMemo(() => {
    const start = currentWeekIndex * 7 + 1;
    return buildHighlightedDays(start, Math.min(366, start + 6), false);
  }, [currentWeekIndex]);
  const weekBars = useMemo(
    () => buildSeasonalWeekBars(activityState.histogram, currentWeekDays),
    [activityState.histogram, currentWeekDays]
  );
  const typicalActivity = useMemo(
    () => computeRelativeActivity(weekBars, currentWeekIndex),
    [weekBars, currentWeekIndex]
  );
  const chartMax = Math.max(1, ...weekBars.map((week) => week.count));
  const currentWeekNumber = currentWeekIndex + 1;
  const activityLabel = typicalActivity?.label ?? (activityState.status === "error" ? "Unavailable" : "Loading");

  return (
    <div className="homePageRoot">
      <AppHeader
        title="OrcaCast"
        subtitle="Forecast Lab"
        variant="home"
        onOpenInfo={() => setInfoOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
        rightSlot={
          <nav className="homeNav" aria-label="Homepage navigation">
            <a href="#this-week">This week</a>
            <Link to="/planner">Plan a trip</Link>
            <a href="#explore">Explore</a>
          </nav>
        }
      />

      <main className="homeLanding">
        <section className="homeHero" aria-labelledby="home-hero-title">
          <div className="homeHero__copy">
            <p className="homeKicker">Your summer, forecasted</p>
            <h1 id="home-hero-title" className="homeHero__title">
              Go find <em>the magic.</em>
            </h1>
            <p className="homeHero__body">
              Pick your dates. We&apos;ll crunch the sightings, weather, and places—then point you toward one very good Salish Sea day.
            </p>
            <div className="homeHero__actions">
              <Link className="homeButton homeButton--teal" to="/planner">
                Build my trip <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
              </Link>
              <a className="homeButton homeButton--cream" href="#this-week">Peek at this week</a>
            </div>
            <ul className="homeHero__signals" aria-label="What the trip forecast considers">
              <li>01 Sightings</li>
              <li>02 Weather</li>
              <li>03 Local access</li>
            </ul>
          </div>
          <div className="homeHero__image" role="img" aria-label="An orca in the Salish Sea">
            <div className="homeHero__activityBadge">
              <span>This week</span>
              <strong>{activityLabel}</strong>
              <small>Historical activity</small>
            </div>
            <div className="homeHero__spark" aria-hidden="true">✦</div>
            <div className="homeHero__caption">
              <span>48.5° N · 123.0° W</span><span>The Salish Sea</span><span>Pacific Northwest</span>
            </div>
          </div>
          <div className="homeHero__weekBadge" aria-label={`Week ${currentWeekNumber}`}>
            <span>Week</span><strong>{currentWeekNumber}</strong>
          </div>
        </section>

        <div className="homeRibbon" aria-label="OrcaCast highlights">
          <div className="homeRibbon__track">
            {[...FORECAST_RIBBON, ...FORECAST_RIBBON].map((phrase, index) => <span key={`${phrase}-${index}`}>{phrase} <b aria-hidden="true">✦</b></span>)}
          </div>
        </div>

        <section className="homeWeek" id="this-week" aria-labelledby="weekly-pulse-title">
          <div className="homeSectionHeading">
            <p className="homeKicker">The weekly pulse</p>
            <h2 id="weekly-pulse-title">The water is giving <em>this week.</em></h2>
          </div>
          <div className="homeWeek__cards">
            <article className="homeForecastCard homeForecastCard--yellow">
              <div className="homeForecastCard__label"><span className="material-symbols-rounded" aria-hidden="true">wb_sunny</span> Weekly outlook</div>
              <p>Typical activity</p>
              <strong className="homeForecastCard__activity" role="status">{activityLabel}</strong>
              <span className="homeForecastCard__week">Week {currentWeekNumber}</span>
              <p className="homeForecastCard__description">{typicalActivity ? "Historical sightings are compared to the full seasonal record." : "Loading the historical seasonal record."}</p>
              {weatherState.status === "ready" && weatherState.week.length > 0 ? (
                <div className="homeWeatherStrip" aria-label="Friday Harbor weather forecast">
                  {weatherState.week.slice(0, 5).map((day) => <span key={day.key} title={`${day.label}: ${day.summary}`}>{day.label}<b>{day.temperatureF ?? "–"}°</b></span>)}
                </div>
              ) : <div className="homeWeatherStrip homeWeatherStrip--pending">Weather {weatherState.status === "error" ? "unavailable" : "loading"}</div>}
            </article>

            <article className="homeForecastCard homeForecastCard--chart">
              <div className="homeForecastCard__chartHeader"><div><p>Typical sightings by week</p><span>Current week highlighted</span></div><b>Week {currentWeekNumber}</b></div>
              <div className="homeSeasonChart" aria-label="Historical sightings by week">
                <div className="homeSeasonChart__bars" style={{ gridTemplateColumns: `repeat(${weekBars.length}, minmax(0, 1fr))` }}>
                  {weekBars.map((week) => <span key={week.index} className={week.highlighted ? "is-highlighted" : ""} style={{ height: `${Math.max(8, (week.count / chartMax) * 100)}%` }} title={`Week ${week.index + 1}: ${week.count.toLocaleString()} historical sightings`} />)}
                </div>
                <div className="homeSeasonChart__axis" style={{ gridTemplateColumns: `repeat(${weekBars.length}, minmax(0, 1fr))` }}>
                  {WEEK_TICKS.map((tick) => <span key={tick.label} style={{ gridColumn: `${tick.index + 1} / span 1` }}>{tick.label}</span>)}
                </div>
              </div>
            </article>

            <article className="homeForecastCard homeForecastCard--aqua">
              <div className="homeForecastCard__label"><span className="material-symbols-rounded" aria-hidden="true">location_on</span> Where to look</div>
              <h3>San Juan <em>Island</em></h3>
              <p className="homeForecastCard__description">Historically active waters with several shore-access viewpoints.</p>
              <div className="homeForecastCard__locationMeta"><span><span className="material-symbols-rounded" aria-hidden="true">park</span> 8 viewpoints</span><b>{activityLabel}</b></div>
              <Link to="/watch" className="homeTextLink">Explore the map <span aria-hidden="true">→</span></Link>
            </article>
          </div>
        </section>

        <section className="homePlannerCta" aria-labelledby="trip-title">
          <div className="homePlannerCta__copy"><p className="homeKicker">Make it a trip</p><h2 id="trip-title">Three choices.<br /><em>One great week.</em></h2><p>Give us the when and where. OrcaCast layers seasonal activity, forecast conditions, and accessible viewing places around your plan.</p><Link className="homeButton homeButton--yellow" to="/planner">Let&apos;s plan it <span className="material-symbols-rounded" aria-hidden="true">arrow_forward</span></Link></div>
          <Link to="/planner" className="homeFieldPass" aria-label="Open the trip planner">
            <div className="homeFieldPass__stub"><span>OC</span><b>Field pass</b></div>
            <div className="homeFieldPass__fields">
              <div><span className="material-symbols-rounded" aria-hidden="true">calendar_month</span><p>Your dates<b>Choose a travel window</b></p><em>01</em></div>
              <div><span className="material-symbols-rounded" aria-hidden="true">location_on</span><p>Base location<b>Start anywhere in the Salish Sea</b></p><em>02</em></div>
              <div><span className="material-symbols-rounded" aria-hidden="true">map</span><p>Travel range<b>Keep it local or roam farther</b></p><em>03</em></div>
            </div>
          </Link>
        </section>

        <section className="homeExplore" id="explore" aria-labelledby="explore-title">
          <div className="homeSectionHeading homeSectionHeading--center"><p className="homeKicker">Shore mode / couch mode</p><h2 id="explore-title">Choose your own adventure.</h2></div>
          <div className="homeExplore__cards">
            <Link className="homeExploreCard homeExploreCard--pink" to="/watch"><i>01</i><span className="material-symbols-rounded" aria-hidden="true">map</span><div><h3>Explore</h3><p>See forecast waters and places to watch.</p></div><b aria-hidden="true">→</b></Link>
            <Link className="homeExploreCard homeExploreCard--yellow" to="/watch"><i>02</i><span className="material-symbols-rounded" aria-hidden="true">photo_camera</span><div><h3>Watch</h3><p>Find cameras around the Salish Sea.</p></div><b aria-hidden="true">→</b></Link>
            <Link className="homeExploreCard homeExploreCard--aqua" to="/watch"><i>03</i><span className="material-symbols-rounded" aria-hidden="true">graphic_eq</span><div><h3>Listen</h3><p>Tune into Salish Sea hydrophones.</p></div><b aria-hidden="true">→</b></Link>
          </div>
        </section>
      </main>

      <SiteFooter tagline="Plan thoughtfully. Watch respectfully." />

      <ReturnToTopButton className="homeReturnToTop" />

      <Suspense fallback={null}>{infoOpen && <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} onStartTour={() => setInfoOpen(false)} darkMode={darkMode} />}</Suspense>
    </div>
  );
}
