import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ForecastMapHandle } from "../../map";
import type {
  SuggestedPlace,
  ViewingPotential,
  WebcamSite,
} from "../../locations/types";
import type { OrcasoundHydrophone } from "../../../shared/data/orcasoundHydrophones";
import { MediaLocationDetail } from "../../../shared/components/MediaLocationDetail";
import { PlannerPlaceCard } from "../../planner/components/PlannerPlaces";
import {
  getViewingSpotPhoto,
  hasApprovedSpotPhoto,
  loadViewingSpotPhotoManifest,
  type ViewingSpotPhotoManifest,
} from "../../../shared/data/viewingSpotPhotos";

type PlaceFilter = "top" | "shore" | "Park" | "Marina" | "Ferry";

type SuggestedPlacesPanelProps = {
  places: SuggestedPlace[];
  selectedPlaceId: string | null;
  selectedWebcam?: WebcamSite | null;
  selectedHydrophone?: OrcasoundHydrophone | null;
  hydrophoneListenUrl?: string;
  isLoading?: boolean;
  isPlaybackActive?: boolean;
  error?: string | null;
  mapRef: RefObject<ForecastMapHandle | null>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelectPlace: (place: SuggestedPlace) => void;
  onClearSelection?: () => void;
  onClearMediaSelection?: () => void;
  itineraryPlaceIds?: string[];
  onAddToItinerary?: (place: SuggestedPlace) => void;
  onRemoveFromItinerary?: (place: SuggestedPlace) => void;
  onLayoutChange?: (occupiedWidth: number) => void;
  isItineraryMapView?: boolean;
  onShowTopPlaces?: () => void;
};

const potentialLabel: Record<ViewingPotential, string> = {
  "very-high": "Very High",
  high: "High",
  medium: "Medium",
  low: "Low",
  "very-low": "Very Low",
};

const FILTERS: ReadonlyArray<{ id: PlaceFilter; label: string }> = [
  { id: "top", label: "Top picks" },
  { id: "shore", label: "Shore" },
  { id: "Ferry", label: "Ferry" },
  { id: "Marina", label: "Marina" },
  { id: "Park", label: "Park" },
];

function formatPlaceType(type: SuggestedPlace["type"]) {
  if (type === "Ferry") return "Ferry terminal";
  return type;
}

function buildPreviewUrlMap(
  places: SuggestedPlace[],
  cache: Map<string, string>,
) {
  return Object.fromEntries(
    places.map((place) => [place.id, cache.get(place.id) ?? ""]),
  ) as Record<string, string>;
}

function getPlaceImage(
  place: SuggestedPlace,
  photoManifest: ViewingSpotPhotoManifest,
  previewUrls: Record<string, string>,
) {
  const photo = getViewingSpotPhoto(place.spotId, photoManifest);
  const approvedPhoto = hasApprovedSpotPhoto(photo);
  return {
    src: approvedPhoto ? photo?.imageSrc : previewUrls[place.id],
    alt: approvedPhoto
      ? (photo?.alt ?? place.name)
      : `Map preview for ${place.name}`,
    objectPosition: approvedPhoto
      ? (photo?.focalPoint ?? "50% 50%")
      : undefined,
  };
}

