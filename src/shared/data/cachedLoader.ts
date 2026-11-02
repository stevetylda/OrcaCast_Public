/** Share in-flight/successful loads. A failed attempt never poisons future calls. */
export function createCachedLoader<T>(
  load: () => Promise<T>,
  version: () => string = () => "",
) {
  let entry: { key: string; promise: Promise<T> } | null = null;
  return {
    load() {
      const key = version();
      if (entry?.key === key) return entry.promise;
      const next = { key, promise: Promise.resolve().then(load) };
      next.promise = next.promise.catch((error: unknown) => {
        if (entry === next) entry = null;
        throw error;
      });
      entry = next;
      return next.promise;
    },
    reset() {
      entry = null;
    },
  };
}
