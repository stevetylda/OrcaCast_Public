import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ForecastMap, type ForecastMapHandle, type ForecastMapProps } from "../../features/map";
import { appConfig } from "../../shared/config/appConfig";
import { AppHeader } from "../../shared/components/AppHeader";
import {
  aggregateTripPlannerOccurrence,
  buildTripPlannerRangeFromDates,
  dayIsInTripRange,
  loadTripPlannerOccurrencePayload,
  type TripPlannerHistogramBin,
  type TripPlannerOccurrenceResult,
} from "../../shared/data/tripPlanner";
import { loadPlannerBaseLocations, type PlannerBaseLocation } from "../../shared/data/plannerBaseLocations";
import {
  getViewingSpotPhoto,
  hasApprovedSpotPhoto,
  loadViewingSpotPhotoManifest,
  type ViewingSpotPhotoManifest,
} from "../../shared/data/viewingSpotPhotos";
import { useMenu } from "../../shared/state/MenuContext";
import { useMapState } from "../../shared/state/MapStateContext";
import { useSuggestedPlaces } from "../../features/watch/hooks/useSuggestedPlaces";
import type { SuggestedPlace, ViewingPotential } from "../../features/locations/types";
import { isoWeekFromDate, isoWeekYearFromDate } from "../../shared/time/forecastPeriodToIsoWeek";
import { PALETTES } from "../../shared/geo/palettes";
import { H3ResolutionPill } from "../../features/watch/components/H3ResolutionPill";

const InfoModal = lazy(() => import("../../shared/components/InfoModal").then((m) => ({ default: m.InfoModal })));

const DEFAULT_RECOMMENDED_SPOTS_COUNT = 25;
const TRIP_BRUSH_DAYS = 366;
const MAX_TRIP_LENGTH_DAYS = 366;
const TRIP_BRUSH_APPLY_DELAY_MS = 2000;

const LEGEND_LABELS = ["Very High", "High", "Medium", "Low", "Very Low"] as const;

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

type TripPlanSelection = {
  city: string;
  arrivalDate: string;
  departureDate: string;
  maxTravelDistanceMiles?: number;
};

type TripPlannerDraft = {
  city: string;
  arrivalDate: string;
  departureDate: string;
  maxTravelDistance: string;
};

const PLANNER_SELECTION_STORAGE_KEY = "orcacast.planner.selection";
const PLANNER_OPEN_STORAGE_KEY = "orcacast.planner.open";
const PLANNER_DRAFT_STORAGE_KEY = "orcacast.planner.draft";
const PLANNER_RECOMMENDED_PLACES_STORAGE_KEY = "orcacast.planner.recommended-places";

function clearStoredPlannerState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PLANNER_SELECTION_STORAGE_KEY);
  window.sessionStorage.removeItem(PLANNER_OPEN_STORAGE_KEY);
  window.sessionStorage.removeItem(PLANNER_DRAFT_STORAGE_KEY);
  window.sessionStorage.removeItem(PLANNER_RECOMMENDED_PLACES_STORAGE_KEY);
}

type StoredPlannerRecommendedPlaces = {
  signature: string;
  places: SuggestedPlace[];
};

function pickLegendColors(colors: string[], colorNoData = false) {
  if (colors.length === 0) return ["#08364F", "#0B718D", "#278AA2", "#8EB5BD", "#D7E1DF"];
  const highToLowStops = colorNoData ? [1, 0.8, 0.6, 0.4, 0.2, 0] : [1, 0.75, 0.5, 0.25, 0];
  const sampled = highToLowStops.map((stop) => {
    const index = Math.max(0, Math.min(colors.length - 1, Math.round(stop * (colors.length - 1))));
    return colors[index];
  });
  return colorNoData ? sampled.slice(0, 5) : sampled;
}

function readStoredPlannerSelection(): TripPlanSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PLANNER_SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TripPlanSelection> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.arrivalDate !== "string" || typeof parsed.departureDate !== "string") return null;
    return {
      city: typeof parsed.city === "string" ? parsed.city : "",
      arrivalDate: parsed.arrivalDate,
      departureDate: parsed.departureDate,
      maxTravelDistanceMiles:
        typeof parsed.maxTravelDistanceMiles === "number" && Number.isFinite(parsed.maxTravelDistanceMiles)
          ? parsed.maxTravelDistanceMiles
          : undefined,
    };
  } catch {
    return null;
  }
}

function readStoredPlannerOpen(defaultValue: boolean) {
  if (typeof window === "undefined") return defaultValue;
  const stored = window.sessionStorage.getItem(PLANNER_OPEN_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return defaultValue;
}

function readStoredPlannerDraft(): TripPlannerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PLANNER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TripPlannerDraft> | null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      city: typeof parsed.city === "string" ? parsed.city : "",
      arrivalDate: typeof parsed.arrivalDate === "string" ? parsed.arrivalDate : "",
      departureDate: typeof parsed.departureDate === "string" ? parsed.departureDate : "",
      maxTravelDistance: typeof parsed.maxTravelDistance === "string" ? parsed.maxTravelDistance : "",
    };
  } catch {
    return null;
  }
}

function isSuggestedPlace(value: unknown): value is SuggestedPlace {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SuggestedPlace>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.spotId === "string" &&
    typeof candidate.name === "string" &&
    (candidate.region === undefined || typeof candidate.region === "string") &&
    (candidate.type === "Park" || candidate.type === "Marina" || candidate.type === "Ferry" || candidate.type === "Other") &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    (candidate.viewingPotential === "low" || candidate.viewingPotential === "medium" || candidate.viewingPotential === "high") &&
    Number.isFinite(candidate.score) &&
    typeof candidate.reason === "string" &&
    (candidate.distanceKm === undefined || Number.isFinite(candidate.distanceKm))
  );
}

function buildRecommendedPlacesSignature(selection: TripPlanSelection | null, resolution: string) {
  if (!selection) return "";
  return JSON.stringify({
    city: selection.city,
    arrivalDate: selection.arrivalDate,
    departureDate: selection.departureDate,
    maxTravelDistanceMiles: selection.maxTravelDistanceMiles ?? null,
    resolution,
    limit: DEFAULT_RECOMMENDED_SPOTS_COUNT,
  });
}

