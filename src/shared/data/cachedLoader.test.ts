import { describe, expect, it, vi } from "vitest";
import { createCachedLoader } from "./cachedLoader";

describe("cached resource recovery", () => {
  it("shares concurrent loads and preserves successful results", async () => {
    const fetch = vi.fn().mockResolvedValue([1]);
    const loader = createCachedLoader(fetch);
    const first = loader.load();
    expect(loader.load()).toBe(first);
    await expect(first).resolves.toEqual([1]);
    expect(loader.load()).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retries a rejected load", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([2]);
    const loader = createCachedLoader(fetch);
    await expect(loader.load()).rejects.toThrow("offline");
    await expect(loader.load()).resolves.toEqual([2]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not let an old rejection invalidate a newer version", async () => {
    let rejectOld!: (reason: Error) => void;
    let version = "";
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOld = reject;
          }),
      )
      .mockResolvedValueOnce("new");
    const loader = createCachedLoader(fetch, () => version);
    const old = loader.load();
    const rejected = expect(old).rejects.toThrow("old");
    await Promise.resolve();
    version = "published-v2";
    const current = loader.load();
    await expect(current).resolves.toBe("new");
    rejectOld(new Error("old"));
    await rejected;
    expect(loader.load()).toBe(current);
  });
  it("allows an explicit reset after success", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const loader = createCachedLoader(fetch);
    await expect(loader.load()).resolves.toBe(1);
    loader.reset();
    await expect(loader.load()).resolves.toBe(2);
  });
});
