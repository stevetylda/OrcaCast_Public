import type { PublicPoi } from "../../features/locations/poiData";
import type {
  WebcamFeed,
  WebcamSite,
  WebcamStatus,
} from "../../features/locations/types";
import { resolveAppAssetPath } from "../config/basePath";

export type WebcamPayload = {
  version: string;
  updatedAt: string;
  items: WebcamSite[];
};

const WEBCAM_STATUSES = new Set<WebcamStatus>([
  "verified-current",
  "current-frame-verified",
  "landing-verified",
  "directory-current",
  "seasonal",
]);

let webcamPayloadPromise: Promise<WebcamPayload> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSafeWebcamUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid webcam ${field}`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeFeed(value: unknown, feedIds: Set<string>): WebcamFeed {
  if (!isRecord(value)) throw new Error("Invalid webcam feed");
  const id = requiredString(value.id, "feed id");
  if (feedIds.has(id)) throw new Error(`Duplicate webcam feed id ${id}`);
  feedIds.add(id);
  const status = requiredString(value.status, "status") as WebcamStatus;
  if (!WEBCAM_STATUSES.has(status)) {
    throw new Error(`Invalid webcam status ${status}`);
  }
  if (!isSafeWebcamUrl(value.accessUrl)) {
    throw new Error(`Invalid webcam access URL for ${id}`);
  }
  if (value.evidenceUrl !== undefined && !isSafeWebcamUrl(value.evidenceUrl)) {
    throw new Error(`Invalid webcam evidence URL for ${id}`);
  }
  const verifiedAt = requiredString(value.verifiedAt, "verification date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) {
    throw new Error(`Invalid webcam verification date for ${id}`);
  }
  const tier = Number(value.tier);
  if (tier !== 1 && tier !== 2)
    throw new Error(`Invalid webcam tier for ${id}`);
  const priorityScore = Number(value.priorityScore);
  if (
    !Number.isFinite(priorityScore) ||
    priorityScore < 0 ||
    priorityScore > 100
  ) {
    throw new Error(`Invalid webcam priority score for ${id}`);
  }
  return {
    id,
    name: requiredString(value.name, "feed name"),
    operator: requiredString(value.operator, "operator"),
    accessUrl: value.accessUrl,
    feedFormat: requiredString(value.feedFormat, "feed format"),
    status,
    statusEvidence: optionalString(value.statusEvidence),
    verifiedAt,
    tier,
    priorityScore,
    targetSpecies: optionalString(value.targetSpecies),
    seasonality: optionalString(value.seasonality),
    caveat: optionalString(value.caveat),
    appMode: optionalString(value.appMode),
    evidenceUrl: optionalString(value.evidenceUrl),
  };
}

export function normalizeWebcamPayload(payload: unknown): WebcamPayload {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error("Invalid webcam payload");
  }
  const siteIds = new Set<string>();
  const feedIds = new Set<string>();
  const items = payload.items.map((value) => {
    if (!isRecord(value)) throw new Error("Invalid webcam site");
    const id = requiredString(value.id, "site id");
    if (siteIds.has(id)) throw new Error(`Duplicate webcam site id ${id}`);
    siteIds.add(id);
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error(`Invalid webcam latitude for ${id}`);
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error(`Invalid webcam longitude for ${id}`);
    }
    if (!Array.isArray(value.feeds) || value.feeds.length === 0) {
      throw new Error(`Webcam site ${id} needs at least one feed`);
    }
    const feeds = value.feeds
      .map((feed) => normalizeFeed(feed, feedIds))
      .sort(
        (a, b) =>
          b.priorityScore - a.priorityScore || a.name.localeCompare(b.name),
      );
    return {
      id,
      name: requiredString(value.name, "site name"),
      region: requiredString(value.region, "region"),
      locality: requiredString(value.locality, "locality"),
      waterbody: requiredString(value.waterbody, "waterbody"),
      latitude,
      longitude,
      coordinateQuality: requiredString(
        value.coordinateQuality,
        "coordinate quality",
      ),
      priorityScore: Math.max(...feeds.map((feed) => feed.priorityScore)),
      liveCameraUrl: feeds[0].accessUrl,
      feeds,
    } satisfies WebcamSite;
  });
  items.sort(
    (a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name),
  );
  return {
    version: requiredString(payload.version, "payload version"),
    updatedAt: requiredString(payload.updatedAt, "payload update date"),
    items,
  };
}

async function fetchWebcamPayload(): Promise<WebcamPayload> {
  const url = resolveAppAssetPath("data/webcams.json");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load webcam data (${response.status}) from ${url}`,
    );
  }
  return normalizeWebcamPayload(await response.json());
}

function cameraSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function mergePoiCamerasIntoWebcamSites(
  sites: WebcamSite[],
  pois: PublicPoi[],
): WebcamSite[] {
  const urls = new Set(
    sites.flatMap((site) => site.feeds.map((feed) => feed.accessUrl.trim())),
  );
  const coordinates = new Set(
    sites.map(
      (site) => `${site.latitude.toFixed(6)},${site.longitude.toFixed(6)}`,
    ),
  );
  const additions = pois.flatMap((poi, index) => {
    if (!poi.hasLiveFeed || !isSafeWebcamUrl(poi.liveCameraUrl)) return [];
    const coordinateKey = `${poi.latitude.toFixed(6)},${poi.longitude.toFixed(6)}`;
    if (urls.has(poi.liveCameraUrl.trim()) || coordinates.has(coordinateKey)) {
      return [];
    }
    const id = `poi-camera-${index}-${cameraSlug(poi.name)}`;
    return [
      {
        id,
        name: poi.name,
        region: poi.region ?? "Viewing location",
        locality: poi.name,
        waterbody: poi.region ?? "Salish Sea",
        latitude: poi.latitude,
        longitude: poi.longitude,
        coordinateQuality: "POI coordinates",
        priorityScore: 0,
        liveCameraUrl: poi.liveCameraUrl,
        feeds: [
          {
            id,
            name: poi.name,
            operator: poi.region ?? "Camera operator",
            accessUrl: poi.liveCameraUrl,
            feedFormat: "Webcam",
            status: "listed",
            priorityScore: 0,
          },
        ],
      } satisfies WebcamSite,
    ];
  });
  return [...sites, ...additions].sort(
    (a, b) => b.priorityScore - a.priorityScore || a.name.localeCompare(b.name),
  );
}

export function loadWebcamPayload() {
  webcamPayloadPromise ??= fetchWebcamPayload();
  return webcamPayloadPromise;
}

export async function loadWebcamSites() {
  return (await loadWebcamPayload()).items;
}

export function resetWebcamCacheForTests() {
  webcamPayloadPromise = null;
}
