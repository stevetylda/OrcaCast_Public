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
  activeView: "this-week" | "trip-planner";
  open: boolean;
  onClose: () => void;
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

const TRIP_PLANNER_CITIES = ["Seattle", "San Juans", "Port Angeles", "Victoria"] as const;
const TRIP_PLANNER_RESULTS = [
  {
    id: "lime-kiln",
    title: "Lime Kiln Point",
    area: "San Juan Island",
    tag: "Best shore odds",
    potential: "high" as const,
    detail: "Strong shoreline viewing reputation with reliable summer sightlines.",
  },
  {
    id: "cattle-point",
    title: "Cattle Point",
    area: "South San Juan",
    tag: "Sunset window",
    potential: "medium" as const,
    detail: "Good pairing with a day trip when sightings trend along the outer channel.",
  },
  {
    id: "port-townsend",
    title: "Port Townsend waterfront",
    area: "Admiralty Inlet",
    tag: "Closer drive",
    potential: "medium" as const,
    detail: "Often a practical fallback when you want shorter travel from the mainland.",
  },
] as const;

function formatTripDateLabel(value: string) {
  if (!value) return "Jul 1";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Jul 1";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

export function SuggestedPlacesPanel({
  places,
  selectedPlaceId,
  isLoading = false,
  error = null,
  mapRef,
  unitsMode: _unitsMode,
  activeView,
  open,
  onClose,
  onSelectPlace,
  onLayoutChange,
}: SuggestedPlacesPanelProps) {
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripCity, setTripCity] = useState("");
  const [tripLength, setTripLength] = useState("1 day");
  const [tripPlannerSearched, setTripPlannerSearched] = useState(false);
  const previewUrlCacheRef = useRef<Map<string, string>>(new Map());
  const panelRef = useRef<HTMLElement | null>(null);
  const countLabel = useMemo(() => {
    if (isLoading) return "Finding places";
    if (places.length === 0) return "No places yet";
    return `${places.length} suggested ${places.length === 1 ? "place" : "places"}`;
  }, [isLoading, places.length]);
  const featuredPlace = places[0] ?? null;
  const listPlaces = featuredPlace ? places.slice(1) : [];
  const tripCityLabel = tripCity || "Seattle";
  const tripDateLabel = formatTripDateLabel(tripStartDate);

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

  if (!open) return null;

  return (
    <aside
      ref={panelRef}
      className="suggestedPlacesPanel"
      aria-label={activeView === "this-week" ? "This week places to watch" : "Trip planner"}
    >
      <header className="suggestedPlacesPanel__header">
        <div className="suggestedPlacesPanel__titleGroup">
          <p className="suggestedPlacesPanel__eyebrow">
            {activeView === "this-week" ? "This week’s outlook" : "Plan your trip"}
          </p>
          <h2 className="suggestedPlacesPanel__title">
            {activeView === "this-week" ? "This Week" : "Trip Planner"}
          </h2>
          <p className="suggestedPlacesPanel__subtle">
            {activeView === "this-week"
              ? countLabel
              : "Choose dates and an optional starting city for future trip planning."}
          </p>
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

      <div className="suggestedPlacesPanel__content">
        {activeView === "trip-planner" ? (
        <div className="tripPlannerPanel">
          {!tripPlannerSearched ? (
            <section className="tripPlannerPanel__bookingCard" aria-label="Trip planner search">
              <div className="tripPlannerPanel__intro">
                <h3 className="tripPlannerPanel__summaryTitle">Plan Your Trip</h3>
                <p className="tripPlannerPanel__summaryText">
                  Find promising viewing areas based on season, sightings, and travel distance.
                </p>
              </div>

              <label className="tripPlannerField tripPlannerField--wide">
                <span className="tripPlannerField__label">From</span>
                <span className="tripPlannerField__control tripPlannerField__control--hero">
                  <span className="material-symbols-rounded tripPlannerField__icon" aria-hidden="true">
                    location_on
                  </span>
                  <select value={tripCity} onChange={(event) => setTripCity(event.target.value)}>
                    <option value="">From Seattle</option>
                    {TRIP_PLANNER_CITIES.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </span>
              </label>

              <div className="tripPlannerPanel__bookingGrid">
                <label className="tripPlannerField">
                  <span className="tripPlannerField__label">Dates</span>
                  <span className="tripPlannerField__control tripPlannerField__control--hero">
                    <span className="material-symbols-rounded tripPlannerField__icon" aria-hidden="true">
                      calendar_month
                    </span>
                    <input
                      type="date"
                      value={tripStartDate}
                      onChange={(event) => setTripStartDate(event.target.value)}
                    />
                  </span>
                </label>

                <label className="tripPlannerField">
                  <span className="tripPlannerField__label">Trip length</span>
                  <span className="tripPlannerField__control tripPlannerField__control--hero">
                    <span className="material-symbols-rounded tripPlannerField__icon" aria-hidden="true">
                      schedule
                    </span>
                    <select value={tripLength} onChange={(event) => setTripLength(event.target.value)}>
                      <option value="1 day">1 day</option>
                      <option value="2 days">2 days</option>
                      <option value="3 days">3 days</option>
                      <option value="Weekend">Weekend</option>
                    </select>
                  </span>
                </label>
              </div>

              <button
                type="button"
                className="tripPlannerPanel__searchBtn"
                onClick={() => setTripPlannerSearched(true)}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  search
                </span>
                <span>Search Trips</span>
              </button>

              <p className="tripPlannerPanel__footnote">Design-only for now. Search does not run yet.</p>
            </section>
          ) : (
            <>
              <section className="tripPlannerPanel__searchSummary" aria-label="Trip search summary">
                <div className="tripPlannerPanel__searchSummaryText">
                  <span className="tripPlannerPanel__searchSummaryItem">From {tripCityLabel}</span>
                  <span className="tripPlannerPanel__searchSummaryDivider" aria-hidden="true">
                    •
                  </span>
                  <span className="tripPlannerPanel__searchSummaryItem">{tripDateLabel}</span>
                  <span className="tripPlannerPanel__searchSummaryDivider" aria-hidden="true">
                    •
                  </span>
                  <span className="tripPlannerPanel__searchSummaryItem">{tripLength}</span>
                </div>
                <button
                  type="button"
                  className="tripPlannerPanel__editBtn"
                  onClick={() => setTripPlannerSearched(false)}
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    edit
                  </span>
                  <span>Edit</span>
                </button>
              </section>

              <section className="tripPlannerPanel__results" aria-label="Best viewing opportunities">
                <div className="tripPlannerPanel__resultsHeader">
                  <h3 className="tripPlannerPanel__resultsTitle">Best viewing opportunities</h3>
                  <p className="tripPlannerPanel__resultsSubtle">Top mock cards for the post-search layout.</p>
                </div>

                <div className="tripPlannerPanel__resultsList">
                  {TRIP_PLANNER_RESULTS.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className={`suggestedPlaceCard suggestedPlaceCard--${result.potential} tripPlannerResultCard`}
                    >
                      <span className="suggestedPlaceCard__media">
                        <span className="suggestedPlaceCard__thumb suggestedPlaceCard__thumb--placeholder tripPlannerResultCard__thumb">
                          <span className="material-symbols-rounded" aria-hidden="true">
                            travel_explore
                          </span>
                        </span>
                      </span>
                      <span className="suggestedPlaceCard__body">
                        <span className="suggestedPlaceCard__topline">
                          <span className="suggestedPlaceCard__name">{result.title}</span>
                          <span className={`viewingPotentialBadge viewingPotentialBadge--${result.potential}`}>
                            {potentialLabel[result.potential]}
                          </span>
                        </span>
                        <span className="suggestedPlaceCard__meta">
                          <span>{result.area}</span>
                        </span>
                        <span className="suggestedPlaceCard__reason">{result.detail}</span>
                        <span className="suggestedPlaceCard__footer">
                          <span className="suggestedPlaceCard__badges" aria-hidden="true">
                            <span className="suggestedPlaceBadge">{result.tag}</span>
                            <span className="suggestedPlaceBadge">{tripLength}</span>
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </aside>
  );
}
