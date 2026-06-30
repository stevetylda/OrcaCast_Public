const counters = new Map<string, number>();
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

export function isPerfDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugPerf") === "1";
}

function bumpCounter(key: string): number {
  const next = (counters.get(key) ?? 0) + 1;
  counters.set(key, next);
  return next;
}

export function trackPerfCounter(key: string, meta?: Record<string, unknown>): number {
  const count = bumpCounter(key);
  if (isPerfDebugEnabled()) {
    console.info(`[Perf] ${key}`, { count, ...meta });
  }
  return count;
}

export function trackRender(name: string, meta?: Record<string, unknown>): number {
  return trackPerfCounter(`render:${name}`, meta);
}

export function trackFetch(url: string, attempt: number): number {
  return trackPerfCounter("fetch:request", { url, attempt });
}

export function trackLayerRebuild(name: string, meta?: Record<string, unknown>): number {
  return trackPerfCounter(`layers:${name}`, meta);
}

export function getPerfObjectId(value: unknown): string {
  if (value == null) return "null";
  if (typeof value !== "object") return String(value);
  const existing = objectIds.get(value);
  if (existing) return String(existing);
  const next = nextObjectId++;
  objectIds.set(value, next);
  return String(next);
}
