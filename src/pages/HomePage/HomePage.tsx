import { lazy, Suspense, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { AppHeader } from "../../shared/components/AppHeader";
import { useMenu } from "../../shared/state/MenuContext";
import { useMapState } from "../../shared/state/MapStateContext";

const InfoModal = lazy(() => import("../../shared/components/InfoModal").then((m) => ({ default: m.InfoModal })));

const homeCards = [
  {
    title: "This Week's Outlook",
    body: "See this week's forecast hotspots, suggested places, and confidence at a glance.",
    cta: "View outlook",
    href: "/watch?panel=this-week",
    icon: "partly_cloudy_day",
    accent: "homeFeatureCard--outlook",
    comingSoon: false,
  },
  {
    title: "Plan Around My Dates",
    body: "Choose your base, dates, and travel range. We’ll map the strongest viewing spots for your trip.",
    cta: "Start planning",
    href: "/planner?new=1",
    icon: "calendar_month",
    accent: "homeFeatureCard--trip",
    comingSoon: false,
  },
  {
    title: "Find the Best Window",
    body: "Flexible on timing? Discover the strongest dates, places, and trip ideas for better viewing conditions.",
    cta: "Find best window",
    href: "/watch?panel=trip-planner&searched=1",
    icon: "query_stats",
    accent: "homeFeatureCard--best",
    comingSoon: true,
  },
] as const;

export function HomePage() {
  const { setMenuOpen } = useMenu();
  const { darkMode } = useMapState();
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="homePageRoot">
      <AppHeader
        title="OrcaCast"
        subtitle="Orca Sightings Forecast"
        onOpenInfo={() => setInfoOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
      />

      <main className="homePage">
        <section
          className="homeHero"
          style={
            {
              "--home-hero-url": "url('/images/home/orca_image.jpg')",
            } as CSSProperties
          }
        >
          <div className="homeHero__overlay" aria-hidden="true" />
          <div className="homeHero__content">
            <div className="homeHero__copy">
              <p className="homeHero__eyebrow">Trip planning for the Salish Sea</p>
              <h1 className="homeHero__title">Find your best orca viewing window</h1>
              <p className="homeHero__body">
                Plan using forecasts, seasonal insights, and real-world viewing conditions.
              </p>
            </div>

            <div className="homeFeatureGrid">
              {homeCards.map((card) => (
                <article
                  key={card.title}
                  className={`homeFeatureCard ${card.accent}${card.comingSoon ? " homeFeatureCard--comingSoon" : ""}`}
                >
                  {card.comingSoon ? (
                    <span className="homeFeatureCard__ribbon" aria-label="Coming soon">
                      Coming soon
                    </span>
                  ) : null}
                  <div className="homeFeatureCard__iconWrap">
                    <span className="material-symbols-rounded" aria-hidden="true">
                      {card.icon}
                    </span>
                  </div>
                  <h2 className="homeFeatureCard__title">{card.title}</h2>
                  <p className="homeFeatureCard__body">{card.body}</p>

                  <div className="homeFeatureCard__visual" aria-hidden="true">
                    {card.accent === "homeFeatureCard--trip" ? (
                      <div className="homePlannerPreview">
                        <div className="homePlannerPreview__shell">
                          <div className="homePlannerPreview__map">
                            <img
                              className="homePlannerPreview__mapImage"
                              src="/assets/home/plan-around-dates-map-preview.svg"
                              alt=""
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {card.accent === "homeFeatureCard--best" ? (
                      <div className="homeMiniChart">
                        <span className="homeMiniChart__label">Best window</span>
                        <div className="homeMiniChart__bars">
                          {[0.22, 0.34, 0.46, 0.56, 0.74, 0.9, 0.62, 0.38].map((value, index) => (
                            <span
                              key={`${card.accent}-${index}`}
                              className={`homeMiniChart__bar${index === 5 ? " isActive" : ""}`}
                              style={
                                {
                                  "--bar-scale": value,
                                  "--bar-strength": value,
                                } as CSSProperties
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {card.accent === "homeFeatureCard--outlook" ? (
                      <div className="homeMiniOutlookMap">
                        <span className="homeMiniOutlookMap__hotspot" />
                        <div className="homeMiniOutlookMap__badge">Best bet</div>
                        <div className="homeMiniOutlookMap__places">
                          <div className="homeMiniOutlookMap__placeRow">
                            <span className="homeMiniOutlookMap__placeIcon material-symbols-rounded" aria-hidden="true">
                              park
                            </span>
                            <span className="homeMiniOutlookMap__placeName">Lime Kiln Point</span>
                            <span className="homeMiniOutlookMap__placeMeta homeMiniOutlookMap__placeMeta--high">High</span>
                          </div>
                          <div className="homeMiniOutlookMap__placeRow">
                            <span className="homeMiniOutlookMap__placeIcon material-symbols-rounded" aria-hidden="true">
                              anchor
                            </span>
                            <span className="homeMiniOutlookMap__placeName">Posey Island</span>
                            <span className="homeMiniOutlookMap__placeMeta homeMiniOutlookMap__placeMeta--med">Med</span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {card.comingSoon ? (
                    <span className="homeFeatureCard__cta homeFeatureCard__cta--disabled" aria-disabled="true">
                      <span>{card.cta}</span>
                      <span className="material-symbols-rounded" aria-hidden="true">
                        arrow_forward
                      </span>
                    </span>
                  ) : (
                    <Link className="homeFeatureCard__cta" to={card.href}>
                      {card.accent === "homeFeatureCard--trip" ? (
                        <img
                          className="homeFeatureCard__ctaIcon homeFeatureCard__ctaIcon--image"
                          src="/images/icons/binoculars_recreated.svg"
                          alt=""
                          aria-hidden="true"
                        />
                      ) : null}
                      <span>{card.cta}</span>
                      <span className="material-symbols-rounded" aria-hidden="true">
                        arrow_forward
                      </span>
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

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
