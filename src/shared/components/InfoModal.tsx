import { useEffect, useId } from "react";
import { Link } from "react-router-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
  darkMode?: boolean;
};

export function InfoModal({ open, onClose, onStartTour, darkMode = true }: Props) {
  const titleId = useId();

  // Escape closes modal (tiny UX win)
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`overlay${darkMode ? "" : " overlay--light"}`} onClick={onClose} role="presentation">
      <section
        className={`modal modal--info${darkMode ? "" : " modal--light"}`}
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal__header modal__header--info">
          <div className="modal__title modal__title--info" id={titleId}>
            About / Learn More
          </div>

          <div className="info__headerActions">
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                onClose();
                window.setTimeout(() => onStartTour(), 180);
              }}
            >
              Take Tour
            </button>
            <Link className="btn btn--ghost btn--soft" to="/about" onClick={onClose}>
              Learn More
            </Link>
            <button
              className="info__close"
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        </div>

        <div className="modal__body modal__body--info">
          <div className="modal__section">
            <div className="modal__sectionTitle">What it is</div>
            <p className="modal__lead">
              OrcaCast forecasts where orca sightings are more likely to be reported during the
              selected window.
            </p>
          </div>

          <div className="modal__section">
            <div className="modal__sectionTitle">How to read the map</div>
            <ul className="modal__bullets modal__bullets--info">
              <li>
                <strong>Heatmap (hex cells):</strong> hotter colors = higher likelihood within the
                same week.
              </li>
              <li>
                <strong>Points:</strong> reported sightings for the selected or prior week (optional
                overlay).
              </li>
              <li>
                <strong>Compare weeks:</strong> use the forecast period control to move through time.
              </li>
            </ul>
          </div>

          <div className="modal__stickyWarnings">
            <div className="modal__callout modal__callout--psa">
              <div className="modal__calloutRow">
                <span className="material-symbols-rounded modal__calloutIcon" aria-hidden="true">
                  warning
                </span>
                <div className="modal__calloutText">
                  <strong>Responsible use:</strong> Follow local wildlife guidance and keep a
                  respectful distance.
                  <div className="modal__calloutText--detail">
                    OrcaCast is for education and planning — not navigation or enforcement.
                  </div>
                  <div className="modal__calloutText--detail">
                    <strong>Not real-time:</strong> OrcaCast does not show live whale locations —
                    it’s a short-term forecast based on reported sightings.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
