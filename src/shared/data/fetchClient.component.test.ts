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
