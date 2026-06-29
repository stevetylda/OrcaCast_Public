import { fetchText } from "./fetchClient";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

export async function runFetchClientUnitTests() {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  (globalThis as unknown as { window: Partial<Window> }).window = {
    location: {
      href: "https://example.test/app/map",
      origin: "https://example.test",
      search: "",
    } as Location,
    setTimeout: globalThis.setTimeout.bind(globalThis) as typeof window.setTimeout,
    clearTimeout: globalThis.clearTimeout.bind(globalThis) as typeof window.clearTimeout,
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (calls.length === 1) {
      return new Response("not found", { status: 404 });
    }
    return new Response("ok", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await fetchText("data/fallback.json", { retries: 0 });
    assert(result.text === "ok", "Expected second candidate to be returned after first candidate 404");
    assert(calls.length === 2, `Expected two candidate URLs, got ${calls.length}`);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
}
