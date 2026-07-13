import { fetchJson } from "./fetchClient";
import { getDataVersionToken } from "./meta";

export type SpotPhotoLicense =
  | "public_domain"
  | "cc0"
  | "cc_by_4_0"
  | "cc_by_3_0"
  | "cc_by_sa_4_0"
  | "unsplash"
  | "pexels";

export type SpotPhotoStatus = "missing" | "candidate" | "approved";

export interface ViewingSpotPhoto {
  spotId: string;
  imageSrc?: string;
  alt: string;
  status: SpotPhotoStatus;
  title?: string;
  creator?: string;
  sourceName?: string;
  sourceUrl?: string;
  license?: SpotPhotoLicense;
  licenseUrl?: string;
  focalPoint?: string;
  notes?: string;
}

export type ViewingSpotPhotoManifest = Record<string, ViewingSpotPhoto>;

const VIEWING_SPOT_PHOTO_MANIFEST_URL_CANDIDATES = [
  `${(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/")}data/places/viewing_spot_photos.json`,
  "/data/places/viewing_spot_photos.json",
  "data/places/viewing_spot_photos.json",
];

const VALID_LICENSES: SpotPhotoLicense[] = [
  "public_domain",
  "cc0",
  "cc_by_4_0",
  "cc_by_3_0",
  "cc_by_sa_4_0",
  "unsplash",
  "pexels",
];

const VALID_STATUSES: SpotPhotoStatus[] = ["missing", "candidate", "approved"];

let cachedManifest: ViewingSpotPhotoManifest | null = null;
let cachedManifestPromise: Promise<ViewingSpotPhotoManifest> | null = null;
let validatedManifest = false;

function isValidLicense(value: unknown): value is SpotPhotoLicense {
  return (
    typeof value === "string" &&
    VALID_LICENSES.includes(value as SpotPhotoLicense)
  );
}

function isValidStatus(value: unknown): value is SpotPhotoStatus {
  return (
    typeof value === "string" &&
    VALID_STATUSES.includes(value as SpotPhotoStatus)
  );
}

function normalizeViewingSpotPhoto(
  key: string,
  value: unknown,
): ViewingSpotPhoto | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ViewingSpotPhoto>;
  if (
    typeof candidate.spotId !== "string" ||
    candidate.spotId.trim().length === 0
  )
    return null;
  if (candidate.spotId !== key)
    return {
      ...candidate,
      spotId: String(candidate.spotId),
      alt: String(candidate.alt ?? ""),
      status: isValidStatus(candidate.status) ? candidate.status : "missing",
    };
  if (!isValidStatus(candidate.status)) return null;
  if (typeof candidate.alt !== "string") return null;

  return {
    spotId: candidate.spotId,
    imageSrc:
      typeof candidate.imageSrc === "string" ? candidate.imageSrc : undefined,
    alt: candidate.alt,
    status: candidate.status,
    title: typeof candidate.title === "string" ? candidate.title : undefined,
    creator:
      typeof candidate.creator === "string" ? candidate.creator : undefined,
    sourceName:
      typeof candidate.sourceName === "string"
        ? candidate.sourceName
        : undefined,
    sourceUrl:
      typeof candidate.sourceUrl === "string" ? candidate.sourceUrl : undefined,
    license: isValidLicense(candidate.license) ? candidate.license : undefined,
    licenseUrl:
      typeof candidate.licenseUrl === "string"
        ? candidate.licenseUrl
        : undefined,
    focalPoint:
      typeof candidate.focalPoint === "string"
        ? candidate.focalPoint
        : undefined,
    notes: typeof candidate.notes === "string" ? candidate.notes : undefined,
  };
}

function normalizeManifest(payload: unknown): ViewingSpotPhotoManifest {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return {};
  const manifest: ViewingSpotPhotoManifest = {};
  for (const [key, value] of Object.entries(payload)) {
    const normalized = normalizeViewingSpotPhoto(key, value);
    if (normalized) manifest[key] = normalized;
  }
  return manifest;
}

export function getViewingSpotPhoto(
  spotId?: string,
  manifest?: ViewingSpotPhotoManifest,
): ViewingSpotPhoto | undefined {
  if (!spotId) return undefined;
  return (manifest ?? cachedManifest ?? {})[spotId];
}

export function hasApprovedSpotPhoto(photo?: ViewingSpotPhoto): boolean {
  return Boolean(photo?.status === "approved" && photo.imageSrc);
}

export function getSpotPhotoAttribution(
  photo?: ViewingSpotPhoto,
): string | undefined {
  if (!photo || photo.status !== "approved") return undefined;
  const parts = [
    photo.title,
    photo.creator,
    photo.sourceName,
    photo.license,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function validateViewingSpotPhotos(
  manifest: ViewingSpotPhotoManifest,
): void {
  if (!import.meta.env.DEV) return;

  const seenSpotIds = new Set<string>();
  for (const [key, photo] of Object.entries(manifest)) {
    if (key !== photo.spotId) {
      console.warn(`[spot photos] Manifest key does not match spotId: ${key}`);
    }
    if (seenSpotIds.has(photo.spotId)) {
      console.warn(`[spot photos] Duplicate spotId found: ${photo.spotId}`);
    }
    seenSpotIds.add(photo.spotId);

    if (photo.status === "approved") {
      if (!photo.imageSrc) {
        console.warn(`[spot photos] Approved photo missing imageSrc: ${key}`);
      }
      if (!photo.alt) {
        console.warn(`[spot photos] Approved photo missing alt text: ${key}`);
      }
      if (!photo.sourceName || !photo.sourceUrl || !photo.license) {
        console.warn(
          `[spot photos] Approved photo missing attribution metadata: ${key}`,
        );
      }
    }
  }
}

export async function loadViewingSpotPhotoManifest(): Promise<ViewingSpotPhotoManifest> {
  if (cachedManifest) return cachedManifest;
  if (cachedManifestPromise) return cachedManifestPromise;

  cachedManifestPromise = (async () => {
    for (const url of VIEWING_SPOT_PHOTO_MANIFEST_URL_CANDIDATES) {
      try {
        const { data } = await fetchJson<unknown>(url, {
          cache: "force-cache",
          cacheToken: getDataVersionToken(),
        });
        const manifest = normalizeManifest(data);
        cachedManifest = manifest;
        if (!validatedManifest) {
          validateViewingSpotPhotos(manifest);
          validatedManifest = true;
        }
        return manifest;
      } catch {
        // Try next candidate URL.
      }
    }

    cachedManifest = {};
    return cachedManifest;
  })();

  return cachedManifestPromise;
}
