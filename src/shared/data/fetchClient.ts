import { DataLoadError } from "./errors";
import { trackFetch } from "../debug/perf";

type FetchCacheMode = RequestCache;

export type FetchClientOptions = {
  cache?: FetchCacheMode;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  cacheToken?: string | null;
};

function withBase(url: string): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || "/";
  const basePrefix = base.endsWith("/") ? base.slice(0, -1) : base;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return `${basePrefix}/${url}`;
}

export function buildUrlCandidates(url: string): string[] {
  const candidates = new Set<string>();
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL || "/";
  const basePrefix = base.endsWith("/") ? base.slice(0, -1) : base;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    candidates.add(url);
  } else if (url.startsWith("/")) {
    candidates.add(`${window.location.origin}${url}`);
    candidates.add(`${basePrefix}${url}`);
    candidates.add(url);
  } else {
    try {
      candidates.add(new URL(url, window.location.href).toString());
    } catch {
      // no-op
    }
    candidates.add(`${base}${url}`);
    candidates.add(url);
  }
  return Array.from(candidates);
}

function applyCacheToken(url: string, cacheToken?: string | null): string {
  if (!cacheToken) return url;
  const resolved = new URL(withBase(url), window.location.origin);
  resolved.searchParams.set("v", cacheToken);
  return resolved.toString();
}

function shouldRetry(error: DataLoadError): boolean {
  return error.kind === "network" || error.kind === "timeout" || (error.kind === "http" && (error.status ?? 0) >= 500);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function fetchText(url: string, options: FetchClientOptions = {}): Promise<{ url: string; text: string }> {
  const {
    cache = "force-cache",
    timeoutMs = 10000,
    retries = 2,
    retryDelayMs = 250,
    cacheToken,
  } = options;
  const candidates = buildUrlCandidates(url).map((candidate) => applyCacheToken(candidate, cacheToken));
  let lastError: DataLoadError | null = null;
  const attemptedUrls: string[] = [];

  for (const candidate of candidates) {
    attemptedUrls.push(candidate);
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        trackFetch(candidate, attempt + 1);
        const response = await fetch(candidate, { cache, signal: controller.signal });
        window.clearTimeout(timeoutId);
        if (!response.ok) {
          const error = new DataLoadError({
            kind: "http",
            url: candidate,
            status: response.status,
            message: `Request failed (${response.status})`,
          });
          if (attempt < retries && shouldRetry(error)) {
            await delay(retryDelayMs * (attempt + 1));
            continue;
          }
          lastError = error;
          break;
        }
        return { url: candidate, text: await response.text() };
      } catch (cause) {
        window.clearTimeout(timeoutId);
        const error =
          cause instanceof DOMException && cause.name === "AbortError"
            ? new DataLoadError({
                kind: "timeout",
                url: candidate,
                message: `Request timed out after ${timeoutMs}ms`,
                cause,
              })
            : new DataLoadError({
                kind: "network",
                url: candidate,
                message: "Network request failed",
                cause,
              });
        if (attempt < retries && shouldRetry(error)) {
          await delay(retryDelayMs * (attempt + 1));
          continue;
        }
        lastError = error;
        break;
      }
    }
  }

  const error = lastError ?? new DataLoadError({ kind: "network", url, message: "Request failed" });
  error.details = [error.details, `Attempted URLs: ${attemptedUrls.join(", ")}`].filter(Boolean).join("\n");
  throw error;
}

export async function fetchJson<T>(url: string, options: FetchClientOptions = {}): Promise<{ url: string; data: T }> {
  const { url: resolvedUrl, text } = await fetchText(url, options);
  const trimmed = text.trim();
  if (trimmed.startsWith("<")) {
    throw new DataLoadError({
      kind: "invalid_content",
      url: resolvedUrl,
      message: "Received HTML instead of JSON",
    });
  }
  try {
    return { url: resolvedUrl, data: JSON.parse(text) as T };
  } catch (cause) {
    throw new DataLoadError({
      kind: "invalid_json",
      url: resolvedUrl,
      message: "Response is not valid JSON",
      cause,
      details: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