export function SuggestedPlacesPanel({
  places,
  selectedPlaceId,
  selectedWebcam = null,
  selectedHydrophone = null,
  hydrophoneListenUrl,
  isLoading = false,
  isPlaybackActive = false,
  error = null,
  mapRef,
  open,
  onOpen,
  onClose,
  onSelectPlace,
  onClearSelection,
  onClearMediaSelection,
  itineraryPlaceIds = [],
  onAddToItinerary,
  onRemoveFromItinerary,
  onLayoutChange,
  isItineraryMapView = false,
  onShowTopPlaces,
}: SuggestedPlacesPanelProps) {
  const [activeFilter, setActiveFilter] = useState<PlaceFilter>("top");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [photoManifest, setPhotoManifest] = useState<ViewingSpotPhotoManifest>(
    {},
  );
  const previewUrlCacheRef = useRef<Map<string, string>>(new Map());
  const panelRef = useRef<HTMLElement | null>(null);

  const filteredPlaces = useMemo(() => {
    if (activeFilter === "top") return places;
    if (activeFilter === "shore")
      return places.filter((place) => place.type !== "Ferry");
    return places.filter((place) => place.type === activeFilter);
  }, [activeFilter, places]);

  const countLabel = useMemo(() => {
    if (isLoading) return "Finding field picks";
    if (places.length === 0) return "No field picks yet";
    return `${places.length} recommended ${places.length === 1 ? "place" : "places"}`;
  }, [isLoading, places.length]);

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  );
  const showingDetail =
    selectedPlace !== null ||
    selectedWebcam !== null ||
    selectedHydrophone !== null;

  useEffect(() => {
    setPreviewUrls(buildPreviewUrlMap(places, previewUrlCacheRef.current));
  }, [places]);

  useEffect(() => {
    let cancelled = false;

    const loadPreviews = async () => {
      if (places.length === 0) return;
      const map = mapRef.current;
      if (!map) return;

      for (const place of places) {
        if (cancelled || previewUrlCacheRef.current.has(place.id)) continue;
        const blob = await map.capturePlacePreview({
          center: [place.longitude, place.latitude],
          zoom: 11.4,
          width: 360,
          height: 220,
        });
        if (cancelled || !blob) continue;
        const url = URL.createObjectURL(blob);
        previewUrlCacheRef.current.set(place.id, url);
        setPreviewUrls(buildPreviewUrlMap(places, previewUrlCacheRef.current));
      }
    };

    void loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [mapRef, places]);

  useEffect(
    () => () => {
      previewUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlCacheRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    loadViewingSpotPhotoManifest()
      .then((manifest) => {
        if (!cancelled) setPhotoManifest(manifest);
      })
      .catch(() => {
        if (!cancelled) setPhotoManifest({});
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const updateLayout = () => {
      if (!onLayoutChange) return;
      if (!open) {
        const compactPanelReservation =
          typeof window !== "undefined" && window.innerWidth <= 1180
            ? 408
            : 448;
        onLayoutChange(
          typeof window !== "undefined" && window.innerWidth > 900
            ? compactPanelReservation
            : 0,
        );
        return;
      }
      if (typeof window !== "undefined" && window.innerWidth <= 900) {
        onLayoutChange(0);
        return;
      }
      const panelWidth = panelRef.current?.offsetWidth ?? 0;
      const gutter = panelWidth > 0 ? 38 : 0;
      onLayoutChange(panelWidth + gutter);
    };

    updateLayout();
    if (!panelRef.current || !onLayoutChange || !open) return;
    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(panelRef.current);
    window.addEventListener("resize", updateLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [onLayoutChange, open, places.length]);

  useEffect(() => {
    const content = panelRef.current?.querySelector<HTMLElement>(
      ".suggestedPlacesPanel__content",
    );
    if (content) content.scrollTop = 0;
  }, [activeFilter, showingDetail]);

  if (!open) {
    return (
      <button
        type="button"
        className="thisWeekFieldNotebook"
        onClick={onOpen}
        aria-label="Expand recommended places"
        aria-expanded="false"
      >
        <span className="thisWeekFieldNotebook__graphic" aria-hidden="true">
          <span className="thisWeekFieldNotebook__page" />
          <span className="thisWeekFieldNotebook__ring thisWeekFieldNotebook__ring--one" />
          <span className="thisWeekFieldNotebook__ring thisWeekFieldNotebook__ring--two" />
          <span className="thisWeekFieldNotebook__ring thisWeekFieldNotebook__ring--three" />
          <span className="thisWeekFieldNotebook__ring thisWeekFieldNotebook__ring--four" />
        </span>
        <span className="thisWeekFieldNotebook__label">Field picks</span>
        <span className="thisWeekFieldNotebook__count">{places.length}</span>
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      className={`suggestedPlacesPanel${showingDetail ? " isDetailOpen" : ""}`}
      aria-label="This week recommended places"
    >
      <div className="suggestedPlacesPanel__panel">
        <section
          className="suggestedPlacesPanel__face suggestedPlacesPanel__face--front"
          aria-hidden={showingDetail}
        >
          <header className="suggestedPlacesPanel__header">
            <div
              className="suggestedPlacesPanel__headerIcon"
              aria-hidden="true"
            >
              <img src="/images/icons/binoculars_recreated.svg" alt="" />
            </div>
            <div className="suggestedPlacesPanel__titleGroup">
              <p className="suggestedPlacesPanel__eyebrow">
                Recommended places
              </p>
              <h2 className="suggestedPlacesPanel__title">
                Field Picks <span>{places.length}</span>
              </h2>
              <p className="suggestedPlacesPanel__subtle">{countLabel}</p>
            </div>
            <div className="suggestedPlacesPanel__headerActions">
              <button
                type="button"
                className={`suggestedPlacesPanel__iconBtn${isItineraryMapView ? " isMapFilterActive" : ""}`}
                onClick={onShowTopPlaces}
                aria-label="Show top 25 field picks on map"
                title="Show Top 25 on map"
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  visibility
                </span>
              </button>
              <button
                type="button"
                className="suggestedPlacesPanel__iconBtn"
                onClick={onClose}
                aria-label="Collapse recommended places"
                title="Collapse"
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  expand_more
                </span>
              </button>
            </div>
          </header>

          {!isPlaybackActive ? (
            <div
              className="suggestedPlacesPanel__filters"
              role="group"
              aria-label="Filter recommended places"
            >
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={activeFilter === filter.id ? "isActive" : ""}
                  aria-pressed={activeFilter === filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          ) : null}

          <div
            className="suggestedPlacesPanel__content"
            role="region"
            aria-label="Recommended places"
            tabIndex={0}
          >
            {isPlaybackActive ? (
              <div
                className="suggestedPlacesPanel__playbackSpinner"
                role="status"
                aria-label="Playing weekly forecast"
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  progress_activity
                </span>
              </div>
            ) : isLoading ? (
              <div className="suggestedPlacesPanel__status">
                <span className="material-symbols-rounded" aria-hidden="true">
                  travel_explore
                </span>
                <span>
                  <strong>Scouting this week’s field picks…</strong>
                  <small>
                    Ranking accessible places against the selected forecast
                    surface.
                  </small>
                </span>
              </div>
            ) : error ? (
              <div className="suggestedPlacesPanel__status suggestedPlacesPanel__status--warning">
                <span className="material-symbols-rounded" aria-hidden="true">
                  cloud_off
                </span>
                <span>
                  <strong>Recommendations are temporarily unavailable.</strong>
                  <small>
                    The forecast map remains available while the place list
                    reloads.
                  </small>
                </span>
              </div>
            ) : filteredPlaces.length === 0 ? (
              <div className="suggestedPlacesPanel__status">
                <span className="material-symbols-rounded" aria-hidden="true">
                  location_searching
                </span>
                <span>
                  <strong>No places match this filter.</strong>
                  <small>Try Top picks or another access type.</small>
                </span>
              </div>
            ) : (
              <div className="suggestedPlacesPanel__list suggestedPlacesPanel__list--plannerCards">
                {filteredPlaces.map((place, index) => (
                  <PlannerPlaceCard
                    key={place.id}
                    place={place}
                    rank={index + 1}
                    photoManifest={photoManifest}
                    itineraryAdded={itineraryPlaceIds.includes(place.id)}
                    onAddToItinerary={() => onAddToItinerary?.(place)}
                    onRemoveFromItinerary={() => onRemoveFromItinerary?.(place)}
                    selected={place.id === selectedPlaceId}
                    onShowOnMap={() => onSelectPlace(place)}
                    onViewDetails={() => onSelectPlace(place)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section
          className="suggestedPlacesPanel__face suggestedPlacesPanel__face--back"
          aria-hidden={!showingDetail}
        >
          {selectedPlace ? (
            <div className="thisWeekPlaceDetail">
              <div className="thisWeekPlaceDetail__header">
                <button
                  type="button"
                  className="thisWeekPlaceDetail__back"
                  onClick={() => onClearSelection?.()}
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    arrow_back
                  </span>
                  Back to field picks
                </button>
                <button
                  type="button"
                  className="suggestedPlacesPanel__iconBtn"
                  onClick={onClose}
                  aria-label="Collapse recommended places"
                  title="Collapse"
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    expand_more
                  </span>
                </button>
              </div>

              {(() => {
                const image = getPlaceImage(
                  selectedPlace,
                  photoManifest,
                  previewUrls,
                );
                return (
                  <div className="thisWeekPlaceDetail__media">
                    {image.src ? (
                      <img
                        src={image.src}
                        alt={image.alt}
                        loading="lazy"
                        style={
                          image.objectPosition
                            ? { objectPosition: image.objectPosition }
                            : undefined
                        }
                      />
                    ) : (
                      <span className="thisWeekPlaceCard__placeholder">
                        <span
                          className="material-symbols-rounded"
                          aria-hidden="true"
                        >
                          map
                        </span>
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="thisWeekPlaceDetail__body">
                <p className="suggestedPlacesPanel__eyebrow">
                  Location details
                </p>
                <div className="thisWeekPlaceDetail__titleRow">
                  <div>
                    <h3>{selectedPlace.name}</h3>
                    <p>{selectedPlace.region ?? "Salish Sea"}</p>
                  </div>
                  <span
                    className={`viewingPotentialBadge viewingPotentialBadge--${selectedPlace.viewingPotential}`}
                  >
                    {potentialLabel[selectedPlace.viewingPotential]}
                  </span>
                </div>

                <div className="thisWeekPlaceDetail__stats">
                  <div>
                    <span>Outlook</span>
                    <strong>
                      {potentialLabel[selectedPlace.viewingPotential]}
                    </strong>
                  </div>
                  <div>
                    <span>Access</span>
                    <strong>{formatPlaceType(selectedPlace.type)}</strong>
                  </div>
                  <div>
                    <span>Region</span>
                    <strong>{selectedPlace.region ?? "Salish Sea"}</strong>
                  </div>
                </div>

                <div className="thisWeekPlaceDetail__recommendation">
                  <h4>Why it is recommended</h4>
                  <p>{selectedPlace.reason}</p>
                </div>

                <div className="thisWeekPlaceDetail__coordinates">
                  <span>{selectedPlace.latitude.toFixed(4)}</span>
                  <span>{selectedPlace.longitude.toFixed(4)}</span>
                </div>

                <button
                  type="button"
                  className="thisWeekPlaceDetail__mapButton"
                  onClick={() => {
                    onSelectPlace(selectedPlace);
                    mapRef.current?.fitLocations(
                      [[selectedPlace.longitude, selectedPlace.latitude]],
                      {
                        padding: { top: 70, right: 70, bottom: 110, left: 70 },
                        maxZoom: 13,
                      },
                    );
                  }}
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    my_location
                  </span>
                  Center on map
                </button>
                <button
                  type="button"
                  className={`thisWeekPlaceDetail__itineraryButton${itineraryPlaceIds.includes(selectedPlace.id) ? " isAdded" : ""}`}
                  onClick={() =>
                    itineraryPlaceIds.includes(selectedPlace.id)
                      ? onRemoveFromItinerary?.(selectedPlace)
                      : onAddToItinerary?.(selectedPlace)
                  }
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    playlist_add
                  </span>
                  {itineraryPlaceIds.includes(selectedPlace.id)
                    ? "Added to itinerary"
                    : "Add to itinerary"}
                </button>
              </div>
            </div>
          ) : selectedWebcam || selectedHydrophone ? (
            <MediaLocationDetail
              webcam={selectedWebcam}
              hydrophone={selectedHydrophone}
              hydrophoneListenUrl={hydrophoneListenUrl}
              onBack={() => onClearMediaSelection?.()}
              onClose={onClose}
              onCenterMap={() => {
                const location = selectedWebcam ?? selectedHydrophone;
                if (!location) return;
                mapRef.current?.fitLocations(
                  [[location.longitude, location.latitude]],
                  {
                    padding: { top: 70, right: 70, bottom: 110, left: 70 },
                    maxZoom: 13,
                  },
                );
              }}
            />
          ) : null}
        </section>
      </div>
    </aside>
  );
}
