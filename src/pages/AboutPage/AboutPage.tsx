import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "../../shared/components/AppHeader";
import { ReturnToTopButton } from "../../shared/components/ReturnToTopButton";
import { SiteFooter } from "../../shared/components/SiteFooter";
import { appConfig } from "../../shared/config/appConfig";
import {
  getCachedDataMeta,
  loadDataMeta,
  type DataMeta,
} from "../../shared/data/meta";
import { useMapState } from "../../shared/state/MapStateContext";
import { useMenu } from "../../shared/state/MenuContext";
import "./AboutPage.css";

const InfoModal = lazy(() =>
  import("../../shared/components/InfoModal").then((module) => ({
    default: module.InfoModal,
  })),
);

const responsibleViewingLinks = [
  {
    label: "WDFW guidance",
    href: "https://wdfw.wa.gov/species-habitats/at-risk/species-recovery/orca/regulations",
  },
  {
    label: "NOAA whale watching",
    href: "https://www.fisheries.noaa.gov/west-coast/marine-mammal-protection/safe-whale-watching-west-coast-be-whale-wise",
  },
  {
    label: "Be Whale Wise",
    href: "https://www.bewhalewise.org/",
  },
] as const;

const signals = [
  {
    icon: "travel_explore",
    title: "Sightings",
    copy: "Where and when activity has historically been reported.",
    tone: "teal",
  },
  {
    icon: "partly_cloudy_day",
    title: "Weather",
    copy: "Whether conditions may support a comfortable viewing day.",
    tone: "pink",
  },
  {
    icon: "signpost",
    title: "Local access",
    copy: "Ferries, parks, marinas, shore locations, cameras, and hydrophones.",
    tone: "yellow",
  },
] as const;

const workflow = [
  {
    number: "01",
    icon: "database",
    title: "Gather",
    copy: "Historical sightings, seasonal patterns, weather forecasts, and locations.",
  },
  {
    number: "02",
    icon: "compare_arrows",
    title: "Compare",
    copy: "Your dates and starting point are compared with historical and forecast conditions.",
  },
  {
    number: "03",
    icon: "analytics",
    title: "Score",
    copy: "OrcaCast estimates relative activity and ranks nearby viewing places.",
  },
  {
    number: "04",
    icon: "map",
    title: "Explore",
    copy: "You get a trip window, map, field picks, and other ways to experience the sea.",
  },
] as const;

const canDo = [
  "Compare dates and starting locations",
  "Understand seasonal activity",
  "Find nearby viewing locations",
  "Combine map, weather, and access information",
  "Discover cameras and hydrophones",
  "Plan a more informed Salish Sea trip",
] as const;

const cannotDo = [
  "Guarantee a sighting",
  "Track individual whales in real time",
  "Replace official marine forecasts",
  "Override closures or safety guidance",
  "Tell anyone to approach wildlife",
] as const;

const viewingPrinciples = [
  {
    icon: "visibility",
    title: "Keep your distance",
    copy: "Observe from legal and respectful distances.",
  },
  {
    icon: "directions_boat",
    title: "Never pursue",
    copy: "Do not chase, crowd, feed, or intercept wildlife.",
  },
  {
    icon: "landscape",
    title: "Start from shore",
    copy: "Prefer shore-based viewing whenever possible.",
  },
  {
    icon: "rule",
    title: "Follow current guidance",
    copy: "Check vessel, park, and regional rules before going.",
  },
  {
    icon: "graphic_eq",
    title: "Use remote options",
    copy: "Try cameras and hydrophones when in-person viewing is not appropriate.",
  },
] as const;

const methodologySignals = [
  {
    icon: "travel_explore",
    title: "Historical sightings",
    copy: "Reported activity is summarized into spatial and seasonal patterns.",
    cadence: "Updated with new data",
  },
  {
    icon: "calendar_month",
    title: "Seasonal patterns",
    copy: "Long-term trends show how activity changes through the year.",
    cadence: "Seasonal context",
  },
  {
    icon: "foggy",
    title: "Weather & visibility",
    copy: "Forecast conditions help distinguish promising from uncomfortable days.",
    cadence: "Forecast updates",
  },
  {
    icon: "location_on",
    title: "Viewing locations",
    copy: "Parks, marinas, ferry terminals, cameras, and other access points.",
    cadence: "Curated regularly",
  },
] as const;

const regionLabels = [
  "Puget Sound",
  "San Juan Islands",
  "Strait of Juan de Fuca",
  "Southern Strait of Georgia",
  "Vancouver Island",
] as const;

