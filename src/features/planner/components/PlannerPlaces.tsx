import type {
  SuggestedPlace,
  ViewingPotential,
  WebcamSite,
} from "../../locations/types";
import type { OrcasoundHydrophone } from "../../../shared/data/orcasoundHydrophones";
import { resolveAppAssetPath } from "../../../shared/config/basePath";
import {
  getViewingSpotPhoto,
  hasApprovedSpotPhoto,
  type ViewingSpotPhotoManifest,
} from "../../../shared/data/viewingSpotPhotos";

const PLACE_IMAGE_PLACEHOLDER_SRC = resolveAppAssetPath(
  "spot-images/generic.webp",
);
const LOCAL_PLACE_IMAGE_PATTERN =
  /^\/(?:images|spot-images|spot-photos)\/[A-Za-z0-9_./-]+$/;

const potentialLabel: Record<ViewingPotential, string> = {
  "very-high": "Very High",
  high: "High",
  medium: "Medium",
  low: "Low",
  "very-low": "Very Low",
};

function formatPlaceType(type: SuggestedPlace["type"]) {
  return type === "Ferry" ? "Ferry terminal" : type;
}

function getPlaceTypeIcon(type: SuggestedPlace["type"]) {
  if (type === "Park") return "park";
  if (type === "Marina") return "anchor";
  if (type === "Ferry") return "directions_boat";
  return "place";
}

function getPlacePresentation(
  place: SuggestedPlace,
  photoManifest: ViewingSpotPhotoManifest,
) {
  const photo = getViewingSpotPhoto(place.spotId, photoManifest);
  const approvedPhotoSrc = safePlaceImageSrc(photo?.imageSrc);
  const placeImageSrc = safePlaceImageSrc(place.imageUrl);
  const showApprovedPhoto = hasApprovedSpotPhoto(photo) && approvedPhotoSrc;
  const showPlaceImage = !showApprovedPhoto && Boolean(placeImageSrc);
  return {
    imageSrc: showApprovedPhoto
      ? approvedPhotoSrc
      : (placeImageSrc ?? PLACE_IMAGE_PLACEHOLDER_SRC),
    imageAlt: showApprovedPhoto
      ? (photo?.alt ?? place.name)
      : showPlaceImage
        ? `Photo of ${place.name}`
        : "",
    imagePosition: showApprovedPhoto
      ? (photo?.focalPoint ?? "50% 50%")
      : undefined,
  };
}

function safePlaceImageSrc(value: string | undefined) {
  if (!value || !LOCAL_PLACE_IMAGE_PATTERN.test(value)) return null;
  return value;
}

