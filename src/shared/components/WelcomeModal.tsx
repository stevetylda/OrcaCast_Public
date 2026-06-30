import { useEffect, useId } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
  onLearnMore: () => void;
};

export function WelcomeModal({ open, onClose, onStartTour, onLearnMore }: Props) {
  const titleId = useId();

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
    <div className="overlay overlay--welcome" onClick={onClose} role="presentation">
      <section
        className="modal modal--welcome"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal__header welcome__header">
          <div className="welcome__titleWrap">
            <img src="/images/OrcaHex_Logo.png" alt="OrcaCast logo" className="welcome__logo" />
            <div className="modal__title welcome__title" id={titleId}>
              Welcome to OrcaCast!
            </div>
          </div>
          <button
            className="welcome__close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              close
            </span>
          </button>
        </div>
        <div className="welcome__accent" aria-hidden="true" />

        <div className="modal__body welcome__body">
          <p className="welcome__subtitle">
            Explore weekly forecasts of orca presence across the Pacific Northwest.
          </p>

          <div className="welcome__sectionTitle">In OrcaCast you can…</div>
          <ul className="welcome__bullets">
            <li>
              <span className="material-symbols-rounded" aria-hidden="true">
                map
              </span>
              Scan weekly hotspots at a glance
            </li>
            <li>
              <span className="material-symbols-rounded" aria-hidden="true">
                timeline
              </span>
              Compare seasonality and shifts over time
            </li>
            <li>
              <span className="material-symbols-rounded" aria-hidden="true">
                layers
              </span>
              Add context layers: sightings, parks, pod ranges
            </li>
          </ul>
          <button
            className="welcome__link welcome__link--inline"
            type="button"
            onClick={onLearnMore}
          >
            About OrcaCast →
          </button>

          <div className="modal__tourActions welcome__actions">
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                onClose();
                window.setTimeout(() => onStartTour(), 180);
              }}
            >
              Start Tour
            </button>
            <button className="btn btn--ghost btn--soft" type="button" onClick={onClose}>
              Explore
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
