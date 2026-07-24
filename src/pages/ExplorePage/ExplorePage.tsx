import { Link } from "react-router-dom";
import { ForecastLabHeader } from "../../shared/components/ForecastLabHeader";
import { useMenu } from "../../shared/state/MenuContext";
import "./ExplorePage.css";

const previews = [
  {
    icon: "waves",
    number: "01",
    title: "Meet the whales",
    copy: "Orcas, humpbacks, grays, minkes, and the clues that help tell them apart.",
    tone: "coral",
  },
  {
    icon: "visibility",
    number: "02",
    title: "Watch with care",
    copy: "Shore-first viewing tips, respectful distance, and what to do when whales appear.",
    tone: "yellow",
  },
  {
    icon: "flutter_dash",
    number: "03",
    title: "Look beyond fins",
    copy: "Porpoises, seals, sea lions, eagles, seabirds, and other Salish Sea neighbors.",
    tone: "teal",
  },
] as const;

export function ExplorePage() {
  const { setMenuOpen } = useMenu();

  return (
    <div className="mapPageRoot exploreSoonPage">
      <ForecastLabHeader onOpenMenu={() => setMenuOpen(true)} />

      <main id="main-content" className="exploreSoonMain" tabIndex={-1}>
        <section className="exploreSoonHero" aria-labelledby="explore-title">
          <div className="exploreSoonHero__copy">
            <p className="exploreSoonKicker">Field guide under construction</p>
            <h1 id="explore-title">
              Know who’s <em>in the water.</em>
            </h1>
            <p className="exploreSoonHero__lede">
              We’re building a practical guide to whales, thoughtful whale
              watching, and the many other species that make the Salish Sea
              remarkable.
            </p>
            <div className="exploreSoonNotice" role="status">
              <span className="material-symbols-rounded" aria-hidden="true">
                construction
              </span>
              <div>
                <strong>Coming soon</strong>
                <span>The guide is still taking shape.</span>
              </div>
            </div>
            <Link className="exploreSoonButton" to="/watch">
              Explore this week’s map
              <span className="material-symbols-rounded" aria-hidden="true">
                map
              </span>
            </Link>
          </div>

          <div className="exploreSoonWorksite" aria-hidden="true">
            <div className="exploreSoonWorksite__sun">✦</div>
            <span className="exploreSoonWorksite__whale">◖</span>
            <div className="exploreSoonBarrier">
              <i /> <i /> <i /> <i />
            </div>
            <span className="exploreSoonCone exploreSoonCone--one">▲</span>
            <span className="exploreSoonCone exploreSoonCone--two">▲</span>
            <p>Guide habitat</p>
            <b>Work in progress</b>
          </div>
        </section>

        <section className="exploreSoonPreview" aria-labelledby="preview-title">
          <div className="exploreSoonPreview__heading">
            <p className="exploreSoonKicker">What’s being built</p>
            <h2 id="preview-title">A better day by the water.</h2>
          </div>
          <div className="exploreSoonGrid">
            {previews.map((preview) => (
              <article
                className={`exploreSoonCard exploreSoonCard--${preview.tone}`}
                key={preview.number}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  {preview.icon}
                </span>
                <small>{preview.number}</small>
                <h3>{preview.title}</h3>
                <p>{preview.copy}</p>
                <b>Coming soon</b>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