function safeExternalHref(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function PlannerLoadingState({
  title,
  message,
  className = "",
}: {
  title: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`plannerResultsPage__loadingState${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`${title}. ${message}`}
    >
      <div className="plannerResultsPage__loadingPanel">
        <span
          className="plannerResultsPage__loadingIcon material-symbols-rounded"
          aria-hidden="true"
        >
          travel_explore
        </span>
        <div className="plannerResultsPage__loadingCopy">
          <p className="plannerResultsPage__loadingTitle">{title}</p>
          <p className="plannerResultsPage__loadingMessage">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function PlannerPlaceCard({
  place,
  rank,
  photoManifest,
  itineraryAdded,
  onAddToItinerary,
  onRemoveFromItinerary,
  selected,
  onShowOnMap,
  onViewDetails,
}: {
  place: SuggestedPlace;
  rank: number;
  photoManifest: ViewingSpotPhotoManifest;
  itineraryAdded: boolean;
  onAddToItinerary: () => void;
  onRemoveFromItinerary: () => void;
  selected: boolean;
  onShowOnMap: () => void;
  onViewDetails: () => void;
}) {
  const { imageSrc, imageAlt, imagePosition } = getPlacePresentation(
    place,
    photoManifest,
  );

  return (
    <article
      className={`plannerResultsPage__spotCard suggestedPlaceCard suggestedPlaceCard--${place.viewingPotential}${
        selected ? " isSelected suggestedPlaceCard--selected" : ""
      }${itineraryAdded ? " isInItinerary" : ""}`}
    >
      <div className="plannerResultsPage__spotCardInner">
        <button
          type="button"
          className="plannerResultsPage__spotCardFace plannerResultsPage__spotCardFace--front"
          onClick={onShowOnMap}
          aria-pressed={selected}
        >
          <div className="plannerResultsPage__spotThumbWrap suggestedPlaceCard__media">
            <span
              className="plannerResultsPage__spotRank"
              aria-label={`Recommendation rank ${rank}`}
            >
              {rank}
            </span>
            {imageSrc ? (
              <img
                className="plannerResultsPage__spotThumb suggestedPlaceCard__thumb"
                src={imageSrc}
                alt={imageAlt}
                loading="lazy"
                style={
                  imagePosition ? { objectPosition: imagePosition } : undefined
                }
                onError={(event) => {
                  const image = event.currentTarget;
                  if (image.dataset.fallbackApplied === "true") return;
                  image.dataset.fallbackApplied = "true";
                  image.src = PLACE_IMAGE_PLACEHOLDER_SRC;
                  image.alt = "";
                  image.style.objectPosition = "50% 50%";
                }}
              />
            ) : (
              <div className="plannerResultsPage__spotThumb plannerResultsPage__spotThumb--placeholder suggestedPlaceCard__thumb suggestedPlaceCard__thumb--placeholder">
                <span className="material-symbols-rounded" aria-hidden="true">
                  travel_explore
                </span>
              </div>
            )}
          </div>
          <div className="plannerResultsPage__spotBody suggestedPlaceCard__body">
            <div className="plannerResultsPage__spotTopline suggestedPlaceCard__topline">
              <h3 className="suggestedPlaceCard__name">{place.name}</h3>
              <span
                className={`viewingPotentialBadge viewingPotentialBadge--${place.viewingPotential}`}
              >
                {potentialLabel[place.viewingPotential]}
              </span>
            </div>
            <p className="plannerResultsPage__spotRegion suggestedPlaceCard__meta">
              <span
                className={`suggestedPlaceType suggestedPlaceType--${place.type.toLowerCase()}`}
              >
                <span
                  className="material-symbols-rounded suggestedPlaceType__icon"
                  aria-hidden="true"
                >
                  {getPlaceTypeIcon(place.type)}
                </span>
                <span>{formatPlaceType(place.type)}</span>
              </span>
              <span className="plannerResultsPage__spotDistance">
                {place.distanceFromBaseKm !== undefined
                  ? `${Math.round(place.distanceFromBaseKm * 0.621371)} mi from base`
                  : "In trip range"}
              </span>
            </p>
          </div>
        </button>

        <div className="plannerResultsPage__spotCardFace plannerResultsPage__spotCardFace--back">
          <div className="plannerResultsPage__spotCardActionWrap">
            <span className="plannerResultsPage__spotCardActionLabel">
              {place.name}
            </span>
            <div className="plannerResultsPage__spotCardActions">
              <button
                type="button"
                className="plannerResultsPage__spotCardActionBtn"
                onClick={onViewDetails}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  travel_explore
                </span>
                <span>View details</span>
              </button>
              <button
                type="button"
                className={`plannerResultsPage__spotCardActionBtn ${
                  itineraryAdded
                    ? "plannerResultsPage__spotCardActionBtn--danger"
                    : "plannerResultsPage__spotCardActionBtn--primary"
                }${itineraryAdded ? " isAdded" : ""}`}
                onClick={
                  itineraryAdded ? onRemoveFromItinerary : onAddToItinerary
                }
                aria-pressed={itineraryAdded}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  {itineraryAdded ? "remove_circle" : "playlist_add"}
                </span>
                <span>{itineraryAdded ? "✓ Added" : "Add to itinerary"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PlannerPlaceDetailView({
  place,
  photoManifest,
  matchedCameras,
  matchedHydrophones,
  hydrophoneListenUrl,
  itineraryAdded,
  onAddToItinerary,
  onRemoveFromItinerary,
  onViewItinerary,
  onBack,
}: {
  place: SuggestedPlace;
  photoManifest: ViewingSpotPhotoManifest;
  matchedCameras: WebcamSite[];
  matchedHydrophones: OrcasoundHydrophone[];
  hydrophoneListenUrl: string;
  itineraryAdded: boolean;
  onAddToItinerary: () => void;
  onRemoveFromItinerary: () => void;
  onViewItinerary: () => void;
  onBack: () => void;
}) {
  const { imageSrc, imageAlt, imagePosition } = getPlacePresentation(
    place,
    photoManifest,
  );

  return (
    <div className="plannerResultsPage__spotDetail">
      <div className="plannerResultsPage__spotDetailHeader">
        <button
          type="button"
          className="plannerResultsPage__spotDetailBack"
          onClick={onBack}
        >
          <span className="material-symbols-rounded" aria-hidden="true">
            arrow_back
          </span>
          <span>Back to trip</span>
        </button>
      </div>

      <div className="plannerResultsPage__spotDetailMedia">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={imageAlt}
            loading="lazy"
            style={
              imagePosition ? { objectPosition: imagePosition } : undefined
            }
            onError={(event) => {
              const image = event.currentTarget;
              if (image.dataset.fallbackApplied === "true") return;
              image.dataset.fallbackApplied = "true";
              image.src = PLACE_IMAGE_PLACEHOLDER_SRC;
              image.alt = "";
              image.style.objectPosition = "50% 50%";
            }}
          />
        ) : null}
      </div>

      <div className="plannerResultsPage__spotDetailBody">
        <div className="plannerResultsPage__spotDetailTitleRow">
          <div>
            <div className="plannerResultsPage__spotsEyebrow">
              Location details
            </div>
            <h3>{place.name}</h3>
            <p>{place.region ?? "Salish Sea"}</p>
          </div>
          <span
            className={`suggestedPlaceType suggestedPlaceType--${place.type.toLowerCase()}`}
          >
            <span
              className="material-symbols-rounded suggestedPlaceType__icon"
              aria-hidden="true"
            >
              {getPlaceTypeIcon(place.type)}
            </span>
            <span>{formatPlaceType(place.type)}</span>
          </span>
        </div>

        <div className="plannerResultsPage__spotDetailSummaryGrid">
          <div>
            <span>Outlook</span>
            <strong>
              {place.isRankedRecommendation === false
                ? "Not ranked"
                : potentialLabel[place.viewingPotential]}
            </strong>
          </div>
          <div>
            <span>Best for</span>
            <strong>{formatPlaceType(place.type)}</strong>
          </div>
          <div>
            <span>Travel</span>
            <strong>
              {place.distanceFromBaseKm !== undefined
                ? `${Math.round(place.distanceFromBaseKm * 0.621371)} mi from base`
                : "In range"}
            </strong>
          </div>
        </div>

        <div className="plannerResultsPage__spotDetailCoordinates">
          <div>
            <span>Latitude</span>
            <strong>{place.latitude.toFixed(4)}</strong>
          </div>
          <div>
            <span>Longitude</span>
            <strong>{place.longitude.toFixed(4)}</strong>
          </div>
        </div>

        {matchedCameras.length > 0 || matchedHydrophones.length > 0 ? (
          <div className="plannerResultsPage__spotDetailAssets">
            {matchedCameras.length > 0 ? (
              <div className="plannerResultsPage__spotDetailAssetGroup">
                <div className="plannerResultsPage__spotDetailAssetHeading">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    videocam
                  </span>
                  <span>Nearby webcams</span>
                </div>
                {matchedCameras.flatMap((camera) =>
                  camera.feeds.map((feed) => (
                    <div
                      key={feed.id}
                      className="plannerResultsPage__spotDetailAssetCard"
                    >
                      <div>
                        <strong>{feed.name}</strong>
                        <p>
                          {feed.operator} · {camera.waterbody}
                        </p>
                      </div>
                      {safeExternalHref(feed.accessUrl) ? (
                        <a
                          href={safeExternalHref(feed.accessUrl) ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  )),
                )}
              </div>
            ) : null}

            {matchedHydrophones.length > 0 ? (
              <div className="plannerResultsPage__spotDetailAssetGroup">
                <div className="plannerResultsPage__spotDetailAssetHeading">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    graphic_eq
                  </span>
                  <span>Nearby hydrophone</span>
                </div>
                {matchedHydrophones.map((hydrophone) => (
                  <div
                    key={hydrophone.id}
                    className="plannerResultsPage__spotDetailAssetCard"
                  >
                    <div>
                      <strong>{hydrophone.name}</strong>
                      <p>{hydrophone.region}</p>
                    </div>
                    {safeExternalHref(hydrophoneListenUrl) ? (
                      <a
                        href={
                          safeExternalHref(hydrophoneListenUrl) ?? undefined
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Listen
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="plannerResultsPage__spotDetailRecommendation">
          <h4>
            {place.isRankedRecommendation === false
              ? "About this location"
              : "Why it is recommended"}
          </h4>
          <p>
            {place.isRankedRecommendation === false
              ? place.reason
              : "This location overlaps higher-probability forecast waters for your selected window and keeps the trip anchored around accessible Salish Sea viewing points."}
          </p>
        </div>

        <div className="plannerResultsPage__spotDetailActions">
          <button
            type="button"
            className={`plannerResultsPage__spotDetailPrimaryAction${itineraryAdded ? " isAdded" : ""}`}
            onClick={itineraryAdded ? onRemoveFromItinerary : onAddToItinerary}
            aria-pressed={itineraryAdded}
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              {itineraryAdded ? "check_circle" : "playlist_add"}
            </span>
            <span>
              {itineraryAdded ? "Added to itinerary" : "Add to itinerary"}
            </span>
          </button>
          {itineraryAdded ? (
            <button
              type="button"
              className="plannerResultsPage__spotDetailSecondaryAction"
              onClick={onViewItinerary}
            >
              View itinerary
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
