import { Link } from "react-router-dom";
import { useMenu } from "../../shared/state/MenuContext";
import "./NotFoundPage.css";

export function NotFoundPage() {
  const { setMenuOpen } = useMenu();

  return (
    <div className="notFoundPage">
      <header className="notFoundHeader">
        <button
          type="button"
          className="notFoundHeader__menu"
          aria-label="Open main menu"
          onClick={() => setMenuOpen(true)}
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            menu
          </span>
        </button>
        <Link
          className="notFoundHeader__brand"
          to="/"
          aria-label="OrcaCast home"
        >
          OrcaCast <span>Forecast Lab</span>
        </Link>
        <Link className="notFoundHeader__home" to="/" aria-label="Home">
          Home
          <span className="material-symbols-rounded" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </header>

      <main id="main-content" className="notFoundMain" tabIndex={-1}>
        <section className="notFoundCard" aria-labelledby="not-found-title">
          <div className="notFoundCard__copy">
            <p className="notFoundKicker">404 · Off the chart</p>
            <h1 id="not-found-title">
              This route drifted <em>out to sea.</em>
            </h1>
            <p className="notFoundCard__lede">
              The page may have moved, or the address may have taken a wrong
              turn through the Salish Sea.
            </p>
            <div className="notFoundActions">
              <Link className="notFoundButton notFoundButton--primary" to="/">
                Return home
                <span className="material-symbols-rounded" aria-hidden="true">
                  home
                </span>
              </Link>
              <Link className="notFoundButton" to="/watch">
                Open Orca Watch
              </Link>
            </div>
          </div>

          <div className="notFoundChart" aria-hidden="true">
            <span className="notFoundChart__sun">✦</span>
            <span className="notFoundChart__code">404</span>
            <span className="notFoundChart__orca">◖</span>
            <div className="notFoundChart__water notFoundChart__water--one" />
            <div className="notFoundChart__water notFoundChart__water--two" />
            <p>Last known position</p>
            <b>Somewhere beyond the forecast</b>
          </div>
        </section>

        <nav className="notFoundRoutes" aria-label="Popular destinations">
          <span>Try a known heading</span>
          <Link to="/watch">Watch</Link>
          <Link to="/planner">Planner</Link>
          <Link to="/explore">Explore</Link>
          <Link to="/about">About</Link>
          <Link to="/about/model">The model</Link>
        </nav>
      </main>
    </div>
  );
}
