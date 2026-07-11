import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "../../shared/components/AppHeader";
import { appConfig } from "../../shared/config/appConfig";
import {
  getCachedDataMeta,
  loadDataMeta,
  type DataMeta,
} from "../../shared/data/meta";
import { useMapState } from "../../shared/state/MapStateContext";
import { useMenu } from "../../shared/state/MenuContext";
import "../AboutPage/AboutPage.css";
import "./ModelPage.css";

const InfoModal = lazy(() =>
  import("../../shared/components/InfoModal").then((module) => ({
    default: module.InfoModal,
  })),
);

type StageStatus = "current" | "integrating" | "planner";
type StageSide = "left" | "right" | "center";
type StageTone = "yellow" | "coral" | "pink" | "teal" | "cobalt";

type ModelStage = {
  number: string;
  title: string;
  prompt: string;
  copy: string;
  icon: string;
  tone: StageTone;
  side: StageSide;
  status: StageStatus;
  details: readonly string[];
};

const statusLabels: Record<StageStatus, string> = {
  current: "In the current forecast",
  integrating: "Being integrated",
  planner: "Personalization layer",
};

const modelStages: readonly ModelStage[] = [
  {
    number: "01",
    title: "Seasonal history",
    prompt: "What usually happens here at this time of year?",
    copy: "OrcaCast begins with long-term spatial and seasonal patterns instead of treating every week and every part of the Salish Sea as identical.",
    icon: "calendar_month",
    tone: "yellow",
    side: "left",
    status: "current",
    details: [
      "Week-of-year patterns",
      "Historical hotspots",
      "Ecotype-specific context",
    ],
  },
  {
    number: "02",
    title: "Recent activity",
    prompt: "What has been happening nearby lately?",
    copy: "Recent reports and neighboring activity help the forecast respond to short-term persistence and movement rather than relying only on the long-run average.",
    icon: "timeline",
    tone: "coral",
    side: "right",
    status: "current",
    details: [
      "Recent sightings",
      "Nearby-grid activity",
      "Short-term persistence",
    ],
  },
  {
    number: "03",
    title: "Observer effort",
    prompt: "Where are people able and likely to notice?",
    copy: "A sighting map is partly a map of people. Effort layers help distinguish biological signal from ferries, daylight, access, population, and reporting habits.",
    icon: "visibility",
    tone: "pink",
    side: "left",
    status: "integrating",
    details: [
      "Daylight",
      "Shore and ferry access",
      "Population and reporting bias",
    ],
  },
  {
    number: "04",
    title: "Geography and spatial context",
    prompt: "How does this place relate to the water around it?",
    copy: "Channels, islands, neighboring cells, and recurring corridors create spatial structure. OrcaCast learns from that structure instead of reading each grid cell in isolation.",
    icon: "map",
    tone: "teal",
    side: "right",
    status: "current",
    details: [
      "H3 neighborhoods",
      "Passages and corridors",
      "Local spatial history",
    ],
  },
  {
    number: "05",
    title: "Prey proxies",
    prompt: "When might food conditions support activity?",
    copy: "Direct prey observations are limited, so OrcaCast can use carefully labeled ecological proxies such as salmon timing, river signals, and seasonal availability.",
    icon: "set_meal",
    tone: "yellow",
    side: "left",
    status: "integrating",
    details: ["Salmon timing", "River and runoff signals", "Proxy uncertainty"],
  },
  {
    number: "06",
    title: "Environmental proxies",
    prompt: "What are the ocean and atmosphere doing?",
    copy: "Wind, visibility, cloud, precipitation, and future sea-state signals can affect animal activity, detection, and whether a forecast is useful to a person in the field.",
    icon: "partly_cloudy_day",
    tone: "cobalt",
    side: "right",
    status: "integrating",
    details: [
      "Wind and visibility",
      "Cloud and precipitation",
      "Daily viewing conditions",
    ],
  },
  {
    number: "07",
    title: "Agreement and uncertainty",
    prompt: "How strongly do the signals agree?",
    copy: "OrcaCast should not hide uncertainty behind a sharp-looking score. Sparse data, conflicting signals, and model disagreement become part of the outlook.",
    icon: "query_stats",
    tone: "pink",
    side: "left",
    status: "integrating",
    details: ["Confidence language", "Sparse-data warnings", "Model agreement"],
  },
  {
    number: "08",
    title: "Activity outlook",
    prompt: "Where and when does activity look relatively more likely?",
    copy: "The forecast combines the available signals into a relative activity surface. It ranks possibilities across dates and places, but it never promises an encounter.",
    icon: "analytics",
    tone: "teal",
    side: "right",
    status: "current",
    details: ["Relative activity", "Likely time windows", "Ecotype outlooks"],
  },
  {
    number: "09",
    title: "Viewing opportunity",
    prompt: "Could a person realistically experience it from here?",
    copy: "Forecast activity is combined with visibility, distance, terrain, weather, and access so a biologically promising cell can become a practical viewing-place recommendation.",
    icon: "landscape",
    tone: "cobalt",
    side: "left",
    status: "integrating",
    details: [
      "Viewshed and distance",
      "Weather and daylight",
      "Shore, ferry, camera, or audio",
    ],
  },
  {
    number: "10",
    title: "You",
    prompt: "What kind of Salish Sea day are you trying to plan?",
    copy: "Your dates, starting point, travel tolerance, accessibility needs, and preferred experience personalize the recommendation. They do not predict the whales.",
    icon: "person_pin_circle",
    tone: "coral",
    side: "center",
    status: "planner",
    details: ["Your dates", "Your starting point", "Your preferred experience"],
  },
] as const;

