import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ForecastMapHandle } from "../../map";
import type { SuggestedPlace, ViewingPotential } from "../../locations/types";
import type { UnitsMode } from "../../../shared/state/MapStateContext";
import {
  getViewingSpotPhoto,
  hasApprovedSpotPhoto,
  loadViewingSpotPhotoManifest,
  type ViewingSpotPhotoManifest,
} from "../../../shared/data/viewingSpotPhotos";

type SuggestedPlacesPanelProps = {
  places: SuggestedPlace[];
  selectedPlaceId: string | null;
  isLoading?: boolean;
  error?: string | null;
  mapRef: RefObject<ForecastMapHandle | null>;
  unitsMode: UnitsMode;
  open: boolean;
  onClose: () => void;
  onSelectPlace: (place: SuggestedPlace) => void;
  onClearSelection?: () => void;
  onLayoutChange?: (occupiedWidth: number) => void;
};

const potentialLabel: Record<ViewingPotential, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function formatPlaceType(type: SuggestedPlace["type"]) {
  if (type === "Ferry") return "Ferry terminal";
  return type;
}

function getPlaceTypeIcon(type: SuggestedPlace["type"]) {
  if (type === "Park") return "park";
  if (type === "Marina") return "anchor";
  if (type === "Ferry") return "directions_boat";
  return "place";
}

function buildPreviewUrlMap(places: SuggestedPlace[], cache: Map<string, string>) {
  return Object.fromEntries(places.map((place) => [place.id, cache.get(place.id) ?? ""])) as Record<string, string>;
}