function readStoredRecommendedPlaces(signature: string): SuggestedPlace[] {
  if (typeof window === "undefined" || !signature) return [];
  try {
    const raw = window.sessionStorage.getItem(PLANNER_RECOMMENDED_PLACES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredPlannerRecommendedPlaces> | null;
    if (!parsed || parsed.signature !== signature || !Array.isArray(parsed.places)) return [];
    return parsed.places.filter(isSuggestedPlace);
  } catch {
    return [];
  }
}

type WeekBar = {
  index: number;
  label: string;
  count: number;
  highlighted: boolean;
};

type ChartBar = WeekBar & {
  dayOfYear: number;
};

type AxisTick = {
  index: number;
  label: string;
  sublabel?: string;
};

type MonthBand = {
  label: string;
  startIndex: number;
  span: number;
};

type TripBrushMode = "move" | "start" | "end";

type TripWindowSegment = {
  key: string;
  style: CSSProperties;
  showLabel: boolean;
  handleStart: boolean;
  handleEnd: boolean;
};

type TripBrushDragState = {
  mode: TripBrushMode;
  pointerId: number;
  startX: number;
  initialSelection: TripPlanSelection;
};

type ChartZoomMode = "weekly" | "daily";

function formatDisplayDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const startLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(end);
  return `${startLabel} – ${endLabel}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function rasterizeSvgToPngBlob(svgMarkup: string, width: number, height: number) {
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("Card image could not be rendered."));
      next.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas context not available.");
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png");
    });
    if (!blob) throw new Error("Card image could not be generated.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function parseIsoDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildRadiusFitLocations(latitude: number, longitude: number, radiusMiles: number): Array<[number, number]> {
  const kilometers = radiusMiles * 1.60934;
  const latRadians = (latitude * Math.PI) / 180;
  const kmPerDegreeLat = 110.574;
  const kmPerDegreeLon = 111.32 * Math.cos(latRadians);
  if (!Number.isFinite(kmPerDegreeLon) || Math.abs(kmPerDegreeLon) < 0.0001) {
    return [[longitude, latitude]];
  }

  const latOffset = kilometers / kmPerDegreeLat;
  const lonOffset = kilometers / kmPerDegreeLon;

  return [
    [longitude, latitude + latOffset],
    [longitude + lonOffset, latitude],
    [longitude, latitude - latOffset],
    [longitude - lonOffset, latitude],
  ];
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function clampTripLength(start: Date, end: Date) {
  const earliestStart = addUtcDays(end, -(MAX_TRIP_LENGTH_DAYS - 1));
  if (start.getTime() < earliestStart.getTime()) return earliestStart;
  return start;
}

function buildPreviewUrlMap(places: SuggestedPlace[], cache: Map<string, string>) {
  return Object.fromEntries(places.map((place) => [place.id, cache.get(place.id) ?? ""])) as Record<string, string>;
}

function toWeekBars(histogram: TripPlannerHistogramBin[], highlightedDays: Set<number>) {
  const counts = Array.from({ length: 53 }, (_, index) => ({
    index,
    count: 0,
    highlighted: false,
  }));
  histogram.forEach((row) => {
    const day = Math.max(1, Math.min(366, Number(row.day_of_year)));
    const weekIndex = Math.min(52, Math.floor((day - 1) / 7));
    counts[weekIndex].count += Number(row.count) || 0;
    if (highlightedDays.has(day)) counts[weekIndex].highlighted = true;
  });

  return counts.map((entry) => ({
    ...entry,
    label:
      entry.index === 0
        ? "Jan"
        : entry.index === 4
          ? "Feb"
          : entry.index === 8
            ? "Mar"
            : entry.index === 13
              ? "Apr"
              : entry.index === 17
                ? "May"
                : entry.index === 21
                  ? "Jun"
                  : entry.index === 26
                    ? "Jul"
                    : entry.index === 30
                      ? "Aug"
                      : entry.index === 35
                        ? "Sep"
                        : entry.index === 39
                          ? "Oct"
                          : entry.index === 44
                            ? "Nov"
                            : entry.index === 48
                              ? "Dec"
                              : "",
  }));
}

function buildHighlightedDays(startDay: number, endDay: number, crossesYear: boolean) {
  const days = new Set<number>();
  for (let day = 1; day <= 366; day += 1) {
    if (crossesYear ? day >= startDay || day <= endDay : day >= startDay && day <= endDay) {
      days.add(day);
    }
  }
  return days;
}

function computeActivityLabel(selectedCount: number, bars: WeekBar[]) {
  const maxValue = Math.max(1, ...bars.map((bar) => bar.count));
  const ratio = selectedCount / maxValue;
  if (ratio >= 0.72) return "High";
  if (ratio >= 0.48) return "Medium–High";
  if (ratio >= 0.26) return "Medium";
  return "Low";
}

function computeTopWaters(places: SuggestedPlace[]) {
  const unique = Array.from(new Set(places.map((place) => place.region).filter(Boolean) as string[]));
  return unique.slice(0, 2).join(", ") || "San Juan Channel, Haro Strait";
}

function buildMonthTicks(bars: WeekBar[]): AxisTick[] {
  return bars.filter((bar) => bar.label).map((bar) => ({ index: bar.index, label: bar.label }));
}

function modDayOfYear(day: number) {
  return ((day - 1) % TRIP_BRUSH_DAYS + TRIP_BRUSH_DAYS) % TRIP_BRUSH_DAYS + 1;
}

function buildDailyBars(
  histogram: TripPlannerHistogramBin[],
  range: NonNullable<ReturnType<typeof buildTripPlannerRangeFromDates>>,
  paddingDays = 10
): ChartBar[] {
  const byDay = new Map<number, number>();
  histogram.forEach((row) => {
    const day = Math.max(1, Math.min(TRIP_BRUSH_DAYS, Number(row.day_of_year)));
    byDay.set(day, (byDay.get(day) ?? 0) + (Number(row.count) || 0));
  });

  const firstDay = range.startDayOfYear - paddingDays;
  const totalDays = range.dayCount + paddingDays * 2;

  return Array.from({ length: totalDays }, (_, index) => {
    const dayOfYear = modDayOfYear(firstDay + index);
    return {
      index,
      label: "",
      count: byDay.get(dayOfYear) ?? 0,
      highlighted: dayIsInTripRange(dayOfYear, range),
      dayOfYear,
    };
  });
}

function buildDailyTicks(
  bars: ChartBar[],
  range: NonNullable<ReturnType<typeof buildTripPlannerRangeFromDates>>
): AxisTick[] {
  const tripStartIndex = bars.findIndex((bar) => bar.highlighted);
  if (tripStartIndex < 0) return [];

  const tripStartDate = parseIsoDate(range.startDate);
  if (!tripStartDate) return [];

  const firstDate = addUtcDays(tripStartDate, -tripStartIndex);
  const tickStep = bars.length > 28 ? 3 : 2;

  return bars.flatMap((bar) => {
    const isEdgeTick = bar.index === 0 || bar.index === bars.length - 1;
    if (!isEdgeTick && bar.index % tickStep !== 0) return [];

    const date = addUtcDays(firstDate, bar.index);
    return [
      {
        index: bar.index,
        label: new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date),
      },
    ];
  });
}

function buildDailyMonthBands(
  bars: ChartBar[],
  range: NonNullable<ReturnType<typeof buildTripPlannerRangeFromDates>>
): MonthBand[] {
  const tripStartIndex = bars.findIndex((bar) => bar.highlighted);
  if (tripStartIndex < 0) return [];

  const tripStartDate = parseIsoDate(range.startDate);
  if (!tripStartDate) return [];

  const firstDate = addUtcDays(tripStartDate, -tripStartIndex);
  const bands: MonthBand[] = [];

  bars.forEach((bar) => {
    const date = addUtcDays(firstDate, bar.index);
    const label = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
    const current = bands[bands.length - 1];
    if (current && current.label === label) {
      current.span += 1;
      return;
    }
    bands.push({ label, startIndex: bar.index, span: 1 });
  });

  return bands;
}

function buildChartWindowStyle(bars: Array<{ index: number; highlighted: boolean }>): CSSProperties | null {
  const highlightedIndexes = bars.filter((bar) => bar.highlighted).map((bar) => bar.index);
  if (highlightedIndexes.length === 0) return null;
  const first = Math.min(...highlightedIndexes);
  const last = Math.max(...highlightedIndexes);
  const total = Math.max(1, bars.length);
  const outlineDelayMs = last * 20 + 980;
  return {
    left: `${(first / total) * 100}%`,
    width: `${((last - first + 1) / total) * 100}%`,
    "--trip-outline-delay": `${outlineDelayMs}ms`,
  } as CSSProperties;
}

function buildItineraryCardSvg({
  tripCityLabel,
  tripLabel,
  tripLengthLabel,
  itineraryPlaces,
  weekBars,
}: {
  tripCityLabel: string;
  tripLabel: string;
  tripLengthLabel: string;
  itineraryPlaces: SuggestedPlace[];
  weekBars: WeekBar[];
}) {
  const width = 960;
  const outerPad = 22;
  const innerPad = 54;
  const lineHeight = 34;
  const itineraryStartY = 234;
  const chartHeight = 164;
  const chartWidth = width - innerPad * 2;
  const chartTop = itineraryStartY + Math.max(itineraryPlaces.length, 1) * lineHeight + 70;
  const height = Math.max(700, chartTop + chartHeight + 94);
  const barMax = Math.max(1, ...weekBars.map((bar) => bar.count));
  const barWidth = chartWidth / Math.max(weekBars.length, 1);
  const monthTicks = buildMonthTicks(weekBars);

  const itineraryMarkup = itineraryPlaces
    .map((place, index) => {
      const y = itineraryStartY + index * lineHeight;
      return `
        <circle cx="${innerPad + 12}" cy="${y - 5}" r="11" fill="#D8F0EA" />
        <text x="${innerPad + 12}" y="${y}" fill="#136B73" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" text-anchor="middle">${index + 1}</text>
        <text x="${innerPad + 38}" y="${y - 4}" fill="#173657" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700">${escapeXml(place.name)}</text>
        <text x="${innerPad + 38}" y="${y + 15}" fill="#5D7894" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="600">${escapeXml(place.region ?? "Salish Sea")}</text>
      `;
    })
    .join("");

  const barMarkup = weekBars
    .map((bar) => {
      const heightScale = Math.max(8, (bar.count / barMax) * (chartHeight - 28));
      const x = innerPad + bar.index * barWidth + 1.5;
      const y = chartTop + chartHeight - heightScale - 22;
      const fill = bar.highlighted ? "url(#tripBarGradient)" : "rgba(179, 210, 235, 0.7)";
      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(4, barWidth - 3).toFixed(2)}" height="${heightScale.toFixed(2)}" rx="8" fill="${fill}" />`;
    })
    .join("");

  const tickMarkup = monthTicks
    .map((tick) => {
      const x = innerPad + tick.index * barWidth + barWidth / 2;
      return `<text x="${x.toFixed(2)}" y="${chartTop + chartHeight}" fill="#637B93" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" text-anchor="middle">${escapeXml(tick.label)}</text>`;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
    <defs>
      <pattern id="airmailStripe" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="56" height="56" fill="#F7F7F1"/>
        <rect width="16" height="56" fill="#24A38B"/>
        <rect x="16" width="12" height="56" fill="#F7F7F1"/>
        <rect x="28" width="16" height="56" fill="#6EDAD0"/>
        <rect x="44" width="12" height="56" fill="#F7F7F1"/>
      </pattern>
      <linearGradient id="paperWash" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFFDF5"/>
        <stop offset="100%" stop-color="#FBF7EC"/>
      </linearGradient>
      <linearGradient id="tripBarGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7BE2D2"/>
        <stop offset="100%" stop-color="#136B73"/>
      </linearGradient>
      <filter id="paperNoise" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer>
          <feFuncA type="table" tableValues="0 0.07"/>
        </feComponentTransfer>
      </filter>
    </defs>
    <rect width="${width}" height="${height}" rx="34" fill="url(#airmailStripe)"/>
    <rect x="${outerPad}" y="${outerPad}" width="${width - outerPad * 2}" height="${height - outerPad * 2}" rx="24" fill="url(#paperWash)"/>
    <rect x="${outerPad}" y="${outerPad}" width="${width - outerPad * 2}" height="${height - outerPad * 2}" rx="24" filter="url(#paperNoise)" opacity="0.65"/>

    <text x="${innerPad}" y="98" fill="#173657" font-family="Georgia, 'Times New Roman', serif" font-size="40" font-weight="700">Orca Itinerary</text>
    <text x="${innerPad}" y="136" fill="#2C7F7C" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700">From ${escapeXml(tripCityLabel)}</text>
    <text x="${innerPad}" y="166" fill="#173657" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700">${escapeXml(tripLabel)}</text>
    <text x="${innerPad}" y="194" fill="#5D7894" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700">${escapeXml(tripLengthLabel)}</text>

    <line x1="${innerPad}" y1="214" x2="${width - innerPad}" y2="214" stroke="#173657" stroke-opacity="0.22" stroke-width="2"/>

    ${itineraryMarkup}

    <line x1="${innerPad}" y1="${chartTop - 18}" x2="${width - innerPad}" y2="${chartTop - 18}" stroke="#173657" stroke-opacity="0.14" stroke-width="1.5"/>
    ${barMarkup}
    ${tickMarkup}
  </svg>`;

  return { svg, width, height };
}

function buildInteractiveTripWindowSegments(
  range: ReturnType<typeof buildTripPlannerRangeFromDates>,
  bars: WeekBar[]
): TripWindowSegment[] {
  if (!range || bars.length === 0) return [];

  const highlightedIndexes = bars.filter((bar) => bar.highlighted).map((bar) => bar.index);
  if (highlightedIndexes.length === 0) return [];

  const segments: Array<{ startIndex: number; endIndex: number }> = [];
  highlightedIndexes.forEach((index) => {
    const current = segments[segments.length - 1];
    if (current && index === current.endIndex + 1) {
      current.endIndex = index;
      return;
    }
    segments.push({ startIndex: index, endIndex: index });
  });

  const total = Math.max(1, bars.length);
  const startWeekIndex = Math.min(52, Math.floor((range.startDayOfYear - 1) / 7));
  const endWeekIndex = Math.min(52, Math.floor((range.endDayOfYear - 1) / 7));

  return segments.map((segment, segmentIndex) => {
    const span = segment.endIndex - segment.startIndex + 1;
    const containsStart = startWeekIndex >= segment.startIndex && startWeekIndex <= segment.endIndex;
    const containsEnd = endWeekIndex >= segment.startIndex && endWeekIndex <= segment.endIndex;
    const outlineDelayMs = Math.floor((segment.startIndex / total) * 1060) + 980;

    return {
      key: `segment-${segmentIndex}`,
      style: {
        left: `${(segment.startIndex / total) * 100}%`,
        width: `${(span / total) * 100}%`,
        "--trip-outline-delay": `${outlineDelayMs}ms`,
      } as CSSProperties,
      showLabel: containsStart,
      handleStart: containsStart,
      handleEnd: containsEnd,
    };
  });
}

function applyTripBrushDelta(
  selection: TripPlanSelection,
  mode: TripBrushMode,
  deltaDays: number
): TripPlanSelection | null {
  const start = parseIsoDate(selection.arrivalDate);
  const end = parseIsoDate(selection.departureDate);
  if (!start || !end) return null;

  let nextStart = start;
  let nextEnd = end;

  if (mode === "move") {
    nextStart = addUtcDays(start, deltaDays);
    nextEnd = addUtcDays(end, deltaDays);
  } else if (mode === "start") {
    nextStart = addUtcDays(start, deltaDays);
    if (nextStart.getTime() > end.getTime()) nextStart = end;
    nextStart = clampTripLength(nextStart, end);
  } else {
    nextEnd = addUtcDays(end, deltaDays);
    if (nextEnd.getTime() < start.getTime()) nextEnd = start;
    const latestEnd = addUtcDays(start, MAX_TRIP_LENGTH_DAYS - 1);
    if (nextEnd.getTime() > latestEnd.getTime()) nextEnd = latestEnd;
  }

  const arrivalDate = formatIsoDate(nextStart);
  const departureDate = formatIsoDate(nextEnd);
  if (arrivalDate === selection.arrivalDate && departureDate === selection.departureDate) {
    return selection;
  }

  return {
    ...selection,
    arrivalDate,
    departureDate,
  };
}

function PlannerPlaceCard({
  place,
  previewUrl,
  photoManifest,
  itineraryAdded,
  onAddToItinerary,
  onRemoveFromItinerary,
  selected,
  onShowOnMap,
}: {
  place: SuggestedPlace;
  previewUrl: string;
  photoManifest: ViewingSpotPhotoManifest;
  itineraryAdded: boolean;
  onAddToItinerary: () => void;
  onRemoveFromItinerary: () => void;
  selected: boolean;
  onShowOnMap: () => void;
}) {
  const photo = getViewingSpotPhoto(place.spotId, photoManifest);
  const showApprovedPhoto = hasApprovedSpotPhoto(photo);
  const imageSrc = showApprovedPhoto ? photo?.imageSrc : (place.imageUrl ?? previewUrl);
  const imageAlt = showApprovedPhoto ? photo?.alt ?? place.name : `Preview for ${place.name}`;
  const imagePosition = showApprovedPhoto ? photo?.focalPoint ?? "50% 50%" : undefined;

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
            {imageSrc ? (
              <img
                className="plannerResultsPage__spotThumb suggestedPlaceCard__thumb"
                src={imageSrc}
                alt={imageAlt}
                loading="lazy"
                style={imagePosition ? { objectPosition: imagePosition } : undefined}
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
              <span className={`viewingPotentialBadge viewingPotentialBadge--${place.viewingPotential}`}>
                {potentialLabel[place.viewingPotential]}
              </span>
            </div>
            <p className="plannerResultsPage__spotRegion suggestedPlaceCard__meta">
              <span className={`suggestedPlaceType suggestedPlaceType--${place.type.toLowerCase()}`}>
                <span className="material-symbols-rounded suggestedPlaceType__icon" aria-hidden="true">
                  {getPlaceTypeIcon(place.type)}
                </span>
                <span>{formatPlaceType(place.type)}</span>
              </span>
              <span>{place.region ?? "Salish Sea"}</span>
            </p>
            <p className="plannerResultsPage__spotReason suggestedPlaceCard__reason">{place.reason}</p>
          </div>
        </button>

        <div className="plannerResultsPage__spotCardFace plannerResultsPage__spotCardFace--back">
          <div className="plannerResultsPage__spotCardActionWrap">
            <span className="plannerResultsPage__spotCardActionLabel">{place.name}</span>
            <div className="plannerResultsPage__spotCardActions">
              <button type="button" className="plannerResultsPage__spotCardActionBtn" onClick={onShowOnMap}>
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
                onClick={itineraryAdded ? onRemoveFromItinerary : onAddToItinerary}
                aria-pressed={itineraryAdded}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  {itineraryAdded ? "remove_circle" : "playlist_add"}
                </span>
                <span>{itineraryAdded ? "Remove from inventory" : "Add to itinerary"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PlannerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setMenuOpen } = useMenu();
  const {
    darkMode,
    unitsMode,
    setUnitsMode,
    surfaceMode,
    setSurfaceMode,
    resolution,
    setResolution,
    selectedPaletteId,
    setSelectedPaletteId,
    setThemeMode,
  } = useMapState();
  const forceNewSession = useMemo(() => new URLSearchParams(location.search).get("new") === "1", [location.search]);
  const [infoOpen, setInfoOpen] = useState(false);
  const storedSelection = useMemo(() => (forceNewSession ? null : readStoredPlannerSelection()), [forceNewSession]);
  const storedDraft = useMemo(() => (forceNewSession ? null : readStoredPlannerDraft()), [forceNewSession]);
  const [plannerSelection, setPlannerSelection] = useState<TripPlanSelection | null>(storedSelection);
  const [appliedPlannerSelection, setAppliedPlannerSelection] = useState<TripPlanSelection | null>(storedSelection);
  const [plannerOpen, setPlannerOpen] = useState(() => (forceNewSession ? true : readStoredPlannerOpen(!storedSelection)));
  const [draftCity, setDraftCity] = useState(forceNewSession ? "" : storedDraft?.city ?? "");
  const [draftArrivalDate, setDraftArrivalDate] = useState(forceNewSession ? "" : storedDraft?.arrivalDate ?? "");
  const [draftDepartureDate, setDraftDepartureDate] = useState(forceNewSession ? "" : storedDraft?.departureDate ?? "");
  const [draftMaxTravelDistance, setDraftMaxTravelDistance] = useState(forceNewSession ? "" : storedDraft?.maxTravelDistance ?? "");
  const [tripOccurrence, setTripOccurrence] = useState<TripPlannerOccurrenceResult | null>(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [photoManifest, setPhotoManifest] = useState<ViewingSpotPhotoManifest>({});
  const [baseLocations, setBaseLocations] = useState<PlannerBaseLocation[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [legendCollapsed, setLegendCollapsed] = useState(true);
  const [chartCollapsed, setChartCollapsed] = useState(true);
  const [spotsCollapsed, setSpotsCollapsed] = useState(false);
  const [itineraryPlaceIds, setItineraryPlaceIds] = useState<string[]>([]);
  const [itineraryMapViewActive, setItineraryMapViewActive] = useState(false);
  const [pulseSelectedPlaceMarker, setPulseSelectedPlaceMarker] = useState(false);
  const [draggingItineraryPlaceId, setDraggingItineraryPlaceId] = useState<string | null>(null);
  const [itineraryDropTargetId, setItineraryDropTargetId] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tripHotspotsVisible, setTripHotspotsVisible] = useState(true);
  const [colorNoData, setColorNoData] = useState<"off" | "on">("on");
  const [poiFilters, setPoiFilters] = useState({ Park: false, Marina: false, Ferry: false });
  const [shareBusy, setShareBusy] = useState(false);
  const [itineraryShareMenuOpen, setItineraryShareMenuOpen] = useState(false);
  const [tripBrushMode, setTripBrushMode] = useState<TripBrushMode | null>(null);
  const [chartZoomMode, setChartZoomMode] = useState<ChartZoomMode>("weekly");
  const primaryMapRef = useRef<ForecastMapHandle | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const previewUrlCacheRef = useRef<Map<string, string>>(new Map());
  const chartPlotRef = useRef<HTMLDivElement | null>(null);
  const tripBrushDragRef = useRef<TripBrushDragState | null>(null);
  const tripBrushApplyTimerRef = useRef<number | null>(null);
  const tripBrushPendingApplyRef = useRef(false);

  useEffect(() => {
    if (!forceNewSession) return;
    clearStoredPlannerState();
    navigate("/planner", { replace: true });
  }, [forceNewSession, navigate]);

  const downloadSnapshot = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const toFileSafeToken = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "model";

  const tripRange = useMemo(
    () => (plannerSelection ? buildTripPlannerRangeFromDates(plannerSelection.arrivalDate, plannerSelection.departureDate) : null),
    [plannerSelection]
  );
  const plannerSubmitted = !!plannerSelection && !!tripRange;
  const appliedTripRange = useMemo(
    () =>
      appliedPlannerSelection
        ? buildTripPlannerRangeFromDates(appliedPlannerSelection.arrivalDate, appliedPlannerSelection.departureDate)
        : null,
    [appliedPlannerSelection]
  );
  const appliedPlannerSubmitted = !!appliedPlannerSelection && !!appliedTripRange;

  useEffect(() => {
    if (tripBrushApplyTimerRef.current) {
      window.clearTimeout(tripBrushApplyTimerRef.current);
      tripBrushApplyTimerRef.current = null;
    }

    if (!plannerSelection) {
      setAppliedPlannerSelection(null);
      tripBrushPendingApplyRef.current = false;
      return;
    }

    if (!tripBrushPendingApplyRef.current) {
      setAppliedPlannerSelection(plannerSelection);
      return;
    }

    tripBrushApplyTimerRef.current = window.setTimeout(() => {
      setAppliedPlannerSelection(plannerSelection);
      tripBrushPendingApplyRef.current = false;
      tripBrushApplyTimerRef.current = null;
    }, TRIP_BRUSH_APPLY_DELAY_MS);

    return () => {
      if (tripBrushApplyTimerRef.current) {
        window.clearTimeout(tripBrushApplyTimerRef.current);
        tripBrushApplyTimerRef.current = null;
      }
    };
  }, [plannerSelection]);

  useEffect(() => {
    let cancelled = false;

    loadPlannerBaseLocations()
      .then((items) => {
        if (cancelled) return;
        setBaseLocations(items);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[Planner] failed to load base locations", error);
          setBaseLocations([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (baseLocations.length === 0) return;
    const validNames = new Set(baseLocations.map((location) => location.name));

    if (draftCity && !validNames.has(draftCity)) {
      setDraftCity("");
    }

    setPlannerSelection((current) => {
      if (!current) return current;
      return validNames.has(current.city) ? current : null;
    });
  }, [baseLocations, draftCity]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (plannerSelection) {
      window.sessionStorage.setItem(PLANNER_SELECTION_STORAGE_KEY, JSON.stringify(plannerSelection));
    } else {
      window.sessionStorage.removeItem(PLANNER_SELECTION_STORAGE_KEY);
    }
  }, [plannerSelection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(PLANNER_OPEN_STORAGE_KEY, plannerOpen ? "true" : "false");
  }, [plannerOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasDraft =
      draftCity.trim().length > 0 ||
      draftArrivalDate.length > 0 ||
      draftDepartureDate.length > 0 ||
      draftMaxTravelDistance.trim().length > 0;
    if (!hasDraft) {
      window.sessionStorage.removeItem(PLANNER_DRAFT_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      PLANNER_DRAFT_STORAGE_KEY,
      JSON.stringify({
        city: draftCity,
        arrivalDate: draftArrivalDate,
        departureDate: draftDepartureDate,
        maxTravelDistance: draftMaxTravelDistance,
      } satisfies TripPlannerDraft)
    );
  }, [draftArrivalDate, draftCity, draftDepartureDate, draftMaxTravelDistance]);

  useEffect(() => {
    if (!appliedTripRange) {
      setTripOccurrence(null);
      setTripLoading(false);
      setTripError(null);
      return;
    }

    let cancelled = false;
    setTripLoading(true);
    setTripError(null);
    loadTripPlannerOccurrencePayload(resolution)
      .then((payload) => {
        if (cancelled) return;
        setTripOccurrence(aggregateTripPlannerOccurrence(payload, appliedTripRange));
      })
      .catch((error) => {
        if (cancelled) return;
        setTripOccurrence(null);
        setTripError(error instanceof Error ? error.message : "Trip planner data could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setTripLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedTripRange, resolution]);

  const baseLocationsByName = useMemo(
    () => new Map(baseLocations.map((location) => [location.name, location])),
    [baseLocations]
  );
  const activeBaseLocation = useMemo(() => {
    const activeName = plannerOpen ? draftCity : plannerSelection?.city ?? "";
    return baseLocationsByName.get(activeName) ?? null;
  }, [baseLocationsByName, draftCity, plannerOpen, plannerSelection?.city]);

  const recommendedPlacesData = useSuggestedPlaces({
    resolution,
    modelId: appConfig.compositeModelId,
    externalValues: tripOccurrence?.values,
    enabled: appliedPlannerSubmitted && !tripLoading && !!tripOccurrence,
    limit: DEFAULT_RECOMMENDED_SPOTS_COUNT,
    poiFilters,
    baseLocation: activeBaseLocation,
    maxTravelDistanceMiles: appliedPlannerSelection?.maxTravelDistanceMiles,
  });

  const recommendedPlacesSignature = useMemo(
    () => buildRecommendedPlacesSignature(appliedPlannerSelection, resolution),
    [appliedPlannerSelection, resolution]
  );
  const recommendedPlaces = recommendedPlacesData.places;
  const cachedRecommendedPlaces = useMemo(
    () => (forceNewSession ? [] : readStoredRecommendedPlaces(recommendedPlacesSignature)),
    [forceNewSession, recommendedPlacesSignature]
  );
  const displayedRecommendedPlaces =
    recommendedPlaces.length > 0
      ? recommendedPlaces
      : plannerSubmitted && (tripLoading || recommendedPlacesData.isLoading)
        ? cachedRecommendedPlaces
        : recommendedPlaces;
  const selectedPlace = useMemo(
    () => displayedRecommendedPlaces.find((place) => place.id === selectedPlaceId) ?? null,
    [displayedRecommendedPlaces, selectedPlaceId]
  );
  const itineraryPlaces = useMemo(
    () => itineraryPlaceIds.map((id) => displayedRecommendedPlaces.find((place) => place.id === id)).filter(Boolean) as SuggestedPlace[],
    [displayedRecommendedPlaces, itineraryPlaceIds]
  );
  const mapSuggestedPlaces = useMemo(
    () => (itineraryMapViewActive ? itineraryPlaces : displayedRecommendedPlaces),
    [displayedRecommendedPlaces, itineraryMapViewActive, itineraryPlaces]
  );

  const handleAddPlaceToItinerary = (place: SuggestedPlace) => {
    setItineraryPlaceIds((current) => (current.includes(place.id) ? current : [...current, place.id]));
  };

  const handleRemovePlaceFromItinerary = (placeId: string) => {
    setItineraryPlaceIds((current) => current.filter((id) => id !== placeId));
  };

  const handleItineraryDragStart = (placeId: string, event: ReactDragEvent<HTMLDivElement>) => {
    setDraggingItineraryPlaceId(placeId);
    setItineraryDropTargetId(placeId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", placeId);
  };

  const handleItineraryDragOver = (placeId: string, event: ReactDragEvent<HTMLDivElement>) => {
    if (!draggingItineraryPlaceId || draggingItineraryPlaceId === placeId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (itineraryDropTargetId !== placeId) {
      setItineraryDropTargetId(placeId);
    }
  };

  const handleItineraryDrop = (targetPlaceId: string, event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourcePlaceId = draggingItineraryPlaceId ?? event.dataTransfer.getData("text/plain");
    if (!sourcePlaceId || sourcePlaceId === targetPlaceId) {
      setDraggingItineraryPlaceId(null);
      setItineraryDropTargetId(null);
      return;
    }

    setItineraryPlaceIds((current) => {
      const sourceIndex = current.indexOf(sourcePlaceId);
      const targetIndex = current.indexOf(targetPlaceId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });

    setDraggingItineraryPlaceId(null);
    setItineraryDropTargetId(null);
  };

  const handleItineraryDragEnd = () => {
    setDraggingItineraryPlaceId(null);
    setItineraryDropTargetId(null);
  };

  useEffect(() => {
    if (!plannerSubmitted) {
      setSelectedPlaceId(null);
      setItineraryPlaceIds([]);
      setItineraryMapViewActive(false);
      setPulseSelectedPlaceMarker(false);
      return;
    }

    if (selectedPlaceId && !displayedRecommendedPlaces.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(null);
      setPulseSelectedPlaceMarker(false);
    }
    setItineraryPlaceIds((current) => current.filter((id) => displayedRecommendedPlaces.some((place) => place.id === id)));
  }, [displayedRecommendedPlaces, plannerSubmitted, selectedPlaceId]);

  useEffect(() => {
    if (itineraryPlaces.length === 0 && itineraryMapViewActive) {
      setItineraryMapViewActive(false);
    }
  }, [itineraryMapViewActive, itineraryPlaces.length]);

  useEffect(() => {
    setPreviewUrls(buildPreviewUrlMap(displayedRecommendedPlaces, previewUrlCacheRef.current));
  }, [displayedRecommendedPlaces]);

  useEffect(() => {
    if (typeof window === "undefined" || !recommendedPlacesSignature || recommendedPlaces.length === 0) return;
    window.sessionStorage.setItem(
      PLANNER_RECOMMENDED_PLACES_STORAGE_KEY,
      JSON.stringify({
        signature: recommendedPlacesSignature,
        places: recommendedPlaces,
      } satisfies StoredPlannerRecommendedPlaces)
    );
  }, [recommendedPlaces, recommendedPlacesSignature]);

  useEffect(() => {
    let cancelled = false;
    const loadPreviews = async () => {
      const map = primaryMapRef.current;
      if (!map || displayedRecommendedPlaces.length === 0) return;
      for (const place of displayedRecommendedPlaces) {
        if (cancelled || previewUrlCacheRef.current.has(place.id)) continue;
        const blob = await map.capturePlacePreview({
          center: [place.longitude, place.latitude],
          zoom: 11.6,
          width: 340,
          height: 200,
        });
        if (cancelled || !blob) continue;
        const url = URL.createObjectURL(blob);
        previewUrlCacheRef.current.set(place.id, url);
        setPreviewUrls(buildPreviewUrlMap(displayedRecommendedPlaces, previewUrlCacheRef.current));
      }
    };
    void loadPreviews();
    return () => {
      cancelled = true;
    };
  }, [displayedRecommendedPlaces]);

  useEffect(
    () => () => {
      previewUrlCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlCacheRef.current.clear();
    },
    []
  );

  useEffect(() => {
    if (!settingsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) setPaletteOpen(false);
  }, [settingsOpen]);

  const today = useMemo(() => new Date(), []);
  const selectedWeek = isoWeekFromDate(today);
  const selectedWeekYear = isoWeekYearFromDate(today);
  const highlightedDays = useMemo(
    () =>
      tripRange ? buildHighlightedDays(tripRange.startDayOfYear, tripRange.endDayOfYear, tripRange.crossesYear) : new Set<number>(),
    [tripRange]
  );
  const weekBars = useMemo(
    () => toWeekBars(tripOccurrence?.histogram ?? [], highlightedDays),
    [highlightedDays, tripOccurrence?.histogram]
  );
  const chartZoomedToDays = chartZoomMode === "daily" || tripBrushMode === "start" || tripBrushMode === "end";
  const chartBars = useMemo<ChartBar[]>(
    () =>
      chartZoomedToDays && tripRange
        ? buildDailyBars(tripOccurrence?.histogram ?? [], tripRange)
        : weekBars.map((bar) => ({ ...bar, dayOfYear: bar.index * 7 + 1 })),
    [chartZoomedToDays, tripOccurrence?.histogram, tripRange, weekBars]
  );
  const weeklyChartMax = Math.max(1, ...weekBars.map((bar) => bar.count));
  const chartMax = Math.max(1, ...chartBars.map((bar) => bar.count));
  const chartTicks = useMemo<AxisTick[]>(
    () => (chartZoomedToDays && tripRange ? buildDailyTicks(chartBars, tripRange) : buildMonthTicks(weekBars)),
    [chartBars, chartZoomedToDays, tripRange, weekBars]
  );
  const weeklyChartTicks = useMemo<AxisTick[]>(() => buildMonthTicks(weekBars), [weekBars]);
  const dailyMonthBands = useMemo<MonthBand[]>(
    () => (chartZoomedToDays && tripRange ? buildDailyMonthBands(chartBars, tripRange) : []),
    [chartBars, chartZoomedToDays, tripRange]
  );
  const chartWindowStyle = useMemo(() => buildChartWindowStyle(chartBars), [chartBars]);
  const chartColumnStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${Math.max(chartBars.length, 1)}, minmax(0, 1fr))` }),
    [chartBars.length]
  );
  const weeklyChartColumnStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${Math.max(weekBars.length, 1)}, minmax(0, 1fr))` }),
    [weekBars.length]
  );
  const tripWindowSegments = useMemo(() => buildInteractiveTripWindowSegments(tripRange, weekBars), [tripRange, weekBars]);
  const tripLabel = tripRange ? formatDisplayDateRange(tripRange.startDate, tripRange.endDate) : "Choose dates";
  const tripLengthLabel = tripRange ? `${tripRange.dayCount} ${tripRange.dayCount === 1 ? "day" : "days"}` : "";
  const tripCityLabel = plannerSelection?.city || "Base location";
  const tripDistanceLabel = plannerSelection?.maxTravelDistanceMiles
    ? `Up to ${plannerSelection.maxTravelDistanceMiles} mi`
    : null;
  const activeMaxTravelDistanceMiles = useMemo(() => {
    if (plannerOpen) {
      const parsed = Number(draftMaxTravelDistance);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return plannerSelection?.maxTravelDistanceMiles ?? null;
  }, [draftMaxTravelDistance, plannerOpen, plannerSelection?.maxTravelDistanceMiles]);
  const selectedCount = tripOccurrence?.selectedCount ?? 0;
  const activityLabel = useMemo(() => computeActivityLabel(selectedCount, weekBars), [selectedCount, weekBars]);
  const topWatersLabel = useMemo(() => computeTopWaters(displayedRecommendedPlaces), [displayedRecommendedPlaces]);
  const liveCamCount = displayedRecommendedPlaces.filter((place) => place.hasLiveFeed).length;
  const hydrophoneCount = displayedRecommendedPlaces.filter((place) => place.hasHydrophone).length;
  const paletteEntries = useMemo(() => Object.values(PALETTES), []);
  const poiActive = poiFilters.Park || poiFilters.Marina || poiFilters.Ferry;
  const legendColors = useMemo(
    () => pickLegendColors(PALETTES[selectedPaletteId].colors, colorNoData === "on"),
    [colorNoData, selectedPaletteId]
  );

  useEffect(() => {
    if (!tripBrushMode) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = tripBrushDragRef.current;
      const plot = chartPlotRef.current;
      if (!drag || drag.pointerId !== event.pointerId || !plot) return;

      const deltaX = event.clientX - drag.startX;
      const deltaDays = Math.round((deltaX / Math.max(plot.getBoundingClientRect().width, 1)) * TRIP_BRUSH_DAYS);
      const nextSelection = applyTripBrushDelta(drag.initialSelection, drag.mode, deltaDays);
      if (!nextSelection) return;

      setPlannerSelection((current) => {
        if (!current) return current;
        if (
          current.arrivalDate === nextSelection.arrivalDate &&
          current.departureDate === nextSelection.departureDate &&
          current.city === nextSelection.city &&
          current.maxTravelDistanceMiles === nextSelection.maxTravelDistanceMiles
        ) {
          return current;
        }
        return nextSelection;
      });
    };

    const stopDrag = (event?: PointerEvent) => {
      const drag = tripBrushDragRef.current;
      if (event && drag && drag.pointerId !== event.pointerId) return;
      tripBrushDragRef.current = null;
      setTripBrushMode(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [tripBrushMode]);

  const handleTripBrushPointerDown = (mode: TripBrushMode, event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (!plannerSelection || !tripRange) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (mode === "start" || mode === "end") {
      setChartZoomMode("daily");
    }
    tripBrushPendingApplyRef.current = true;
    tripBrushDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      initialSelection: plannerSelection,
    };
    setSelectedPlaceId(null);
    setTripBrushMode(mode);
  };
  const handlePlannerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftCity || !draftArrivalDate || !draftDepartureDate) return;

    if (!baseLocationsByName.has(draftCity)) {
      setTripError("Choose a base location from the available list.");
      return;
    }
    const selectedBaseLocation = baseLocationsByName.get(draftCity) ?? null;

    const range = buildTripPlannerRangeFromDates(draftArrivalDate, draftDepartureDate);
    if (!range) {
      setTripError("Departure must be on or after arrival.");
      return;
    }

    const parsedMaxTravelDistance = Number(draftMaxTravelDistance);
    if (tripBrushApplyTimerRef.current) {
      window.clearTimeout(tripBrushApplyTimerRef.current);
      tripBrushApplyTimerRef.current = null;
    }
    tripBrushPendingApplyRef.current = false;
    const nextSelection = {
      city: draftCity.trim(),
      arrivalDate: range.startDate,
      departureDate: range.endDate,
      maxTravelDistanceMiles:
        draftMaxTravelDistance.trim() && Number.isFinite(parsedMaxTravelDistance) && parsedMaxTravelDistance > 0
          ? Math.round(parsedMaxTravelDistance)
          : undefined,
    } satisfies TripPlanSelection;
    setTripError(null);
    setPlannerSelection(nextSelection);
    setAppliedPlannerSelection(nextSelection);
    setChartZoomMode("weekly");
    setSelectedPlaceId(null);
    setChartCollapsed(false);
    setLegendCollapsed(true);
    setPlannerOpen(false);

    if (selectedBaseLocation && nextSelection.maxTravelDistanceMiles) {
      primaryMapRef.current?.fitLocations(
        buildRadiusFitLocations(
          selectedBaseLocation.latitude,
          selectedBaseLocation.longitude,
          nextSelection.maxTravelDistanceMiles
        ),
        { padding: 144, maxZoom: 9.8 }
      );
    }
  };

  const openPlannerEditor = () => {
    setDraftCity(plannerSelection?.city ?? "");
    setDraftArrivalDate(plannerSelection?.arrivalDate ?? "");
    setDraftDepartureDate(plannerSelection?.departureDate ?? "");
    setDraftMaxTravelDistance(
      plannerSelection?.maxTravelDistanceMiles ? String(plannerSelection.maxTravelDistanceMiles) : ""
    );
    setPlannerOpen(true);
  };

  const shareSnapshot = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const blob = await primaryMapRef.current?.captureSnapshot();
      if (!blob) throw new Error("Snapshot not available");

      const fileName = `orcacast_trip_${selectedWeekYear}-W${String(selectedWeek).padStart(2, "0")}_${resolution}_${toFileSafeToken(appConfig.compositeModelId)}.png`;
      const snapshotFile = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      const canNativeShareFiles =
        typeof nav.share === "function" &&
        (typeof nav.canShare !== "function" || nav.canShare({ files: [snapshotFile] }));

      if (canNativeShareFiles) {
        await nav.share({
          title: "OrcaCast trip planner snapshot",
          text: `${tripCityLabel} · ${tripLabel} · ${tripLengthLabel}`,
          files: [snapshotFile],
        });
      } else {
        downloadSnapshot(blob, fileName);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("[Share] Planner snapshot failed", error);
      }
    } finally {
      setShareBusy(false);
    }
  };

  const downloadSnapshotAction = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const blob = await primaryMapRef.current?.captureSnapshot();
      if (!blob) throw new Error("Snapshot not available");
      const fileName = `orcacast_trip_${selectedWeekYear}-W${String(selectedWeek).padStart(2, "0")}_${resolution}_${toFileSafeToken(appConfig.compositeModelId)}.png`;
      downloadSnapshot(blob, fileName);
    } catch (error) {
      console.error("[Download] Planner snapshot failed", error);
    } finally {
      setShareBusy(false);
    }
  };

  const handleItineraryDownloadAction = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const { svg, width, height } = buildItineraryCardSvg({
        tripCityLabel,
        tripLabel,
        tripLengthLabel,
        itineraryPlaces,
        weekBars,
      });
      const blob = await rasterizeSvgToPngBlob(svg, width, height);
      const fileName = `orcacast_itinerary_${toFileSafeToken(tripCityLabel)}_${plannerSelection?.arrivalDate ?? "trip"}.png`;
      downloadSnapshot(blob, fileName);
    } catch (error) {
      console.error("[Download] Itinerary card failed", error);
    } finally {
      setShareBusy(false);
    }
  };

  const isEditingTrip = plannerSubmitted && plannerOpen;

  const mapProps = {
    darkMode,
    showMapControls: !isEditingTrip,
    showLegendControl: false,
    colorNoData: colorNoData === "on",
    paletteId: selectedPaletteId,
    surfaceMode,
    resolution,
    poiFilters,
    modelId: appConfig.compositeModelId,
    periods: [],
    selectedWeek,
    selectedWeekYear,
    hotspotsEnabled: false,
    hotspotMode: "modeled" as const,
    hotspotPercentile: 1,
    expectedActivityHotspotCellCount: null,
    onHotspotsEnabledChange: () => undefined,
    externalValues: plannerSubmitted && !isEditingTrip ? tripOccurrence?.values ?? {} : undefined,
    forecastOverlayEnabled: plannerSubmitted && !isEditingTrip,
    pulseAllGridCells: plannerSubmitted && !isEditingTrip && tripLoading,
    mapModeLabel:
      plannerSubmitted && !isEditingTrip ? "Loading typical activity map…" : "Choose trip details to build your outlook",
    suggestedPlaces: plannerSubmitted && !isEditingTrip ? mapSuggestedPlaces : [],
    itineraryPlaceIds: plannerSubmitted && !isEditingTrip ? itineraryPlaceIds : [],
    showTripHotspotMarkers: plannerSubmitted && !isEditingTrip && tripHotspotsVisible && !tripLoading,
    selectedPlaceId: isEditingTrip ? null : selectedPlaceId,
    pulseSelectedPlaceMarker: plannerSubmitted && !isEditingTrip ? pulseSelectedPlaceMarker : false,
    onPlaceSelect: (place: SuggestedPlace) => {
      setPulseSelectedPlaceMarker(false);
      setSelectedPlaceId(place.id);
    },
    baseLocation: activeBaseLocation,
    maxTravelDistanceMiles: activeMaxTravelDistanceMiles,
    sidebarOffsetPx: 0,
  } satisfies ForecastMapProps;

  return (
    <div className="mapPageRoot">
      <AppHeader
        title="OrcaCast"
        subtitle="Orca Sightings Forecast"
        onOpenInfo={() => setInfoOpen(true)}
        onOpenMenu={() => setMenuOpen(true)}
      />

      <main className="app__main">
        <div className={`plannerResultsPage${plannerSubmitted ? " hasPlan" : " isPrompting"}${plannerOpen ? " isPlannerOpen" : ""}${plannerSubmitted && plannerOpen ? " isEditing" : ""}${chartCollapsed ? " isChartCollapsed" : ""}${spotsCollapsed ? " isSpotsCollapsed" : ""}${!legendCollapsed ? " isLegendOpen" : ""}`}>
          <div className="plannerResultsPage__main">
        <div className="plannerResultsPage__mapLayer">
          <ForecastMap
            {...mapProps}
            ref={primaryMapRef}
          />
        </div>

        {(!plannerSubmitted || plannerOpen) ? (
          <section
            className={`plannerResultsPage__promptCard${plannerSubmitted ? " isEditing" : ""}`}
            aria-labelledby="plannerPromptTitle"
          >
            <header className="plannerResultsPage__promptHeader">
              <div className="plannerResultsPage__promptIcon">
                <span className="material-symbols-rounded" aria-hidden="true">
                  calendar_month
                </span>
              </div>
              <div className="plannerResultsPage__promptHeading">
                <p className="plannerResultsPage__promptEyebrow">Trip planner</p>
                <h1 id="plannerPromptTitle">{plannerSubmitted ? "Edit trip plan" : "Plan your trip"}</h1>
              </div>
              {plannerSubmitted ? (
                <button
                  type="button"
                  className="plannerResultsPage__promptClose"
                  onClick={() => setPlannerOpen(false)}
                  aria-label="Close trip editor"
                >
                  <span className="material-symbols-rounded" aria-hidden="true">
                    close
                  </span>
                </button>
              ) : null}
            </header>

            <form className="plannerResultsPage__promptForm" onSubmit={handlePlannerSubmit} autoComplete="off">
              <label className="plannerResultsPage__promptField plannerResultsPage__promptField--base">
                <span>Base location</span>
                <span className="plannerResultsPage__promptInputWrap">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    location_on
                  </span>
                    <select
                      value={draftCity}
                      onChange={(event) => setDraftCity(event.target.value)}
                      autoComplete="off"
                      required
                    >
                      <option value="" disabled>
                        Select a location
                      </option>
                      {baseLocations.map((location) => (
                        <option key={location.name} value={location.name}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>

              <div className="plannerResultsPage__promptFieldGrid">
                <label className="plannerResultsPage__promptField">
                  <span>Arrival</span>
                  <span className="plannerResultsPage__promptInputWrap">
                    <span className="material-symbols-rounded" aria-hidden="true">
                      flight_land
                    </span>
                    <input
                      type="date"
                      value={draftArrivalDate}
                      onChange={(event) => setDraftArrivalDate(event.target.value)}
                      autoComplete="off"
                      required
                    />
                  </span>
                </label>

                <label className="plannerResultsPage__promptField">
                  <span>Departure</span>
                  <span className="plannerResultsPage__promptInputWrap">
                    <span className="material-symbols-rounded" aria-hidden="true">
                      flight_takeoff
                    </span>
                    <input
                      type="date"
                      value={draftDepartureDate}
                      onChange={(event) => setDraftDepartureDate(event.target.value)}
                      min={draftArrivalDate || undefined}
                      autoComplete="off"
                      required
                    />
                  </span>
                </label>

                <label className="plannerResultsPage__promptField plannerResultsPage__promptField--distance">
                  <span>Max travel distance <em>optional</em></span>
                  <span className="plannerResultsPage__promptInputWrap plannerResultsPage__promptInputWrap--suffix">
                    <span className="material-symbols-rounded" aria-hidden="true">
                      route
                    </span>
                    <input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={draftMaxTravelDistance}
                      onChange={(event) => setDraftMaxTravelDistance(event.target.value)}
                      placeholder="Any"
                      autoComplete="off"
                    />
                    <span className="plannerResultsPage__promptSuffix">mi</span>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                className="plannerResultsPage__promptSubmit"
                disabled={!draftCity || !draftArrivalDate || !draftDepartureDate}
              >
                <span>Go</span>
                <span className="material-symbols-rounded" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            </form>
          </section>
        ) : null}

        {plannerSubmitted && !isEditingTrip ? (
          <section className="plannerResultsPage__summaryCard">
            <div className="plannerResultsPage__summaryIcon">
              <span className="material-symbols-rounded" aria-hidden="true">
                calendar_month
              </span>
            </div>
            <div className="plannerResultsPage__summaryBody">
              <h1>{`Trip from ${tripCityLabel}`}</h1>
              <div className="plannerResultsPage__summaryMeta">
                <span>
                  {tripLabel} · {tripLengthLabel}
                </span>
                {tripDistanceLabel ? <span>{tripDistanceLabel}</span> : null}
              </div>
            </div>
            <div className="plannerResultsPage__summaryActions">
              <button type="button" className="plannerResultsPage__summaryEditBtn" onClick={openPlannerEditor}>
                <span className="material-symbols-rounded" aria-hidden="true">
                  edit_calendar
                </span>
                <span>Edit Trip</span>
              </button>
              {itineraryPlaces.length > 0 ? (
                <div
                  className="plannerResultsPage__summaryItinerary"
                  tabIndex={0}
                  onMouseLeave={(event) => {
                    if (itineraryShareMenuOpen) return;
                    setItineraryShareMenuOpen(false);
                    const activeElement = document.activeElement;
                    if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
                      activeElement.blur();
                    }
                  }}
                >
                  <button
                    type="button"
                    className="plannerResultsPage__summaryItineraryTrigger"
                    onClick={() => {
                      if (itineraryMapViewActive) {
                        setItineraryMapViewActive(false);
                        setPulseSelectedPlaceMarker(false);
                        return;
                      }
                      setItineraryMapViewActive(true);
                      setPulseSelectedPlaceMarker(false);
                      setSelectedPlaceId(itineraryPlaces[0]?.id ?? null);
                      primaryMapRef.current?.fitLocations(
                        itineraryPlaces.map((place) => [place.longitude, place.latitude] as [number, number]),
                        { padding: 104, maxZoom: 10.5 }
                      );
                    }}
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">
                      route
                    </span>
                    <span>{`${itineraryMapViewActive ? "View all places" : "View itinerary"} (${itineraryPlaces.length})`}</span>
                  </button>

                  <div className="plannerResultsPage__itineraryMenu">
                    <div className="plannerResultsPage__itineraryMenuHead">
                      <div className="plannerResultsPage__itineraryMenuTitle">
                        <strong>Trip stops</strong>
                        <span>{itineraryPlaces.length}</span>
                      </div>
                      <div className="plannerResultsPage__itineraryMenuActions">
                        <button
                          type="button"
                          className="plannerResultsPage__itineraryMenuUtility"
                          onClick={() => setItineraryShareMenuOpen((value) => !value)}
                          aria-expanded={itineraryShareMenuOpen}
                          aria-label="Open itinerary download details"
                        >
                          <span className="material-symbols-rounded" aria-hidden="true">
                            download
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="plannerResultsPage__itineraryList">
                      {itineraryPlaces.map((place, index) => (
                        <Fragment key={place.id}>
                          <div
                            className={`plannerResultsPage__itineraryItem${
                              draggingItineraryPlaceId === place.id ? " isDragging" : ""
                            }${itineraryDropTargetId === place.id && draggingItineraryPlaceId !== place.id ? " isDropTarget" : ""}`}
                            draggable
                            onDragStart={(event) => handleItineraryDragStart(place.id, event)}
                            onDragOver={(event) => handleItineraryDragOver(place.id, event)}
                            onDrop={(event) => handleItineraryDrop(place.id, event)}
                            onDragEnd={handleItineraryDragEnd}
                          >
                            <div className="plannerResultsPage__itineraryItemOrder">{index + 1}</div>
                            <button
                              type="button"
                              className="plannerResultsPage__itineraryItemMain"
                              onClick={() => {
                                setPulseSelectedPlaceMarker(false);
                                setSelectedPlaceId(place.id);
                              }}
                            >
                              <strong>{place.name}</strong>
                              <span>{place.region ?? "Salish Sea"}</span>
                            </button>
                            <button
                              type="button"
                              className="plannerResultsPage__itineraryItemRemove"
                              onClick={() => handleRemovePlaceFromItinerary(place.id)}
                              aria-label={`Remove ${place.name} from itinerary`}
                            >
                              <span className="material-symbols-rounded" aria-hidden="true">
                                close
                              </span>
                            </button>
                          </div>
                          {index < itineraryPlaces.length - 1 ? (
                            <div className="plannerResultsPage__itineraryDots" aria-hidden="true">
                              <span />
                              <span />
                              <span />
                            </div>
                          ) : null}
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {itineraryShareMenuOpen ? (
          <div
            className="plannerResultsPage__itineraryUtilityModal"
            role="dialog"
            aria-modal="true"
            aria-label="Download itinerary details"
            onClick={() => setItineraryShareMenuOpen(false)}
          >
            <div
              className="plannerResultsPage__itineraryUtilityPopover"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="plannerResultsPage__itineraryUtilityClose"
                onClick={() => setItineraryShareMenuOpen(false)}
                aria-label="Close download itinerary dialog"
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  close
                </span>
              </button>
              <div className="plannerResultsPage__itineraryExportCardShell">
                <div className="plannerResultsPage__itineraryExportCard">
                  <div className="plannerResultsPage__itineraryExportHeader">
                    <h3>Orca Itinerary</h3>
                  </div>
                  <div className="plannerResultsPage__itineraryExportMeta">
                    <div className="plannerResultsPage__itineraryExportMetaBlock">
                      <span>From</span>
                      <strong>{tripCityLabel}</strong>
                    </div>
                    <div className="plannerResultsPage__itineraryExportMetaBlock">
                      <span>Date range</span>
                      <strong>{tripLabel}</strong>
                    </div>
                    <div className="plannerResultsPage__itineraryExportMetaBlock">
                      <span>Trip length</span>
                      <strong>{tripLengthLabel}</strong>
                    </div>
                  </div>
                  <div className="plannerResultsPage__itineraryExportRule" aria-hidden="true" />
                  <div className="plannerResultsPage__itineraryExportStops">
                    {itineraryPlaces.map((place, index) => (
                      <div key={`export-${place.id}`} className="plannerResultsPage__itineraryExportStop">
                        <span>{index + 1}</span>
                        <div>
                          <strong>{`${place.name} (${place.latitude.toFixed(3)}, ${place.longitude.toFixed(3)})`}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="plannerResultsPage__itineraryExportRule" aria-hidden="true" />
                  <div className="plannerResultsPage__itineraryExportChart">
                    <div className="plannerResultsPage__itineraryExportChartTitle">Typical Sightings Per Week</div>
                    <div className="plannerResultsPage__itineraryExportBars" style={weeklyChartColumnStyle}>
                      {weekBars.map((bar) => (
                        <span
                          key={`export-bar-${bar.index}`}
                          className={`plannerResultsPage__itineraryExportBar${bar.highlighted ? " isHighlighted" : ""}`}
                          style={{ height: `${Math.max(8, (bar.count / weeklyChartMax) * 100)}%` }}
                        />
                      ))}
                    </div>
                    <div className="plannerResultsPage__itineraryExportMonths" style={weeklyChartColumnStyle} aria-hidden="true">
                      {weeklyChartTicks.map((tick) => (
                        <span
                          key={`export-tick-${tick.index}`}
                          className="plannerResultsPage__itineraryExportMonth"
                          style={{ gridColumn: `${tick.index + 1} / span 1` }}
                        >
                          {tick.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="plannerResultsPage__itineraryUtilityAction"
                onClick={handleItineraryDownloadAction}
                disabled={shareBusy}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  download
                </span>
                <span>Download card</span>
              </button>
            </div>
          </div>
        ) : null}

        {plannerSubmitted && !isEditingTrip ? (
          <aside className={`plannerResultsPage__legendCard${legendCollapsed ? " isCollapsed" : ""}`}>
            <div className="plannerResultsPage__legendHead">
              <h2>{legendCollapsed ? "Legend" : "Typical Orca Activity"}</h2>
              <button
                type="button"
                className="plannerResultsPage__legendToggle"
                onClick={() => setLegendCollapsed((value) => !value)}
                aria-expanded={!legendCollapsed}
                aria-label={legendCollapsed ? "Expand activity legend" : "Collapse activity legend"}
              >
                <span className="material-symbols-rounded" aria-hidden="true">
                  {legendCollapsed ? "expand_less" : "expand_more"}
                </span>
              </button>
            </div>
            {legendCollapsed ? (
              <div className="plannerResultsPage__legendRamp" aria-hidden="true">
                {[...legendColors].reverse().map((color, index) => (
                  <span key={`${color}-${index}`} style={{ background: color }} />
                ))}
              </div>
            ) : (
              <>
                <div className="plannerResultsPage__legendList">
                  {LEGEND_LABELS.map((label, index) => (
                    <div key={label} className="plannerResultsPage__legendRow">
                      <span className="plannerResultsPage__legendSwatch" style={{ background: legendColors[index] }} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        ) : null}

        {plannerSubmitted && !isEditingTrip ? (
          <aside
            ref={sidebarRef}
            className={`plannerResultsPage__spotsCard${spotsCollapsed ? " isCollapsed" : ""}`}
          >
            <button
              type="button"
              className={`plannerResultsPage__spotsCollapseBtn${spotsCollapsed ? " isCollapsed" : ""}`}
              onClick={() => setSpotsCollapsed((value) => !value)}
              aria-expanded={!spotsCollapsed}
              aria-label={spotsCollapsed ? "Expand recommended viewing spots" : "Collapse recommended viewing spots"}
            >
              {spotsCollapsed ? <span className="plannerResultsPage__spotsCollapseLabel">Recommended Places</span> : null}
              <span className="material-symbols-rounded" aria-hidden="true">
                {spotsCollapsed ? "expand_more" : "expand_less"}
              </span>
            </button>
            <div className="plannerResultsPage__spotsHeader">
              <div className="plannerResultsPage__spotsIcon">
                <img src="/images/icons/binoculars_recreated.svg" alt="" aria-hidden="true" />
              </div>
              <div>
                <div className="plannerResultsPage__spotsEyebrow">Where to watch</div>
                <h2>Recommended Viewing Spots</h2>
                <p>Top-25 Viewing Locations for Your Trip</p>
              </div>
            </div>

            <div className="plannerResultsPage__spotsList">
              {displayedRecommendedPlaces.length === 0 &&
              plannerSubmitted &&
              !tripLoading &&
              !recommendedPlacesData.isLoading &&
              !tripError &&
              !recommendedPlacesData.error &&
              activeMaxTravelDistanceMiles ? (
                <div className="plannerResultsPage__spotsEmptyState">
                  No suggested locations within defined search radius. Expand your search radius and try again.
                </div>
              ) : (
                displayedRecommendedPlaces.map((place) => (
                  <PlannerPlaceCard
                    key={place.id}
                    place={place}
                    previewUrl={previewUrls[place.id] ?? ""}
                    photoManifest={photoManifest}
                    itineraryAdded={itineraryPlaceIds.includes(place.id)}
                    onAddToItinerary={() => handleAddPlaceToItinerary(place)}
                    onRemoveFromItinerary={() => handleRemovePlaceFromItinerary(place.id)}
                    selected={selectedPlace?.id === place.id}
                    onShowOnMap={() => {
                      setItineraryMapViewActive(false);
                      setPulseSelectedPlaceMarker(true);
                      setSelectedPlaceId(place.id);
                    }}
                  />
                ))
              )}
            </div>
          </aside>
        ) : null}

        {plannerSubmitted && !isEditingTrip && chartCollapsed ? (
          <button
            type="button"
            className="plannerResultsPage__chartCollapsedButton"
            onClick={() => setChartCollapsed(false)}
            aria-expanded="false"
          >
            <span className="plannerResultsPage__chartIcon">
              <span className="material-symbols-rounded" aria-hidden="true">
                bar_chart
              </span>
            </span>
            <span>
              <strong>Seasonal Activity</strong>
            </span>
            <span className="material-symbols-rounded" aria-hidden="true">
              expand_less
            </span>
          </button>
        ) : null}

        {plannerSubmitted && !isEditingTrip && !chartCollapsed ? (
          <section className="plannerResultsPage__bottomPanel">
            <div className={`plannerResultsPage__chartCard${chartZoomedToDays ? " isDailyZoom" : ""}`}>
              <div className="plannerResultsPage__chartHeader">
                <div className="plannerResultsPage__chartTitleWrap">
                  <div className="plannerResultsPage__chartIcon">
                    <span className="material-symbols-rounded" aria-hidden="true">
                      bar_chart
                    </span>
                  </div>
                  <div>
                    <h2>{chartZoomedToDays ? "Daily Sightings Around Your Trip" : "Typical Salish Sea Sightings by Week"}</h2>
                    {chartZoomedToDays ? <p>{tripLabel}</p> : null}
                  </div>
                </div>
                <div className="plannerResultsPage__chartHeaderActions">
                  {chartZoomMode === "daily" ? (
                    <button
                      type="button"
                      className="plannerResultsPage__chartModeButton"
                      onClick={() => setChartZoomMode("weekly")}
                    >
                      <span>Back to weekly</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="plannerResultsPage__panelCollapseBtn"
                    onClick={() => setChartCollapsed(true)}
                    aria-expanded="true"
                    aria-label="Collapse seasonal activity panel"
                  >
                    <span className="material-symbols-rounded" aria-hidden="true">
                      expand_more
                    </span>
                  </button>
                </div>
              </div>
              <div className="plannerResultsPage__chartBody">
                <div
                  ref={chartPlotRef}
                  className={`plannerResultsPage__chartPlot${tripBrushMode ? " isDraggingTripWindow" : ""}${chartZoomedToDays ? " isDailyZoom" : ""}`}
                  onClick={() => {
                    if (tripBrushMode) return;
                    setChartZoomMode("daily");
                  }}
                >
                  <div className="plannerResultsPage__chartGridLines" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  {chartZoomedToDays
                    ? (chartWindowStyle ? (
                        <div
                          className={`plannerResultsPage__tripWindowOverlay isInteractive isZoomed`}
                          style={chartWindowStyle}
                        >
                          <div className="plannerResultsPage__tripRangeSelection">
                            <div
                              className="plannerResultsPage__tripWindowMoveZone"
                              onPointerDown={(event) => handleTripBrushPointerDown("move", event)}
                            />
                            <button
                              type="button"
                              className="plannerResultsPage__tripWindowHandle plannerResultsPage__tripWindowHandle--start"
                              aria-label="Adjust trip start date"
                              onPointerDown={(event) => handleTripBrushPointerDown("start", event)}
                            />
                            <button
                              type="button"
                              className="plannerResultsPage__tripWindowHandle plannerResultsPage__tripWindowHandle--end"
                              aria-label="Adjust trip end date"
                              onPointerDown={(event) => handleTripBrushPointerDown("end", event)}
                            />
                          </div>
                        </div>
                      ) : null)
                    : tripWindowSegments.map((segment) => (
                        <div
                          key={segment.key}
                          className={`plannerResultsPage__tripWindowOverlay${tripBrushMode ? " isInteractive" : ""}`}
                          style={segment.style}
                        >
                          <div
                            className="plannerResultsPage__tripWindowHitArea"
                            onPointerDown={(event) => handleTripBrushPointerDown("move", event)}
                          >
                            {segment.handleStart ? (
                              <button
                                type="button"
                                className="plannerResultsPage__tripWindowHandle plannerResultsPage__tripWindowHandle--start"
                                aria-label="Adjust trip start date"
                                onPointerDown={(event) => handleTripBrushPointerDown("start", event)}
                              />
                            ) : null}
                            {segment.handleEnd ? (
                              <button
                                type="button"
                                className="plannerResultsPage__tripWindowHandle plannerResultsPage__tripWindowHandle--end"
                                aria-label="Adjust trip end date"
                                onPointerDown={(event) => handleTripBrushPointerDown("end", event)}
                              />
                            ) : null}
                            {segment.showLabel ? (
                              <div className="plannerResultsPage__tripWindow">
                                <span>Your trip</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                  <div className="plannerResultsPage__chartBars" style={chartColumnStyle}>
                    {chartBars.map((bar, index) => {
                      return (
                      <div key={bar.index} className="plannerResultsPage__chartBarWrap">
                        <span
                          className={`plannerResultsPage__chartBar${bar.highlighted ? " isHighlighted" : ""}`}
                          style={
                            {
                              height: `${Math.max(6, (bar.count / chartMax) * 100)}%`,
                              "--bar-delay": `${Math.max(0, index * 20)}ms`,
                            } as CSSProperties
                          }
                        />
                      </div>
                    )})}
                  </div>
                  <div className="plannerResultsPage__chartMonths" aria-hidden="true" style={chartColumnStyle}>
                    {chartTicks.map((tick) => (
                      <span
                        key={`${tick.label}-${tick.index}`}
                        className="plannerResultsPage__chartMonth"
                        style={{ gridColumn: chartZoomedToDays ? `${tick.index + 1} / span 1` : `${tick.index + 1} / span 4` }}
                      >
                        <span>{tick.label}</span>
                        {tick.sublabel ? <small>{tick.sublabel}</small> : null}
                      </span>
                    ))}
                  </div>
                  {chartZoomedToDays ? (
                    <div className="plannerResultsPage__chartMonthBands" aria-hidden="true" style={chartColumnStyle}>
                      {dailyMonthBands.map((band) => (
                        <span
                          key={`${band.label}-${band.startIndex}`}
                          className="plannerResultsPage__chartMonthBand"
                          style={{ gridColumn: `${band.startIndex + 1} / span ${band.span}` }}
                        >
                          {band.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <aside className="plannerResultsPage__insightsCard">
              <div className="plannerResultsPage__insightsHeader">
                <span className="material-symbols-rounded" aria-hidden="true">
                  insights
                </span>
                <h2>Trip insights</h2>
              </div>
              <div className="plannerResultsPage__insightsList">
                <div className="plannerResultsPage__insightRow">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    waves
                  </span>
                  <div className="plannerResultsPage__insightBody">
                    <p>Typical activity</p>
                    <strong>{activityLabel}</strong>
                  </div>
                </div>
                <div className="plannerResultsPage__insightRow plannerResultsPage__insightRow--hotspot">
                  <span className="material-symbols-rounded" aria-hidden="true">
                    location_on
                  </span>
                  <div className="plannerResultsPage__insightBody">
                    <p>Most active waters</p>
                    <strong>{topWatersLabel}</strong>
                  </div>
                  <div className="plannerResultsPage__insightToggleRow">
                    <button
                      type="button"
                      className={`plannerResultsPage__insightToggle${tripHotspotsVisible ? " isActive" : ""}`}
                      onClick={() => setTripHotspotsVisible((value) => !value)}
                      aria-pressed={tripHotspotsVisible}
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">
                        {tripHotspotsVisible ? "visibility_off" : "visibility"}
                      </span>
                      <span>{tripHotspotsVisible ? "Hide hotspot" : "Show hotspot"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          </section>
        ) : null}

        {!isEditingTrip ? <div className="plannerResultsPage__quickActions">
          {plannerSubmitted ? (
            <>
              <button type="button" className="plannerResultsPage__quickAction">
                <span className="material-symbols-rounded" aria-hidden="true">
                  videocam
                </span>
                <span>Live Cams</span>
                <em>{liveCamCount}</em>
              </button>
              <button type="button" className="plannerResultsPage__quickAction">
                <span className="material-symbols-rounded" aria-hidden="true">
                  graphic_eq
                </span>
                <span>Hydrophones</span>
                <em>{hydrophoneCount}</em>
              </button>
            </>
          ) : null}
          <div ref={settingsRef} className="plannerResultsPage__settingsDock">
            {settingsOpen && (
              <section
                className="footerDock__panel footerDock__panel--settings plannerResultsPage__settingsPanel"
                role="dialog"
                aria-modal="false"
              >
                <div className="footerDock__panelHeader footerDock__panelHeader--settings">
                  <div className="footerDock__titleRow">
                    <div>
                      <div className="footerDock__sectionLabel">Planner settings</div>
                      <div className="footerDock__title">Settings</div>
                    </div>
                  </div>
                  <div className="footerDock__headerActions">
                    <button
                      type="button"
                      className="footerDock__utilityIcon footerDock__utilityIcon--header"
                      onClick={downloadSnapshotAction}
                      disabled={shareBusy}
                      title="Download snapshot"
                      aria-label="Download snapshot"
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">
                        download
                      </span>
                    </button>
                    <button
                      type="button"
                      className="footerDock__utilityIcon footerDock__utilityIcon--header"
                      onClick={shareSnapshot}
                      disabled={shareBusy}
                      title="Share snapshot"
                      aria-label="Share snapshot"
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">
                        ios_share
                      </span>
                    </button>
                    <button
                      type="button"
                      className="footerDock__closeButton"
                      onClick={() => setSettingsOpen(false)}
                      aria-label="Close settings"
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">
                        close
                      </span>
                    </button>
                  </div>
                </div>

                <section className="footerDock__section footerDock__section--settings">
                  <div className="footerDock__sectionLabel">Appearance</div>
                  <div className="footerDock__settingRow footerDock__settingRow--button">
                    <span className="footerDock__settingLabel">Theme</span>
                    <button
                      type="button"
                      className="footerDock__modeButton"
                      onClick={() => setThemeMode(darkMode ? "light" : "dark")}
                      aria-pressed={darkMode}
                      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                    >
                      <span className="material-symbols-rounded" aria-hidden="true">
                        {darkMode ? "light_mode" : "dark_mode"}
                      </span>
                      <span>{darkMode ? "Dark mode" : "Light mode"}</span>
                    </button>
                  </div>
                  <label className="footerDock__settingRow footerDock__settingRow--select">
                    <span className="footerDock__settingLabel">Units</span>
                    <span className="footerDock__selectWrap">
                      <select
                        className="select select--footer"
                        value={unitsMode}
                        onChange={(event) => setUnitsMode(event.target.value as "imperial" | "metric")}
                        aria-label="Units"
                      >
                        <option value="imperial">Imperial</option>
                        <option value="metric">Metric</option>
                      </select>
                      <span className="material-symbols-rounded footerDock__selectChevron" aria-hidden="true">
                        expand_more
                      </span>
                    </span>
                  </label>
                </section>

                <section className="footerDock__section footerDock__section--settings">
                  <div className="footerDock__sectionLabel">Map layers</div>
                  <label className="footerDock__settingRow footerDock__settingRow--select">
                    <span className="footerDock__settingLabel">Surface view</span>
                    <span className="footerDock__settingControls footerDock__settingControls--layers">
                      <span className="footerDock__resolutionInline">
                        <H3ResolutionPill
                          value={resolution === "H4" ? 4 : resolution === "H5" ? 5 : 6}
                          onChange={(next) => setResolution(next === 4 ? "H4" : next === 5 ? "H5" : "H6")}
                          compact
                        />
                      </span>
                      <span className="footerDock__selectWrap">
                        <select
                          className="select select--footer"
                          value={surfaceMode}
                          onChange={(event) => setSurfaceMode(event.target.value as "grid" | "surface")}
                          aria-label="Surface view"
                        >
                          <option value="grid">Hex grid</option>
                          <option value="surface">Smooth</option>
                        </select>
                        <span className="material-symbols-rounded footerDock__selectChevron" aria-hidden="true">
                          expand_more
                        </span>
                      </span>
                    </span>
                  </label>
                  <div className="footerDock__settingBlock">
                    <div className="footerDock__settingCaption">Points of interest</div>
                    <div className="footerDock__toggleGrid">
                      <button
                        type="button"
                        className={poiActive ? "footerDock__chip isActive" : "footerDock__chip"}
                        onClick={() =>
                          setPoiFilters(() =>
                            poiActive
                              ? { Park: false, Marina: false, Ferry: false }
                              : { Park: true, Marina: true, Ferry: true }
                          )
                        }
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={poiFilters.Park ? "footerDock__chip isActive" : "footerDock__chip"}
                        onClick={() => setPoiFilters((current) => ({ ...current, Park: !current.Park }))}
                      >
                        <span className="footerDock__chipInner">
                          <span className="footerDock__chipIcons footerDock__chipIcons--park" aria-hidden="true">
                            <span className="material-symbols-rounded">park</span>
                          </span>
                          <span>Parks</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={poiFilters.Marina ? "footerDock__chip isActive" : "footerDock__chip"}
                        onClick={() => setPoiFilters((current) => ({ ...current, Marina: !current.Marina }))}
                      >
                        <span className="footerDock__chipInner">
                          <span className="footerDock__chipIcons footerDock__chipIcons--marina" aria-hidden="true">
                            <span className="material-symbols-rounded">anchor</span>
                          </span>
                          <span>Marinas</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={poiFilters.Ferry ? "footerDock__chip isActive" : "footerDock__chip"}
                        onClick={() => setPoiFilters((current) => ({ ...current, Ferry: !current.Ferry }))}
                      >
                        <span className="footerDock__chipInner">
                          <span className="footerDock__chipIcons footerDock__chipIcons--ferry" aria-hidden="true">
                            <span className="material-symbols-rounded">directions_boat</span>
                          </span>
                          <span>Ferries</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </section>

                <section className="footerDock__section footerDock__section--settings">
                  <div className="footerDock__sectionLabel">Color scale</div>
                  <div className="footerDock__settingBlock">
                    <div className="footerDock__settingCaption">Palette</div>
                    <button
                      type="button"
                      className={`footerDock__paletteTrigger${paletteOpen ? " isOpen" : ""}`}
                      onClick={() => setPaletteOpen((value) => !value)}
                      aria-expanded={paletteOpen}
                      aria-label="Color scale"
                    >
                      <span className="footerDock__paletteTriggerMain">
                        <span className="footerDock__paletteSwatches" aria-hidden="true">
                          {PALETTES[selectedPaletteId].colors.slice(0, 5).map((color, index) => (
                            <span
                              key={`${selectedPaletteId}-active-${index}`}
                              className="footerDock__paletteSwatch"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </span>
                        <span className="footerDock__paletteName">{PALETTES[selectedPaletteId].name}</span>
                      </span>
                      <span className="material-symbols-rounded footerDock__paletteChevron" aria-hidden="true">
                        expand_more
                      </span>
                    </button>
                    {paletteOpen && (
                      <div className="footerDock__paletteList" role="listbox" aria-label="Color scale palettes">
                        {paletteEntries.map((palette) => {
                          const selected = palette.id === selectedPaletteId;
                          return (
                            <button
                              key={palette.id}
                              type="button"
                              className={`footerDock__paletteRow${selected ? " isSelected" : ""}`}
                              onClick={() => {
                                setSelectedPaletteId(palette.id);
                                setPaletteOpen(false);
                              }}
                            >
                              <span className="footerDock__paletteSwatches" aria-hidden="true">
                                {palette.colors.slice(0, 5).map((color, index) => (
                                  <span
                                    key={`${palette.id}-${index}`}
                                    className="footerDock__paletteSwatch"
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </span>
                              <span className="footerDock__paletteName">{palette.name}</span>
                              <span className="material-symbols-rounded footerDock__paletteCheck" aria-hidden="true">
                                {selected ? "check" : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <label className="footerDock__settingRow footerDock__settingRow--select">
                    <span className="footerDock__settingLabel">Color no data</span>
                    <span className="footerDock__selectWrap">
                      <select
                        className="select select--footer"
                        value={colorNoData}
                        onChange={(event) => setColorNoData(event.target.value as "off" | "on")}
                        aria-label="Color no data"
                      >
                        <option value="off">No</option>
                        <option value="on">Yes</option>
                      </select>
                      <span className="material-symbols-rounded footerDock__selectChevron" aria-hidden="true">
                        expand_more
                      </span>
                    </span>
                  </label>
                </section>
              </section>
            )}

            <button
              type="button"
              className={`plannerResultsPage__quickAction plannerResultsPage__quickAction--settings${settingsOpen ? " isActive" : ""}`}
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              aria-label="Open planner settings"
            >
              <span className="material-symbols-rounded" aria-hidden="true">
                settings
              </span>
            </button>
          </div>
        </div> : null}

        {(tripLoading || tripError || recommendedPlacesData.error) && (
          <div className="plannerResultsPage__statusBanner">
            {tripLoading
              ? "Loading historical sightings and trip recommendations…"
              : tripError || recommendedPlacesData.error || "Planner results are unavailable."}
          </div>
        )}

        <Suspense fallback={null}>
          {infoOpen && (
            <InfoModal
              open={infoOpen}
              onClose={() => setInfoOpen(false)}
              onStartTour={() => setInfoOpen(false)}
              darkMode={darkMode}
            />
          )}
        </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
