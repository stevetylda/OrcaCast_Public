import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { ForecastMapHandle } from "../../map";
import type { SuggestedPlace, ViewingPotential } from "../../locations/types";
import type { UnitsMode } from "../../../shared/state/MapStateContext";

type SuggestedPlacesPanelProps = {
  places: SuggestedPlace[];
  selectedPlaceId: string | null;
  isLoading?: boolean;
  error?: string | null;
  mapRef: RefObject<ForecastMapHandle | null>;
  unitsMode: UnitsMode;
  onSelectPlace: (place: SuggestedPlace) => void;
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
  return Object.fromEntries(
    places.map((place) => [place.id, cache.get(place.id) ?? ""])
  ) as Record<string, string>;
}

export function SuggestedPlacesPanel({
  places,
  selectedPlaceId,
  isLoading = false,
  error = null,
  mapRef,
  unitsMode: _unitsMode,
  onSelectPlace,
  onLayoutChange,
}: SuggestedPlacesPanelProps) {
  const [closed, setClosed] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlCacheRef = useRef<Map<string, string>>(new Map());
  const panelRef = useRef<HTMLElement | null>(null);
  const countLabel = useMemo(() => {
    if (isLoading) return "Finding places";
    if (places.length === 0) return "No places yet";
    return `${places.length} suggested ${places.length === 1 ? "place" : "places"}`;
  }, [isLoading, places.length]);
  const featuredPlace = places[0] ?? null;
  const listPlaces = featuredPlace ? places.slice(1) : [];

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
    const updateLayout = () => {
      if (!onLayoutChange) return;
      if (closed) {
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
    if (!panelRef.current || !onLayoutChange || closed) return;
    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(panelRef.current);
    window.addEventListener("resize", updateLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [closed, onLayoutChange, places.length]);

  if (closed) {
    return (
      <button
        type="button"
        className="suggestedPlacesPanelReopen"
        onClick={() => {
          setClosed(false);
        }}
        aria-label="Show best places to watch"
      >
        <span className="material-symbols-rounded" aria-hidden="true">
          travel_explore
        </span>
        <span>Best Places</span>
      </button>
    );
  }

  return (
    <aside
      ref={panelRef}
      className="suggestedPlacesPanel"
      aria-label="Best places to watch"
    >
      <header className="suggestedPlacesPanel__header">
        <div className="suggestedPlacesPanel__titleGroup">
          <p className="suggestedPlacesPanel__eyebrow">Today’s outlook</p>
          <h2 className="suggestedPlacesPanel__title">Best Places to Watch</h2>
          <p className="suggestedPlacesPanel__subtle">{countLabel}</p>
        </div>
        <div className="suggestedPlacesPanel__actions">
          <button
            type="button"
            className="suggestedPlacesPanel__iconBtn"
            onClick={() => setClosed(true)}
            aria-label="Close suggested places"
            title="Close"
          >
            <span className="material-symbols-rounded" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      </header>

      <div className="suggestedPlacesPanel__content">
          {isLoading && (
            <div className="suggestedPlacesPanel__status">Ranking nearby places against the forecast…</div>
          )}
          {!isLoading && error && (
            <div className="suggestedPlacesPanel__status suggestedPlacesPanel__status--warning">
              Suggested places are temporarily unavailable.
            </div>
          )}
          {!isLoading && !error && places.length === 0 && (
            <div className="suggestedPlacesPanel__status">
              No nearby POIs matched the current high-activity forecast areas.
            </div>
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
                {previewUrls[featuredPlace.id] ? (
                  <img
                    className="suggestedPlaceHero__image"
                    src={previewUrls[featuredPlace.id]}
                    alt={`Map preview for ${featuredPlace.name}`}
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
                <span className="suggestedPlaceHero__footer">
                  <span className="suggestedPlaceCard__badges" aria-hidden="true">
                    <span className="suggestedPlaceBadge">Map preview</span>
                    {featuredPlace.hasLiveFeed && <span className="suggestedPlaceBadge">Live cam</span>}
                    {featuredPlace.hasHydrophone && <span className="suggestedPlaceBadge">Hydrophone</span>}
                  </span>
                </span>
              </span>
            </button>
          )}

          <div className="suggestedPlacesPanel__list">
            {listPlaces.map((place) => {
              const selected = place.id === selectedPlaceId;
              return (
                <button
                  type="button"
                  className={`suggestedPlaceCard suggestedPlaceCard--${place.viewingPotential}${
                    selected ? " suggestedPlaceCard--selected" : ""
                  }`}
                  key={place.id}
                  onClick={() => onSelectPlace(place)}
                  aria-pressed={selected}
                >
                  <span className="suggestedPlaceCard__media">
                    {previewUrls[place.id] ? (
                      <img
                        className="suggestedPlaceCard__thumb"
                        src={previewUrls[place.id]}
                        alt={`Map preview for ${place.name}`}
                      />
                    ) : (
                      <span className="suggestedPlaceCard__thumb suggestedPlaceCard__thumb--placeholder">
                        <span>Preview</span>
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
                    <span className="suggestedPlaceCard__footer">
                      <span className="suggestedPlaceCard__badges" aria-hidden="true">
                        {place.hasLiveFeed && <span className="suggestedPlaceBadge">Live cam</span>}
                        {place.hasHydrophone && <span className="suggestedPlaceBadge">Hydrophone</span>}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
      </div>
    </aside>
  );
}
