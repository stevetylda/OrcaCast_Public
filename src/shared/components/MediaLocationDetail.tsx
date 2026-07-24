import { useState } from "react";
import type { WebcamSite } from "../../features/locations/types";
import type { OrcasoundHydrophone } from "../data/orcasoundHydrophones";
import "./MediaLocationDetail.css";

const STATUS_LABELS = {
  "verified-current": "Verified current",
  "current-frame-verified": "Current frame verified",
  "landing-verified": "Camera page verified",
  "directory-current": "Directory current",
  seasonal: "Seasonal",
  listed: "Listed",
} as const;

type PendingLink = { url: string; action: string } | null;

function safeExternalUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function ExternalMediaLinkButton({
  url,
  children,
}: {
  url: string;
  children: string;
}) {
  const safeUrl = safeExternalUrl(url);
  const [pendingLink, setPendingLink] = useState<PendingLink>(null);
  if (!safeUrl) return null;

  return (
    <>
      <button
        type="button"
        className="mediaLocationDetail__watchButton"
        title={safeUrl}
        onClick={() => setPendingLink({ url: safeUrl, action: children })}
      >
        <span className="material-symbols-rounded" aria-hidden="true">
          open_in_new
        </span>
        {children}
      </button>
      {pendingLink ? (
        <div
          className="externalMediaConfirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="external-media-confirm-title"
        >
          <div className="externalMediaConfirm__card">
            <span className="material-symbols-rounded" aria-hidden="true">
              travel_explore
            </span>
            <h3 id="external-media-confirm-title">Head to another website?</h3>
            <p>This button will take you to a website that is not OrcaCast.</p>
            <code title={pendingLink.url}>{pendingLink.url}</code>
            <div className="externalMediaConfirm__actions">
              <button type="button" onClick={() => setPendingLink(null)}>
                Nah
              </button>
              <a
                href={pendingLink.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPendingLink(null)}
              >
                Yah
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function MediaLocationDetail({
  webcam,
  hydrophone,
  hydrophoneListenUrl,
  onBack,
  onCenterMap,
  onClose,
}: {
  webcam?: WebcamSite | null;
  hydrophone?: OrcasoundHydrophone | null;
  hydrophoneListenUrl?: string;
  onBack: () => void;
  onCenterMap?: () => void;
  onClose?: () => void;
}) {
  const location = webcam ?? hydrophone;
  if (!location) return null;

  return (
    <div className="mediaLocationDetail">
      <div className="mediaLocationDetail__header">
        <button type="button" onClick={onBack}>
          <span className="material-symbols-rounded" aria-hidden="true">
            arrow_back
          </span>
          Back to field picks
        </button>
        {onClose ? (
          <button
            type="button"
            className="mediaLocationDetail__close"
            onClick={onClose}
            aria-label="Collapse recommended places"
            title="Collapse"
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              expand_more
            </span>
          </button>
        ) : null}
      </div>

      <div className="mediaLocationDetail__hero" aria-hidden="true">
        <span className="material-symbols-rounded">
          {webcam ? "videocam" : "graphic_eq"}
        </span>
      </div>

      <div className="mediaLocationDetail__body">
        <p className="mediaLocationDetail__eyebrow">
          {webcam ? "Webcam details" : "Hydrophone details"}
        </p>
        <h2>{location.name}</h2>
        <p className="mediaLocationDetail__region">
          {webcam
            ? `${webcam.waterbody} · ${webcam.locality}`
            : hydrophone?.region}
        </p>

        <div className="mediaLocationDetail__stats">
          <div>
            <span>Type</span>
            <strong>{webcam ? "Webcam" : "Orcasound hydrophone"}</strong>
          </div>
          <div>
            <span>Location</span>
            <strong>
              {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </strong>
          </div>
        </div>

        {webcam ? (
          <div className="mediaLocationDetail__feeds">
            {webcam.feeds.map((feed) => (
              <article key={feed.id} className="mediaLocationDetail__feed">
                <h3>{feed.name}</h3>
                <p>{feed.operator}</p>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{STATUS_LABELS[feed.status]}</dd>
                  </div>
                  {feed.verifiedAt ? (
                    <div>
                      <dt>Checked</dt>
                      <dd>{feed.verifiedAt}</dd>
                    </div>
                  ) : null}
                  {feed.seasonality ? (
                    <div>
                      <dt>Seasonality</dt>
                      <dd>{feed.seasonality}</dd>
                    </div>
                  ) : null}
                </dl>
                {feed.caveat ? <p>{feed.caveat}</p> : null}
                <ExternalMediaLinkButton url={feed.accessUrl}>
                  Go Watch
                </ExternalMediaLinkButton>
              </article>
            ))}
          </div>
        ) : (
          <div className="mediaLocationDetail__feed">
            <h3>Listen on Orcasound</h3>
            <p>
              Live underwater audio is provided by Orcasound on its own website.
            </p>
            {hydrophoneListenUrl ? (
              <ExternalMediaLinkButton url={hydrophoneListenUrl}>
                Go Listen
              </ExternalMediaLinkButton>
            ) : null}
          </div>
        )}

        {onCenterMap ? (
          <button
            type="button"
            className="mediaLocationDetail__centerButton"
            onClick={onCenterMap}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              my_location
            </span>
            Center on map
          </button>
        ) : null}
      </div>
    </div>
  );
}