const stageSpacing = 280;
const ropeWidth = 300;
const ropeCenter = ropeWidth / 2;
const ropeX = [150, 74, 226, 74, 226, 74, 226, 74, 226, 150] as const;

function buildRopePath(
  points: readonly (readonly [number, number])[],
  height: number,
) {
  let previousX = ropeCenter;
  let previousY = 0;
  let path = `M ${ropeCenter} 0`;

  points.forEach(([x, y]) => {
    const midpointY = (previousY + y) / 2;
    path += ` C ${previousX} ${midpointY}, ${x} ${midpointY}, ${x} ${y}`;
    previousX = x;
    previousY = y;
  });

  const finalMidpoint = (previousY + height) / 2;
  path += ` C ${previousX} ${finalMidpoint}, ${ropeCenter} ${finalMidpoint}, ${ropeCenter} ${height}`;
  return path;
}

export function ModelPage() {
  const { setMenuOpen } = useMenu();
  const { darkMode } = useMapState();
  const [infoOpen, setInfoOpen] = useState(false);
  const [dataMeta, setDataMeta] = useState<DataMeta | null>(() =>
    getCachedDataMeta(),
  );

  useEffect(() => {
    let active = true;
    loadDataMeta()
      .then((meta) => {
        if (active) setDataMeta(meta);
      })
      .catch(() => {
        if (active) setDataMeta(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const ropeHeight = modelStages.length * stageSpacing;
  const ropePath = useMemo(
    () =>
      buildRopePath(
        modelStages.map(
          (_, index) =>
            [ropeX[index], index * stageSpacing + stageSpacing / 2] as const,
        ),
        ropeHeight,
      ),
    [ropeHeight],
  );

  return (
    <div className="aboutGuidePage modelStoryPage" id="model-top">
      <AppHeader
        title="OrcaCast"
        subtitle="Forecast Lab"
        variant="home"
        onOpenInfo={() => setInfoOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
        rightSlot={
          <nav className="aboutGuideNav" aria-label="Model page navigation">
            <Link to="/about">About</Link>
            <a href="#model-journey">Model layers</a>
            <Link to="/planner">Plan a trip</Link>
          </nav>
        }
      />

      <main className="modelStoryMain">
        <section className="modelStoryHero" aria-labelledby="model-story-title">
          <div className="modelStoryHero__copy">
            <p className="aboutGuideKicker">Inside the forecast</p>
            <h1 id="model-story-title">
              From ocean signals to <em>your Salish Sea day.</em>
            </h1>
            <p className="modelStoryHero__lead">
              OrcaCast builds an outlook in layers. Follow the rope to see what
              shapes the forecast, what corrects for human observation, and how
              the final result becomes useful to you.
            </p>
            <div className="modelStoryHero__actions">
              <a
                className="aboutGuideButton aboutGuideButton--teal"
                href="#model-journey"
              >
                Follow the model{" "}
                <span className="material-symbols-rounded" aria-hidden="true">
                  south
                </span>
              </a>
              <Link
                className="aboutGuideButton aboutGuideButton--cream"
                to="/about"
              >
                Back to about{" "}
                <span className="material-symbols-rounded" aria-hidden="true">
                  arrow_back
                </span>
              </Link>
            </div>
          </div>

          <div
            className="modelStoryHero__visual"
            aria-label="Illustration of data layers becoming a forecast and trip plan"
          >
            <div className="modelStoryHero__rope" aria-hidden="true" />
            <div className="modelStoryHero__layer modelStoryHero__layer--history">
              <span className="material-symbols-rounded" aria-hidden="true">
                calendar_month
              </span>
              <strong>History</strong>
              <small>Season and place</small>
            </div>
            <div className="modelStoryHero__layer modelStoryHero__layer--effort">
              <span className="material-symbols-rounded" aria-hidden="true">
                visibility
              </span>
              <strong>Effort</strong>
              <small>Who could observe?</small>
            </div>
            <div className="modelStoryHero__layer modelStoryHero__layer--environment">
              <span className="material-symbols-rounded" aria-hidden="true">
                partly_cloudy_day
              </span>
              <strong>Conditions</strong>
              <small>Ocean and weather</small>
            </div>
            <div className="modelStoryHero__output">
              <span className="material-symbols-rounded" aria-hidden="true">
                route
              </span>
              <div>
                <small>Forecast + your context</small>
                <strong>A practical field plan</strong>
              </div>
            </div>
            <span className="modelStoryHero__stamp" aria-hidden="true">
              Built in layers
            </span>
          </div>
        </section>

        <section
          className="modelStorySplit"
          aria-labelledby="model-split-title"
        >
          <div className="modelStorySplit__heading">
            <p className="aboutGuideKicker">One important distinction</p>
            <h2 id="model-split-title">
              The whales are forecast. Your day is recommended.
            </h2>
          </div>
          <div className="modelStorySplit__cards">
            <article>
              <span
                className="modelStorySplit__icon modelStorySplit__icon--teal material-symbols-rounded"
                aria-hidden="true"
              >
                analytics
              </span>
              <div>
                <small>Forecast model</small>
                <h3>Estimates relative activity</h3>
                <p>
                  Ecological, spatial, historical, and observation signals shape
                  the orca activity outlook.
                </p>
              </div>
            </article>
            <span className="modelStorySplit__plus" aria-hidden="true">
              +
            </span>
            <article>
              <span
                className="modelStorySplit__icon modelStorySplit__icon--yellow material-symbols-rounded"
                aria-hidden="true"
              >
                person_pin_circle
              </span>
              <div>
                <small>Recommendation layer</small>
                <h3>Fits the outlook to you</h3>
                <p>
                  Your dates and constraints help rank practical places and
                  experiences. They never predict animal behavior.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section
          className="modelStoryJourney"
          id="model-journey"
          aria-labelledby="model-journey-title"
        >
          <div className="modelStoryJourney__heading">
            <p className="aboutGuideKicker">The layers behind the outlook</p>
            <h2 id="model-journey-title">Follow the rope.</h2>
            <p>
              OrcaCast is evolving. The status tag on each stop separates what
              is already active from signals being integrated into the forecast
              and planner.
            </p>
            <div
              className="modelStoryLegend"
              aria-label="Model layer status legend"
            >
              <span>
                <i className="modelStoryLegend__dot modelStoryLegend__dot--current" />
                In the current forecast
              </span>
              <span>
                <i className="modelStoryLegend__dot modelStoryLegend__dot--integrating" />
                Being integrated
              </span>
              <span>
                <i className="modelStoryLegend__dot modelStoryLegend__dot--planner" />
                Personalization layer
              </span>
            </div>
          </div>

          <div
            className="modelStoryJourney__body"
            style={{ "--rope-height": `${ropeHeight}px` } as CSSProperties}
          >
            <svg
              className="modelStoryRope"
              viewBox={`0 0 ${ropeWidth} ${ropeHeight}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path className="modelStoryRope__outline" d={ropePath} />
              <path className="modelStoryRope__body" d={ropePath} />
              <path className="modelStoryRope__twist" d={ropePath} />
            </svg>

            {modelStages.map((stage, index) => {
              const markerShift = (ropeX[index] ?? ropeCenter) - ropeCenter;
              return (
                <article
                  key={stage.number}
                  id={`model-layer-${stage.number}`}
                  className={`modelStoryStage modelStoryStage--${stage.side} modelStoryStage--${stage.tone}`}
                  style={
                    { "--marker-shift": `${markerShift}px` } as CSSProperties
                  }
                >
                  <div className="modelStoryStage__card">
                    <div className="modelStoryStage__topline">
                      <span
                        className={`modelStoryStatus modelStoryStatus--${stage.status}`}
                      >
                        {statusLabels[stage.status]}
                      </span>
                      <span className="modelStoryStage__number">
                        Layer {stage.number}
                      </span>
                    </div>
                    <div className="modelStoryStage__titleRow">
                      <span
                        className="modelStoryStage__icon material-symbols-rounded"
                        aria-hidden="true"
                      >
                        {stage.icon}
                      </span>
                      <div>
                        <h3>{stage.title}</h3>
                        <p className="modelStoryStage__prompt">
                          {stage.prompt}
                        </p>
                      </div>
                    </div>
                    <p className="modelStoryStage__copy">{stage.copy}</p>
                    <ul>
                      {stage.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="modelStoryStage__knot" aria-hidden="true">
                    <span>{stage.number}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section
          className="modelStoryResult"
          aria-labelledby="model-result-title"
        >
          <div className="modelStoryResult__copy">
            <p className="aboutGuideKicker">What comes out the other end</p>
            <h2 id="model-result-title">
              A useful outlook, not an orca appointment.
            </h2>
            <p>
              The goal is not a magical certainty score. It is a transparent
              recommendation that helps you compare dates, understand
              confidence, choose a practical place, and keep a good backup plan.
            </p>
            <div className="modelStoryResult__actions">
              <Link
                className="aboutGuideButton aboutGuideButton--teal"
                to="/planner"
              >
                Use the trip planner{" "}
                <span className="material-symbols-rounded" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
              <Link
                className="aboutGuideButton aboutGuideButton--cream"
                to="/watch"
              >
                Explore this week{" "}
                <span className="material-symbols-rounded" aria-hidden="true">
                  map_search
                </span>
              </Link>
            </div>
          </div>

          <div
            className="modelStoryResult__ticket"
            aria-label="Example personalized OrcaCast output"
          >
            <div className="modelStoryResult__ticketHeader">
              <span>OrcaCast field plan</span>
              <strong>Saturday</strong>
            </div>
            <dl>
              <div>
                <dt>Activity outlook</dt>
                <dd>High</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>Moderate</dd>
              </div>
              <div>
                <dt>Best fit</dt>
                <dd>West-facing shore</dd>
              </div>
              <div>
                <dt>Backup</dt>
                <dd>Hydrophone session</dd>
              </div>
            </dl>
            <p>Conditions are promising, wildlife remains unpredictable.</p>
            <span className="modelStoryResult__ticketStamp" aria-hidden="true">
              For you
            </span>
          </div>
        </section>

        <section
          className="modelStoryTechnical"
          aria-labelledby="model-technical-title"
        >
          <div>
            <p className="aboutGuideKicker">Technical footprint</p>
            <h2 id="model-technical-title">Versioned and inspectable.</h2>
          </div>
          <div className="modelStoryTechnical__grid">
            <article>
              <span>Model</span>
              <strong>{appConfig.compositeModelLabel}</strong>
              <small>{appConfig.compositeModelId}</small>
            </article>
            <article>
              <span>Version</span>
              <strong>{appConfig.modelVersion}</strong>
              <small>Forecast Lab</small>
            </article>
            <article>
              <span>Data</span>
              <strong>{dataMeta?.data_version ?? "Loading metadata"}</strong>
              <small>
                {dataMeta?.generated_at
                  ? `Generated ${dataMeta.generated_at}`
                  : "Versioned forecast inputs"}
              </small>
            </article>
          </div>
        </section>
      </main>

      <footer className="aboutGuideFooter">
        <strong>OrcaCast</strong>
        <nav aria-label="Model page footer navigation">
          <Link to="/about">About</Link>
          <a href="#model-journey">Model layers</a>
          <Link to="/planner">Plan a trip</Link>
          <Link to="/watch">This week</Link>
        </nav>
        <span>Signals in. Context out.</span>
      </footer>

      <Suspense fallback={null}>
        {infoOpen ? (
          <InfoModal
            open={infoOpen}
            onClose={() => setInfoOpen(false)}
            onStartTour={() => setInfoOpen(false)}
            darkMode={darkMode}
          />
        ) : null}
      </Suspense>
    </div>
  );
}
