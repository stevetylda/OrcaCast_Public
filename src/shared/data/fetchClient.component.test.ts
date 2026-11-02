import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchText } from "./fetchClient";

describe("fetch client path resolution", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests one canonical app-relative URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchText("/data/example.txt", { retries: 0 }),
    ).resolves.toMatchObject({ url: "/data/example.txt", text: "ok" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/data/example.txt",
      expect.objectContaining({ cache: "force-cache" }),
    );
  });
});

it("times out while reading a stalled response body", async () => {
  vi.useFakeTimers();
  let release!: (value: string) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((_url, { signal }) =>
      Promise.resolve({
        ok: true,
        text: () =>
          new Promise<string>((resolve, reject) => {
            release = resolve;
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      }),
    ),
  );
  try {
    const result = fetchText("/data/stalled.json", {
      timeoutMs: 25,
      retries: 0,
    }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(30);
    release("late body");
    expect(await result).toMatchObject({ kind: "timeout" });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
