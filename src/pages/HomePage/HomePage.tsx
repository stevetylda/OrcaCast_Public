import { Link } from "react-router-dom";
import { AppHeader } from "../../shared/components/AppHeader";
import { PrimaryNavigation } from "../../shared/components/PrimaryNavigation";
import { ReturnToTopButton } from "../../shared/components/ReturnToTopButton";
import { SiteFooter } from "../../shared/components/SiteFooter";
import { routePath } from "../../shared/config/routes";
import { useMenu } from "../../shared/state/MenuContext";
import { HomeForecast } from "../../features/home/HomeForecast";
import { HomeSeasonality } from "../../features/home/HomeSeasonality";
import { HomeWeather } from "../../features/home/HomeWeather";
import "./HomePage.css";

const HOME_REGIONS = [
  {
    name: "San Juan Islands",
    status: "Island viewpoints",
    detail: "historically active waters",
    image: "/spot-photos/lime-kiln-point-state-park.webp",
  },
  {
    name: "Central Salish Sea",
    status: "Flexible access",
    detail: "good shore access",
    image: "/spot-photos/generic.webp",
  },
  {
    name: "Strait of Juan de Fuca",
    status: "Open-water views",
    detail: "wide-water viewpoints",
    image: "/spot-photos/generic.webp",
  },
] as const;

export function HomePage() {
  const { setMenuOpen } = useMenu();
  return (
    <div className="homePageRoot">
      <AppHeader
        title="OrcaCast"
        subtitle="Forecast Lab"
        variant="home"
        onOpenMenu={() => setMenuOpen(true)}
        rightSlot={
          <PrimaryNavigation
            className="homeNav"
            ariaLabel="Homepage navigation"
          />
        }
      />

      <main id="main-content" className="homeLanding" tabIndex={-1}>
        <section className="homeHero" aria-labelledby="home-hero-title">
          <div className="homeHero__copy">
            <p className="homeKicker">Shore-first · Salish Sea</p>
            <h1 id="home-hero-title" className="homeHero__title">
              Go find <em>the magic.</em>
            </h1>
            <p className="homeHero__body">
              Plan shore-based orca watching with seasonal reports, weekly
              outlooks, and places to explore. A thoughtful plan, with room for
              the unexpected.
            </p>
            <div className="homeHero__actions">
              <Link
                className="homeButton homeButton--teal"
                to={routePath("planner")}
              >
                Plan a trip{" "}
                <span className="material-symbols-rounded" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
              <Link
                className="homeButton homeButton--cream"
                to={routePath("watch")}
              >
                View weekly outlook
              </Link>
            </div>
          </div>
          <div
            className="homeHero__image"
            role="img"
            aria-label="An orca in the Salish Sea"
          >
            <div className="homeHero__spark" aria-hidden="true">
              ✦
            </div>
            <div className="homeHero__caption">
              <span>48.5° N · 123.0° W</span>
              <span>The Salish Sea</span>
              <span>Pacific Northwest</span>
            </div>
          </div>
        </section>

        <section
          className="homeWeek"
          id="this-week"
          aria-labelledby="weekly-pulse-title"
        >
          <div className="homeSectionHeading">
            <p className="homeKicker">Before you head out</p>
            <h2 id="weekly-pulse-title">
              A little context. <em>A better plan.</em>
            </h2>
            <p className="homeWeek__intro">
              Check what is published, compare the season, and explore shore
              viewpoints.
            </p>
          </div>
          <div className="homePulseGrid">
            <HomeForecast />
            <HomeSeasonality />
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
                {HOME_REGIONS.map((region) => (
                  <div className="homeRegionRow" key={region.name}>
                    <img
                      src={region.image}
                      width={64}
                      height={64}
                      loading="lazy"
                      alt=""
                    />
                    <span>
                      <strong>{region.name}</strong>
                      <em>{region.status}</em>
                      <small>{region.detail}</small>
                    </span>
                  </div>
                ))}
              </div>
              <Link
                to={routePath("watch")}
                className="homePulseLink homePulseLink--teal"
              >
                Explore the forecast map <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>

          <HomeWeather />
        </section>

        <section className="homePlannerCta" aria-labelledby="trip-title">
          <div className="homePlannerCta__copy">
            <p className="homeKicker">Make it a trip</p>
            <h2 id="trip-title">
              Your dates.
              <br />
              <em>Your kind of day.</em>
            </h2>
            <p>
              Choose your dates and a base. Compare historical reports and
              nearby viewing places, then save a plan that suits your trip.
            </p>
            <Link
              className="homeButton homeButton--yellow"
              to={routePath("planner")}
            >
              Find viewing places{" "}
              <span className="material-symbols-rounded" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </div>
          <Link
            to={routePath("planner")}
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
            <Link
              className="homeExploreCard homeExploreCard--pink"
              to={routePath("explore")}
            >
              <span className="homeExploreCard__icon" aria-hidden="true">
                <span className="material-symbols-rounded">map</span>
              </span>
              <div>
                <h3>Explore</h3>
                <p>Preview the field guide.</p>
              </div>
              <b aria-hidden="true">→</b>
            </Link>
            <Link
              className="homeExploreCard homeExploreCard--yellow"
              to={`${routePath("watch")}?view=cameras`}
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
          { label: "About", to: routePath("about") },
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
    </div>
  );
}