export function SuggestedPlacesPanel({
  places,
  selectedPlaceId,
  isLoading = false,
  error = null,
  mapRef,
  open,
  onClose,
  onSelectPlace,
  onClearSelection,
  onLayoutChange,
}: SuggestedPlacesPanelProps) {
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [photoManifest, setPhotoManifest] = useState<ViewingSpotPhotoManifest>({});
  const previewUrlCacheRef = useRef<Map<string, string>>(new Map());
  const panelRef = useRef<HTMLElement | null>(null);
  const countLabel = useMemo(() => {
    if (isLoading) return "Finding places";
    if (places.length === 0) return "No places yet";
    return `${places.length} suggested ${places.length === 1 ? "place" : "places"}`;
  }, [isLoading, places.length]);
  const featuredPlace = places[0] ?? null;
  const listPlaces = featuredPlace ? places.slice(1) : [];
  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId]
  );
  const showingDetail = selectedPlace !== null;

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
          zoom: featuredPlace?.id === place.id ? 11.8 : 11.3,
          width: featuredPlace?.id === place.id ? 720 : 280,
          height: featuredPlace?.id === place.id ? 320 : 190,
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
  }, [featuredPlace?.id, mapRef, places]);

  useEffect(
    () => () => {
      previewUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlCacheRef.current.clear();
    },
    []
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
        onLayoutChange(0);
        return;
      }
      if (typeof window !== "undefined" && window.innerWidth <= 760) {
        onLayoutChange(0);
        return;
      }
      const panelWidth = panelRef.current?.offsetWidth ?? 0;
      const gutter = panelWidth > 0 ? 32 : 0;
      onLayoutChange(panelWidth + gutter);
    };

    updateLayout();
    if (!panelRef.current || !onLayoutChange) return;
    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(panelRef.current);
    window.addEventListener("resize", updateLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [onLayoutChange, open, places.length]);

  useEffect(() => {
    const content = panelRef.current?.querySelector<HTMLElement>(".suggestedPlacesPanel__content");
    if (content) content.scrollTop = 0;
  }, [showingDetail]);

  if (!open) return null;

  const featuredPlacePhoto = featuredPlace ? getViewingSpotPhoto(featuredPlace.spotId, photoManifest) : undefined;
  const featuredPlaceImageSrc = featuredPlace
    ? hasApprovedSpotPhoto(featuredPlacePhoto)
      ? featuredPlacePhoto?.imageSrc
      : previewUrls[featuredPlace.id]
    : undefined;
  const featuredPlaceImageAlt = featuredPlace
    ? hasApprovedSpotPhoto(featuredPlacePhoto)
      ? featuredPlacePhoto?.alt ?? featuredPlace.name
      : `Map preview for ${featuredPlace.name}`
    : undefined;
  const featuredPlaceImagePosition =
    featuredPlace && hasApprovedSpotPhoto(featuredPlacePhoto) ? featuredPlacePhoto?.focalPoint ?? "50% 50%" : undefined;

  return (
    <aside ref={panelRef} className="suggestedPlacesPanel" aria-label="This week places to watch">
      <header className="suggestedPlacesPanel__header">
        <div className="suggestedPlacesPanel__titleGroup">
          <p className="suggestedPlacesPanel__eyebrow">This week’s outlook</p>
          <h2 className="suggestedPlacesPanel__title">This Week</h2>
          <p className="suggestedPlacesPanel__subtle">{countLabel}</p>
        </div>
        <div className="suggestedPlacesPanel__actions">
          <button
            type="button"
            className="suggestedPlacesPanel__iconBtn"
            onClick={onClose}
            aria-label="Close panel"
            title="Close"
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      </header>

      <div className="suggestedPlacesPanel__content suggestedPlacesPanel__content--flip">
        <div className={`suggestedPlacesPanel__flipScene${showingDetail ? " isDetail" : ""}`}>
          <section className="suggestedPlacesPanel__face suggestedPlacesPanel__face--front" aria-hidden={showingDetail}>
            {isLoading && <div className="suggestedPlacesPanel__status">Ranking nearby places against the forecast…</div>}
            {!isLoading && error && (
              <div className="suggestedPlacesPanel__status suggestedPlacesPanel__status--warning">
                Suggested places are temporarily unavailable.
              </div>
            )}
            {!isLoading && !error && places.length === 0 && (
              <div className="suggestedPlacesPanel__status">No nearby POIs matched the current high-activity forecast areas.</div>
            )}

            {featuredPlace && (
              <button
                type="button"
                className={`suggestedPlaceHero suggestedPlaceHero--${featuredPlace.viewingPotential}${
                  featuredPlace.id === selectedPlaceId ? " suggestedPlaceHero--selected" : ""
                }`}
                onClick={() => onSelectPlace(featuredPlace)}
                aria-pressed={featuredPlace.id === selectedPlaceId}
              >
                <span className="suggestedPlaceHero__media">
                  {featuredPlaceImageSrc ? (
                    <img
                      className="suggestedPlaceHero__image"
                      src={featuredPlaceImageSrc}
                      alt={featuredPlaceImageAlt}
                      loading="lazy"
                      style={featuredPlaceImagePosition ? { objectPosition: featuredPlaceImagePosition } : undefined}
                    />
                  ) : (
                    <span className="suggestedPlaceHero__imagePlaceholder">Rendering map preview…</span>
                  )}
                  <span className="suggestedPlaceHero__flag">Best bet</span>
                  <span
                    className={`viewingPotentialBadge viewingPotentialBadge--${featuredPlace.viewingPotential} suggestedPlaceHero__badge`}
                  >
                    {potentialLabel[featuredPlace.viewingPotential]}
                  </span>
                </span>
                <span className="suggestedPlaceHero__body">
                  <span className="suggestedPlaceHero__title">{featuredPlace.name}</span>
                  <span className="suggestedPlaceHero__meta">
                    <span className={`suggestedPlaceType suggestedPlaceType--${featuredPlace.type.toLowerCase()}`}>
                      <span className="material-symbols-rounded suggestedPlaceType__icon" aria-hidden="true">
                        {getPlaceTypeIcon(featuredPlace.type)}
                      </span>
                      <span>{formatPlaceType(featuredPlace.type)}</span>
                    </span>
                    {featuredPlace.region && <span>{featuredPlace.region}</span>}
                  </span>
                  <span className="suggestedPlaceHero__reason">{featuredPlace.reason}</span>
                </span>
              </button>
            )}

            {listPlaces.length > 0 && (
              <div className="suggestedPlacesPanel__list">
                {listPlaces.map((place) => (
                  (() => {
                    const photo = getViewingSpotPhoto(place.spotId, photoManifest);
                    const imageSrc = hasApprovedSpotPhoto(photo) ? photo?.imageSrc : previewUrls[place.id];
                    const imageAlt = hasApprovedSpotPhoto(photo) ? photo?.alt ?? place.name : `Map preview for ${place.name}`;
                    const imagePosition = hasApprovedSpotPhoto(photo) ? photo?.focalPoint ?? "50% 50%" : undefined;

                    return (
                      <button
                        key={place.id}
                        type="button"
                        className={`suggestedPlaceCard suggestedPlaceCard--${place.viewingPotential}${
                          place.id === selectedPlaceId ? " suggestedPlaceCard--selected" : ""
                        }`}
                        onClick={() => onSelectPlace(place)}
                        aria-pressed={place.id === selectedPlaceId}
                      >
                        <span className="suggestedPlaceCard__media">
                          {imageSrc ? (
                            <img
                              className="suggestedPlaceCard__thumb"
                              src={imageSrc}
                              alt={imageAlt}
                              loading="lazy"
                              style={imagePosition ? { objectPosition: imagePosition } : undefined}
                            />
                          ) : (
                            <span className="suggestedPlaceCard__thumb suggestedPlaceCard__thumb--placeholder">
                              <span className="material-symbols-rounded" aria-hidden="true">
                                map
                              </span>
                            </span>
                          )}
                        </span>
                        <span className="suggestedPlaceCard__body">
                          <span className="suggestedPlaceCard__topline">
                            <span className="suggestedPlaceCard__name">{place.name}</span>
                            <span className={`viewingPotentialBadge viewingPotentialBadge--${place.viewingPotential}`}>
                              {potentialLabel[place.viewingPotential]}
                            </span>
                          </span>
                          <span className="suggestedPlaceCard__meta">
                            <span className={`suggestedPlaceType suggestedPlaceType--${place.type.toLowerCase()}`}>
                              <span className="material-symbols-rounded suggestedPlaceType__icon" aria-hidden="true">
                                {getPlaceTypeIcon(place.type)}
                              </span>
                              <span>{formatPlaceType(place.type)}</span>
                            </span>
                            {place.region && <span>{place.region}</span>}
                          </span>
                          <span className="suggestedPlaceCard__reason">{place.reason}</span>
                        </span>
                      </button>
                    );
                  })()
                ))}
              </div>
            )}
          </section>

          <section className="suggestedPlacesPanel__face suggestedPlacesPanel__face--back" aria-hidden={!showingDetail}>
            {selectedPlace && (
              <div className="suggestedPlaceDetail">
                <div className="suggestedPlaceDetail__topRow">
                  <button
                    type="button"
                    className="suggestedPlaceDetail__backBtn"
                    onClick={() => onClearSelection?.()}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">
                      keyboard_backspace
                    </span>
                    <span>Return to top places</span>
                  </button>
                </div>

                <div className="suggestedPlaceDetail__media">
                  {(() => {
                    const photo = getViewingSpotPhoto(selectedPlace.spotId, photoManifest);
                    const imageSrc = hasApprovedSpotPhoto(photo) ? photo?.imageSrc : previewUrls[selectedPlace.id];
                    const imageAlt = hasApprovedSpotPhoto(photo) ? photo?.alt ?? selectedPlace.name : `Map preview for ${selectedPlace.name}`;
                    const imagePosition = hasApprovedSpotPhoto(photo) ? photo?.focalPoint ?? "50% 50%" : undefined;

                    return imageSrc ? (
                    <img
                      className="suggestedPlaceDetail__image"
                      src={imageSrc}
                      alt={imageAlt}
                      loading="lazy"
                      style={imagePosition ? { objectPosition: imagePosition } : undefined}
                    />
                  ) : (
                    <span className="suggestedPlaceHero__imagePlaceholder">Rendering map preview…</span>
                    );
                  })()}
                </div>

                <div className="suggestedPlaceDetail__body">
                  <h3 className="suggestedPlaceDetail__title">{selectedPlace.name}</h3>
                  <p className="suggestedPlaceDetail__coords">
                    {selectedPlace.latitude.toFixed(4)}, {selectedPlace.longitude.toFixed(4)}
                  </p>

                  <div className="suggestedPlaceDetail__info">
                    <div className="suggestedPlaceDetail__infoRow">
                      <span className="suggestedPlaceDetail__infoLabel">Region</span>
                      <span className="suggestedPlaceDetail__infoValue">{selectedPlace.region ?? "San Juan region"}</span>
                    </div>
                    <div className="suggestedPlaceDetail__infoRow">
                      <span className="suggestedPlaceDetail__infoLabel">Access</span>
                      <span className="suggestedPlaceDetail__infoValue">Placeholder shoreline access notes</span>
                    </div>
                    <div className="suggestedPlaceDetail__infoRow">
                      <span className="suggestedPlaceDetail__infoLabel">Amenities</span>
                      <span className="suggestedPlaceDetail__infoValue">Placeholder parking, restrooms, and viewpoint info</span>
                    </div>
                    <div className="suggestedPlaceDetail__infoRow">
                      <span className="suggestedPlaceDetail__infoLabel">Viewing notes</span>
                      <span className="suggestedPlaceDetail__infoValue">{selectedPlace.reason}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </aside>
  );
}
