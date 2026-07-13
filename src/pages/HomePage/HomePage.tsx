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

const InfoModal = lazy(() =>
  import("../../shared/components/InfoModal").then((m) => ({
    default: m.InfoModal,
  })),
);

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

const HOME_REGIONS = [
  {
    name: "San Juan Islands",
    status: "Island viewpoints",
    detail: "historically active waters",
    image: "/spot-photos/lime-kiln-point-state-park.webp",
    tone: "teal",
  },
  {
    name: "Central Salish Sea",
    status: "Flexible access",
    detail: "good shore access",
    image: "/spot-photos/generic.webp",
    tone: "teal",
  },
  {
    name: "Strait of Juan de Fuca",
    status: "Open-water views",
    detail: "wide-water viewpoints",
    image: "/spot-photos/generic.webp",
    tone: "yellow",
  },
] as const;

export function HomePage() {
  const { setMenuOpen } = useMenu();
  const { darkMode } = useMapState();
  const [infoOpen, setInfoOpen] = useState(false);
  const [activityState, setActivityState] = useState<ActivityState>({
    status: "loading",
    histogram: [],
  });
  const [weatherState, setWeatherState] = useState<WeatherState>({
    status: "loading",
    week: [],
  });

  useEffect(() => {
    let cancelled = false;
    loadTripPlannerOccurrencePayload("H6")
      .then((payload) => {
        if (!cancelled)
          setActivityState({ status: "ready", histogram: payload.histogram });
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
        if (!response.ok)
          throw new Error(`Weather request failed: ${response.status}`);
        const forecast = (await response.json()) as {
          properties?: { timeseries?: MetNoTimeseriesEntry[] };
        };
        setWeatherState({
          status: "ready",
          week: summarizeFridayHarborWeather(
            forecast.properties?.timeseries ?? [],
            requestedAt,
          ),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setWeatherState({ status: "error", week: [] });
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
    [activityState.histogram, currentWeekDays],
  );
  const typicalActivity = useMemo(
    () => computeRelativeActivity(weekBars, currentWeekIndex),
    [weekBars, currentWeekIndex],
  );
  const chartMax = Math.max(1, ...weekBars.map((week) => week.count));
  const currentWeekNumber = currentWeekIndex + 1;
  const activityLabel =
    typicalActivity?.label ??
    (activityState.status === "error" ? "Unavailable" : "Loading");
  const strongSeasonalActivity = /high/i.test(activityLabel);
  const activityCues = strongSeasonalActivity
    ? [
        { icon: "light_mode", label: "Peak season" },
        { icon: "star", label: "Top seasonal window" },
        { icon: "visibility", label: "Good for shore viewing" },
      ]
    : [
        { icon: "calendar_month", label: "Seasonal context" },
        { icon: "travel_explore", label: "Check live reports" },
        { icon: "headphones", label: "Try cameras + hydrophones" },
      ];

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
              Pick your dates. We&apos;ll crunch the sightings, weather, and
              places—then point you toward one very good Salish Sea day.
            </p>
            <div className="homeHero__actions">
              <Link className="homeButton homeButton--teal" to="/planner">
                Build my trip{" "}
                <span className="material-symbols-rounded" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
              <a className="homeButton homeButton--cream" href="#this-week">
                Peek at this week
              </a>
            </div>
          </div>
          <div
            className="homeHero__image"
            role="img"
            aria-label="An orca in the Salish Sea"
          >
            <div className="homeHero__activityBadge">
              <span>This week</span>
              <strong>{activityLabel}</strong>
              <small>Historical activity</small>
            </div>
            <div className="homeHero__spark" aria-hidden="true">
              ✦
            </div>
            <div className="homeHero__caption">
              <span>48.5° N · 123.0° W</span>
              <span>The Salish Sea</span>
              <span>Pacific Northwest</span>
            </div>
          </div>
          <div
            className="homeHero__weekBadge"
            aria-label={`Week ${currentWeekNumber}`}
          >
            <span>Week</span>
            <strong>{currentWeekNumber}</strong>
          </div>
        </section>

        <div
          className="homeRibbon"
          role="region"
          aria-label="OrcaCast highlights"
        >
          <div className="homeRibbon__track">
            {[...FORECAST_RIBBON, ...FORECAST_RIBBON].map((phrase, index) => (
              <span key={`${phrase}-${index}`}>
                {phrase} <b aria-hidden="true">✦</b>
              </span>
            ))}
          </div>
        </div>

        <section
          className="homeWeek"
          id="this-week"
          aria-labelledby="weekly-pulse-title"
        >
          <div className="homeSectionHeading">
            <p className="homeKicker">The weekly pulse</p>
            <h2 id="weekly-pulse-title">
              The water is giving <em>this week.</em>
            </h2>
            <p className="homeWeek__intro">
              A quick look at activity, seasonal context, and where to go.
            </p>
          </div>
          <div className="homePulseGrid">
            <article className="homePulseCard homePulseCard--outlook">
              <div className="homePulseCard__header">
                <span className="homePulseCard__icon homePulseCard__icon--yellow">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    monitoring
                  </span>
                </span>
                <div>
                  <strong>This week at a glance</strong>
                </div>
              </div>
              <img
                className="homePulseLighthouse"
                src="/images/home/orcacast-lighthouse-hires.png"
                alt=""
                aria-hidden="true"
              />
              <strong className="homePulseCard__activity" role="status">
                {activityLabel}
              </strong>
              <span className="homePulseCard__week">
                Week {currentWeekNumber}
              </span>
              <p className="homePulseCard__description">
                {strongSeasonalActivity
                  ? "Typical activity is near peak seasonal levels."
                  : typicalActivity
                    ? "Typical activity is compared with the full seasonal record."
                    : "Loading the historical seasonal record."}
              </p>
              <ul
                className="homeActivityCues"
                aria-label="Weekly activity cues"
              >
                {activityCues.map((cue) => (
                  <li key={cue.label}>
                    <span
                      className="material-symbols-rounded"
                      aria-hidden="true"
                    >
                      {cue.icon}
                    </span>
                    {cue.label}
                  </li>
                ))}
              </ul>
              <Link to="/watch" className="homePulseLink homePulseLink--yellow">
                See weekly outlook <span aria-hidden="true">→</span>
              </Link>
            </article>

            <article className="homePulseCard homePulseCard--trend">
              <div className="homePulseCard__chartHeader">
                <span className="homePulseCard__icon homePulseCard__icon--teal">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    equalizer
                  </span>
                </span>
                <div>
                  <strong>Seasonal context</strong>
                </div>
                <b>Week {currentWeekNumber}</b>
              </div>
              <div
                className="homeSeasonChart"
                aria-label="Historical sightings by week"
              >
                <div
                  className="homeSeasonChart__bars"
                  style={{
                    gridTemplateColumns: `repeat(${weekBars.length}, minmax(0, 1fr))`,
                  }}
                >
                  {weekBars.map((week) => (
                    <span
                      key={week.index}
                      className={week.highlighted ? "is-highlighted" : ""}
                      style={{
                        height: `${Math.max(8, (week.count / chartMax) * 100)}%`,
                      }}
                      title={`Week ${week.index + 1}: ${week.count.toLocaleString()} historical sightings`}
                    />
                  ))}
                </div>
                <div
                  className="homeSeasonChart__axis"
                  style={{
                    gridTemplateColumns: `repeat(${weekBars.length}, minmax(0, 1fr))`,
                  }}
                >
                  {WEEK_TICKS.map((tick) => (
                    <span
                      key={tick.label}
                      style={{ gridColumn: `${tick.index + 1} / span 1` }}
                    >
                      {tick.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="homePulseInsight">
                <p>
                  <span>
                    The seasonal curve shows how historical reports change
                    throughout the year.
                  </span>
                </p>
              </div>
              <Link to="/watch" className="homePulseLink homePulseLink--teal">
                Open weekly forecast <span aria-hidden="true">→</span>
              </Link>
            </article>

            <article className="homePulseCard homePulseCard--regions">
              <div className="homePulseCard__header">
                <span className="homePulseCard__icon homePulseCard__icon--teal">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    location_on
                  </span>
                </span>
                <div>
                  <strong>Featured regions</strong>
                </div>
              </div>
              <div className="homeRegionList">
                {HOME_REGIONS.map((region, index) => (
                  <Link to="/watch" className="homeRegionRow" key={region.name}>
                    <span
                      className={`homeRegionRow__rank homeRegionRow__rank--${region.tone}`}
                    >
                      {index + 1}
                    </span>
                    <img src={region.image} alt="" aria-hidden="true" />
                    <span>
                      <strong>{region.name}</strong>
                      <em>{region.status}</em>
                      <small>{region.detail}</small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
              <Link to="/watch" className="homePulseLink homePulseLink--teal">
                Browse all forecast areas <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>

          <div className="homeConditionsStrip">
            <div className="homeConditionsStrip__title">
              <span className="material-symbols-rounded" aria-hidden="true">
                partly_cloudy_day
              </span>
              <strong>Viewing conditions</strong>
            </div>
            {weatherState.status === "ready" ? (
              <div className="homeConditionsStrip__days">
                {weatherState.week.slice(0, 3).map((day) => (
                  <span key={day.key}>
                    <span
                      className="material-symbols-rounded"
                      aria-hidden="true"
                    >
                      {day.icon}
                    </span>
                    <b>{day.label}</b>
                    {day.summary}
                    {day.temperatureF != null ? ` · ${day.temperatureF}°` : ""}
                  </span>
                ))}
              </div>
            ) : (
              <span className="homeConditionsStrip__status">
                Weather{" "}
                {weatherState.status === "error" ? "unavailable" : "loading"}
              </span>
            )}
            <Link to="/planner">
              See detailed conditions <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section className="homePlannerCta" aria-labelledby="trip-title">
          <div className="homePlannerCta__copy">
            <p className="homeKicker">Make it a trip</p>
            <h2 id="trip-title">
              Three choices.
              <br />
              <em>One great week.</em>
            </h2>
            <p>
              Give us the when and where. OrcaCast layers seasonal activity,
              forecast conditions, and accessible viewing places around your
              plan.
            </p>
            <Link className="homeButton homeButton--yellow" to="/planner">
              Let&apos;s plan it{" "}
              <span className="material-symbols-rounded" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>
          <Link
            to="/planner"
            className="homeFieldPass"
            aria-label="Open the trip planner"
          >
            <div className="homeFieldPass__stub">
              <span>OC</span>
              <b>Field pass</b>
            </div>
            <div className="homeFieldPass__fields">
              <div>
                <span className="material-symbols-rounded" aria-hidden="true">
                  calendar_month
                </span>
                <p>
                  Your dates<b>Choose a travel window</b>
                </p>
                <em>01</em>
              </div>
              <div>
                <span className="material-symbols-rounded" aria-hidden="true">
                  location_on
                </span>
                <p>
                  Base location<b>Start anywhere in the Salish Sea</b>
                </p>
                <em>02</em>
              </div>
              <div>
                <span className="material-symbols-rounded" aria-hidden="true">
                  map
                </span>
                <p>
                  Travel range<b>Keep it local or roam farther</b>
                </p>
                <em>03</em>
              </div>
            </div>
          </Link>
        </section>

        <section
          className="homeExplore"
          id="explore"
          aria-labelledby="explore-title"
        >
          <div className="homeSectionHeading homeSectionHeading--center">
            <p className="homeKicker">Shore mode / couch mode</p>
            <h2 id="explore-title">Choose your own adventure.</h2>
          </div>
          <div className="homeExplore__cards">
            <Link className="homeExploreCard homeExploreCard--pink" to="/watch">
              <span className="homeExploreCard__icon" aria-hidden="true">
                <span className="material-symbols-rounded">map</span>
              </span>
              <div>
                <h3>Explore</h3>
                <p>See waters and places.</p>
              </div>
              <b aria-hidden="true">→</b>
            </Link>
            <Link
              className="homeExploreCard homeExploreCard--yellow"
              to="/watch"
            >
              <span className="homeExploreCard__icon" aria-hidden="true">
                <span className="material-symbols-rounded">photo_camera</span>
              </span>
              <div>
                <h3>Watch</h3>
                <p>View live cameras.</p>
              </div>
              <b aria-hidden="true">→</b>
            </Link>
            <a
              className="homeExploreCard homeExploreCard--aqua"
              href="https://live.orcasound.net/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Listen live on Orcasound (opens in a new tab)"
            >
              <span className="homeExploreCard__icon" aria-hidden="true">
                <span className="material-symbols-rounded">graphic_eq</span>
              </span>
              <div>
                <h3>Listen</h3>
                <p>Tune into the Salish Sea.</p>
              </div>
              <b aria-hidden="true">→</b>
            </a>
          </div>
        </section>
      </main>

      <SiteFooter
        tagline="Plan thoughtfully. Watch respectfully."
        links={[
          { label: "About", to: "/about" },
          {
            label: "Contribute",
            to: "https://github.com/stevetylda/OrcaCast_Public",
            external: true,
            newTab: true,
            icon: "github",
            emphasis: true,
            ariaLabel: "Contribute to OrcaCast on GitHub (opens in a new tab)",
          },
        ]}
      />

      <ReturnToTopButton className="homeReturnToTop" />

      <Suspense fallback={null}>
        {infoOpen && (
          <InfoModal
            open={infoOpen}
            onClose={() => setInfoOpen(false)}
            onStartTour={() => setInfoOpen(false)}
            darkMode={darkMode}
          />
        )}
      </Suspense>
    </div>
  );
}