export function AboutPage() {
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

  return (
    <div className="aboutGuidePage" id="about-top">
      <AppHeader
        title="OrcaCast"
        subtitle="Forecast Lab"
        variant="home"
        onOpenInfo={() => setInfoOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
        rightSlot={
          <nav className="aboutGuideNav" aria-label="About page navigation">
            <a href="/#this-week">This week</a>
            <Link to="/planner">Plan a trip</Link>
            <Link to="/explore">Explore</Link>
          </nav>
        }
      />

      <main className="aboutGuideMain">
        <section className="aboutGuideHero" aria-labelledby="about-guide-title">
          <div className="aboutGuideHero__copy">
            <p className="aboutGuideKicker">About OrcaCast</p>
            <h1 id="about-guide-title">
              A field guide for <em>choosing your Salish Sea day.</em>
            </h1>
            <p className="aboutGuideLead">
              OrcaCast combines historical sightings, seasonal patterns,
              weather, and local access to help people plan more informed trips
              around the Salish Sea.
            </p>
          </div>

          <div
            className="aboutGuideDesk"
            role="img"
            aria-label="An illustrated OrcaCast forecast desk"
          >
            <div className="aboutGuideDesk__map" aria-hidden="true">
              <span className="material-symbols-rounded">map</span>
              <i className="aboutGuideDesk__marker aboutGuideDesk__marker--one" />
              <i className="aboutGuideDesk__marker aboutGuideDesk__marker--two" />
              <i className="aboutGuideDesk__marker aboutGuideDesk__marker--three" />
            </div>
            <div className="aboutGuideDesk__binoculars" aria-hidden="true">
              <img src="/images/icons/binoculars_recreated.svg" alt="" />
            </div>
            <div className="aboutGuideDesk__ferry" aria-hidden="true">
              <span className="material-symbols-rounded">directions_boat</span>
            </div>
            <div className="aboutGuideDesk__receipt" aria-hidden="true">
              <span>Forecast outlook</span>
              <strong>Very high</strong>
              <small>Relative activity</small>
            </div>
            <div className="aboutGuideDesk__ticket" aria-hidden="true">
              <span>San Juan Islands</span>
              <strong>Field pass</strong>
              <small>Shore · ferry · camera</small>
            </div>
            <div className="aboutGuideDesk__notes" aria-hidden="true">
              <span>Field</span>
              <strong>Notes</strong>
              <small>✦ Salish Sea</small>
            </div>
          </div>
        </section>

        <section
          className="aboutGuideProblem"
          aria-labelledby="about-problem-title"
        >
          <div className="aboutGuideProblem__copy">
            <p className="aboutGuideKicker">The Salish Sea is magical</p>
            <h2 id="about-problem-title">
              Planning around it <em>is messy.</em>
            </h2>
            <p>
              Sightings are scattered. Conditions change. The best spot is not
              always the nearest one. OrcaCast brings the pieces together so you
              can make the most of your day.
            </p>
          </div>
          <div className="aboutGuideSignals">
            {signals.map((signal) => (
              <article key={signal.title} className="aboutGuideSignal">
                <span
                  className={`aboutGuideIcon aboutGuideIcon--${signal.tone}`}
                  aria-hidden="true"
                >
                  <span className="material-symbols-rounded">
                    {signal.icon}
                  </span>
                </span>
                <h3>{signal.title}</h3>
                <p>{signal.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="aboutGuideWorkflow"
          aria-labelledby="about-workflow-title"
        >
          <div className="aboutGuideSectionHeading">
            <p className="aboutGuideKicker">From signals to a trip plan</p>
            <h2 id="about-workflow-title">How OrcaCast works</h2>
          </div>
          <div className="aboutGuideWorkflow__route" aria-hidden="true" />
          <div className="aboutGuideWorkflow__steps">
            {workflow.map((step) => (
              <article key={step.number} className="aboutGuideWorkflow__step">
                <span className="aboutGuideWorkflow__number">
                  {step.number}
                </span>
                <div className="aboutGuideWorkflow__illustration">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    {step.icon}
                  </span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
            <div className="aboutGuideWorkflow__ferry" aria-hidden="true">
              <span className="material-symbols-rounded">directions_boat</span>
              <i />
            </div>
          </div>
        </section>

        <section
          className="aboutGuideOutlook"
          id="outlook"
          aria-labelledby="about-outlook-title"
        >
          <div className="aboutGuideOutlook__copy">
            <p className="aboutGuideKicker">It is an outlook</p>
            <h2 id="about-outlook-title">
              Not an <em>orca appointment.</em>
            </h2>
            <p>
              Activity ratings are relative to other dates and locations. A
              higher rating means the available signals look more promising, not
              that an orca will definitely be present.
            </p>
          </div>

          <div
            className="aboutGuideActivityCard"
            aria-label="Example relative activity scale"
          >
            <span>Typical activity</span>
            <div className="aboutGuideActivityCard__scale">
              <b>Low</b>
              <i>
                <span />
              </i>
              <b>High</b>
            </div>
            <p>
              Based on historical patterns and forecast conditions for the
              selected area.
            </p>
          </div>

          <div
            className="aboutGuideReceipt"
            aria-label="Illustrative forecast receipt"
          >
            <span>Example outlook</span>
            <dl>
              <div>
                <dt>Activity</dt>
                <dd>Very high</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>Moderate</dd>
              </div>
              <div>
                <dt>Best area</dt>
                <dd>San Juan Islands</dd>
              </div>
            </dl>
            <span className="material-symbols-rounded" aria-hidden="true">
              wb_twilight
            </span>
          </div>
        </section>

        <section
          className="aboutGuideBoundaries"
          aria-label="What OrcaCast can and cannot do"
        >
          <article className="aboutGuideBoundaryCard aboutGuideBoundaryCard--can">
            <div>
              <p className="aboutGuideKicker">OrcaCast can help you</p>
              <h2>Plan with better context.</h2>
            </div>
            <ul>
              {canDo.map((item) => (
                <li key={item}>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    check_circle
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <span
              className="material-symbols-rounded aboutGuideBoundaryCard__art"
              aria-hidden="true"
            >
              signpost
            </span>
          </article>

          <article className="aboutGuideBoundaryCard aboutGuideBoundaryCard--cannot">
            <div>
              <p className="aboutGuideKicker">OrcaCast cannot</p>
              <h2>Turn wildlife into a promise.</h2>
            </div>
            <ul>
              {cannotDo.map((item) => (
                <li key={item}>
                  <span className="material-symbols-rounded" aria-hidden="true">
                    cancel
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <span
              className="material-symbols-rounded aboutGuideBoundaryCard__art"
              aria-hidden="true"
            >
              waves
            </span>
          </article>
        </section>

        <section
          className="aboutGuideResponsible"
          id="responsible-viewing"
          aria-labelledby="about-responsible-title"
        >
          <div className="aboutGuideSectionHeading aboutGuideSectionHeading--inline">
            <div>
              <p className="aboutGuideKicker">Responsible viewing</p>
              <h2 id="about-responsible-title">
                Find the magic. Give it space.
              </h2>
            </div>
            <span className="material-symbols-rounded" aria-hidden="true">
              favorite
            </span>
          </div>
          <div className="aboutGuideResponsible__grid">
            {viewingPrinciples.map((principle) => (
              <article key={principle.title}>
                <span className="material-symbols-rounded" aria-hidden="true">
                  {principle.icon}
                </span>
                <h3>{principle.title}</h3>
                <p>{principle.copy}</p>
              </article>
            ))}
          </div>
          <div
            className="aboutGuideResponsible__links"
            aria-label="Responsible viewing resources"
          >
            {responsibleViewingLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
              >
                {link.label}
                <span className="material-symbols-rounded" aria-hidden="true">
                  open_in_new
                </span>
              </a>
            ))}
          </div>
        </section>

        <section
          className="aboutGuideMethodology"
          id="methodology"
          aria-labelledby="about-methodology-title"
        >
          <div className="aboutGuideSectionHeading aboutGuideSectionHeading--center">
            <p className="aboutGuideKicker">Transparent by design</p>
            <h2 id="about-methodology-title">
              Built from signals, not certainty.
            </h2>
          </div>
          <div className="aboutGuideMethodology__cards">
            {methodologySignals.map((signal) => (
              <article key={signal.title}>
                <span
                  className="aboutGuideIcon aboutGuideIcon--teal"
                  aria-hidden="true"
                >
                  <span className="material-symbols-rounded">
                    {signal.icon}
                  </span>
                </span>
                <h3>{signal.title}</h3>
                <p>{signal.copy}</p>
                <small>{signal.cadence}</small>
              </article>
            ))}
          </div>
          <div className="aboutGuideMethodology__learn">
            <span
              className="aboutGuideMethodology__learnIcon material-symbols-rounded"
              aria-hidden="true"
            >
              route
            </span>
            <div>
              <small>Go beneath the outlook</small>
              <strong>
                Follow each signal from seasonal history to your field plan.
              </strong>
            </div>
            <Link
              className="aboutGuideButton aboutGuideButton--teal"
              to="/about/model"
            >
              Learn how the model works{" "}
              <span className="material-symbols-rounded" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>
          <details className="aboutGuideTechnical">
            <summary>
              Technical metadata{" "}
              <span className="material-symbols-rounded" aria-hidden="true">
                expand_more
              </span>
            </summary>
            <div className="aboutGuideTechnical__grid">
              <div>
                <span>Model</span>
                <strong>{appConfig.compositeModelLabel}</strong>
                <small>{appConfig.compositeModelId}</small>
              </div>
              <div>
                <span>Version</span>
                <strong>{appConfig.modelVersion}</strong>
                <small>Forecast Lab</small>
              </div>
              <div>
                <span>Data</span>
                <strong>{dataMeta?.data_version ?? "Loading metadata"}</strong>
                <small>
                  {dataMeta?.generated_at
                    ? `Generated ${dataMeta.generated_at}`
                    : "Versioned forecast inputs"}
                </small>
              </div>
            </div>
          </details>
        </section>

        <section
          className="aboutGuideLocal"
          aria-label="Regional focus and project credits"
        >
          <article className="aboutGuideLocal__region">
            <div className="aboutGuideLocal__copy">
              <p className="aboutGuideKicker">Built for the Salish Sea</p>
              <h2>Local geography matters.</h2>
              <p>
                OrcaCast is designed around the water, seasons, transit systems,
                and viewing culture of this specific region.
              </p>
              <ul>
                {regionLabels.map((region) => (
                  <li key={region}>{region}</li>
                ))}
              </ul>
            </div>
            <div
              className="aboutGuideLocal__map"
              aria-label="Salish Sea regional focus illustration"
            >
              <span
                className="aboutGuideLocal__land aboutGuideLocal__land--one"
                aria-hidden="true"
              />
              <span
                className="aboutGuideLocal__land aboutGuideLocal__land--two"
                aria-hidden="true"
              />
              <span
                className="aboutGuideLocal__land aboutGuideLocal__land--three"
                aria-hidden="true"
              />
              <b>Vancouver Island</b>
              <b>Strait of Georgia</b>
              <b>Puget Sound</b>
              <b>Strait of Juan de Fuca</b>
              <span className="material-symbols-rounded" aria-hidden="true">
                explore
              </span>
            </div>
          </article>

          <article className="aboutGuideCredits">
            <p className="aboutGuideKicker">Project & credits</p>
            <h2>Always learning.</h2>
            <p>
              OrcaCast is an independent forecasting and trip-planning project
              built at the intersection of marine ecology, geospatial analysis,
              and public exploration.
            </p>
            <ul>
              <li>
                <span className="material-symbols-rounded" aria-hidden="true">
                  check_circle
                </span>
                Data partners and contributors
              </li>
              <li>
                <span className="material-symbols-rounded" aria-hidden="true">
                  check_circle
                </span>
                Community observers
              </li>
              <li>
                <span className="material-symbols-rounded" aria-hidden="true">
                  check_circle
                </span>
                Image and map credits
              </li>
              <li>
                <span className="material-symbols-rounded" aria-hidden="true">
                  check_circle
                </span>
                Feedback and collaboration
              </li>
            </ul>
            <div className="aboutGuideCredits__lab">– Forecast Lab</div>
            <small>OrcaCast photography credit: Stephen Walker.</small>
          </article>
        </section>

        <section className="aboutGuideCta" aria-labelledby="about-cta-title">
          <div>
            <h2 id="about-cta-title">The sea does not follow an itinerary.</h2>
            <p>Your trip still can.</p>
          </div>
          <span
            className="material-symbols-rounded aboutGuideCta__ferry"
            aria-hidden="true"
          >
            directions_boat
          </span>
          <div className="aboutGuideCta__actions">
            <Link
              className="aboutGuideButton aboutGuideButton--teal"
              to="/planner"
            >
              Build my trip{" "}
              <span className="material-symbols-rounded" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
            <Link className="aboutGuideButton aboutGuideButton--cream" to="/">
              See this week{" "}
              <span className="material-symbols-rounded" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter
        tagline="Plan thoughtfully. Watch respectfully."
        links={[
          { label: "About", to: "#about-top", external: true },
          {
            label: "Responsible viewing",
            to: "#responsible-viewing",
            external: true,
          },
          { label: "Methodology", to: "#methodology", external: true },
          { label: "Learn how the model works", to: "/about/model" },
          { label: "Plan a trip", to: "/planner" },
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

      <ReturnToTopButton className="aboutReturnToTop" />

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
