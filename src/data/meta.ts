import { DataLoadError } from "./errors";
import { fetchJson } from "./fetchClient";
import { dataMetaFileSchema, parseWithSchema } from "./validation";

export type DataMeta = {
  data_version: string;
  generated_at: string;
  active_explainability_context?: string;
};

const FALLBACK_DATA_VERSION = "";
const VITE_ENV = (import.meta as { env?: { BASE_URL?: string; VITE_BUILD_ID?: string } }).env;
const BUILD_VERSION =
  typeof VITE_ENV?.VITE_BUILD_ID === "string" && VITE_ENV.VITE_BUILD_ID.trim().length > 0
    ? VITE_ENV.VITE_BUILD_ID.trim()
    : "";
let cachedMetaPromise: Promise<DataMeta> | null = null;
let resolvedMeta: DataMeta | null = null;
let resolvedDataVersionToken: string | null = null;

function withBase(path: string): string {
  const base = VITE_ENV?.BASE_URL || "/";
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${trimmed}`;
}

function metaUrlCandidates(): string[] {
  return [withBase("data/meta.json"), withBase("data/version.json")];
}

function normalizeMeta(payload: Record<string, unknown>): DataMeta {
  const dataVersion =
    (typeof payload.data_version === "string" && payload.data_version.trim().length > 0
      ? payload.data_version.trim()
      : typeof payload.version === "string" && payload.version.trim().length > 0
        ? payload.version.trim()
        : typeof payload.build_id === "string" && payload.build_id.trim().length > 0
          ? payload.build_id.trim()
          : typeof payload.buildId === "string" && payload.buildId.trim().length > 0
            ? payload.buildId.trim()
            : FALLBACK_DATA_VERSION);
  return {
    data_version: dataVersion,
    generated_at:
      typeof payload.generated_at === "string" && payload.generated_at.trim().length > 0
        ? payload.generated_at.trim()
        : "",
    active_explainability_context:
      typeof payload.active_explainability_context === "string" &&
      payload.active_explainability_context.trim().length > 0
        ? payload.active_explainability_context.trim()
        : undefined,
  };
}

export function getCachedDataMeta(): DataMeta | null {
  return resolvedMeta;
}

export function getDataVersionToken(): string {
  if (resolvedDataVersionToken !== null) return resolvedDataVersionToken;
  if (resolvedMeta?.data_version) {
    resolvedDataVersionToken = resolvedMeta.data_version;
    return resolvedDataVersionToken;
  }
  if (BUILD_VERSION) {
    resolvedDataVersionToken = BUILD_VERSION;
    return resolvedDataVersionToken;
  }
  resolvedDataVersionToken = FALLBACK_DATA_VERSION;
  return resolvedDataVersionToken;
}

export async function loadDataMeta(): Promise<DataMeta> {
  if (resolvedMeta) return resolvedMeta;
  if (!cachedMetaPromise) {
    cachedMetaPromise = (async () => {
      let lastNotFound: DataLoadError | null = null;
      for (const url of metaUrlCandidates()) {
        try {
          const { url: resolvedUrl, data: payload } = await fetchJson<unknown>(url, { cache: "force-cache" });
          const validPayload = parseWithSchema(dataMetaFileSchema, payload, resolvedUrl, "Metadata file");
          return normalizeMeta(validPayload);
        } catch (error) {
          if (error instanceof DataLoadError && error.kind === "http" && error.status === 404) {
            lastNotFound = error;
            continue;
          }
          throw error;
        }
      }
      throw (
        lastNotFound ??
        new DataLoadError({
          kind: "http",
          url: withBase("data/meta.json"),
          status: 404,
          message: "No metadata file found",
        })
      );
    })()
      .then((meta) => {
        resolvedMeta = meta;
        if (resolvedDataVersionToken === null) {
          resolvedDataVersionToken = meta.data_version || BUILD_VERSION || FALLBACK_DATA_VERSION;
        }
        return meta;
      });
  }
  return cachedMetaPromise;
}

export async function primeDataMeta(): Promise<DataMeta> {
  return loadDataMeta();
}
