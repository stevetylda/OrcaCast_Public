import type { LayerSourceConfig, SourceKind } from "../config/mapLayers";

export type ResolvedLayerSource = {
  kind: SourceKind;
  url: string;
  sourceLayer?: string;
  isFallback: boolean;
};

const availabilityCache = new Map<string, boolean>();

function probeUrl(url: string): string {
  if (url.startsWith("pmtiles://")) return url.slice("pmtiles://".length);
  return url.replace("{z}", "0").replace("{x}", "0").replace("{y}", "0");
}

async function urlExists(url: string): Promise<boolean> {
  const target = probeUrl(url);
  if (availabilityCache.has(target)) return availabilityCache.get(target) ?? false;
  try {
    const isPmtiles = /\.pmtiles(\?|$)/i.test(target);
    if (isPmtiles) {
      const res = await fetch(target, { method: "HEAD", cache: "no-store" });
      const ok = res.ok;
      availabilityCache.set(target, ok);
      return ok;
    }

    const isVectorTile = /\.pbf(\?|$)/i.test(target);
    if (!isVectorTile) {
      const res = await fetch(target, { method: "HEAD", cache: "no-store" });
      const ok = res.ok;
      availabilityCache.set(target, ok);
      return ok;
    }

    const res = await fetch(target, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      availabilityCache.set(target, false);
      return false;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    // MapLibre expects decoded MVT protobuf bytes; if we receive gzip bytes
    // without proper content-encoding handling, parsing fails.
    const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    const ok = !isGzip;
    availabilityCache.set(target, ok);
    return ok;
  } catch {
    availabilityCache.set(target, false);
    return false;
  }
}

export async function resolveLayerSource(config: LayerSourceConfig): Promise<ResolvedLayerSource> {
  const primaryExists = await urlExists(config.source_url);
  if (primaryExists) {
    return {
      kind: config.source_kind,
      url: config.source_url,
      sourceLayer: config.source_layer,
      isFallback: false,
    };
  }

  if (config.fallback_source_kind && config.fallback_source_url) {
     
    console.warn(`[MapData] Missing ${config.source_kind} source for ${config.id}; falling back to ${config.fallback_source_kind}.`);
    return {
      kind: config.fallback_source_kind,
      url: config.fallback_source_url,
      sourceLayer: config.fallback_source_layer,
      isFallback: true,
    };
  }

  return {
    kind: config.source_kind,
    url: config.source_url,
    sourceLayer: config.source_layer,
    isFallback: false,
  };
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let handle: number | null = null;
  return ((...args: Parameters<T>) => {
    if (handle !== null) {
      window.clearTimeout(handle);
    }
    handle = window.setTimeout(() => {
      fn(...args);
      handle = null;
    }, ms);
  }) as T;
}
