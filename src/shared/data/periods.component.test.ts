import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./fetchClient";
import { loadPeriodsForResolution, resetPeriodsCache } from "./periods";
vi.mock("./fetchClient", () => ({ fetchJson: vi.fn() }));
beforeEach(() => {
  resetPeriodsCache();
  vi.resetAllMocks();
});
describe("forecast manifest coverage", () => {
  it("does not advertise H6 coverage when the manifest lists H4 only", async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({
        url: "periods.json",
        data: [{ year: 2026, stat_week: 29 }],
      })
      .mockResolvedValueOnce({
        url: "manifest.json",
        data: { files: ["2026_29_H4.json"] },
      });
    expect(await loadPeriodsForResolution("H6", "forecasts/test")).toEqual([]);
  });
  it("keeps unknown manifest status separate from a verified empty manifest", async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({
        url: "periods.json",
        data: [{ year: 2026, stat_week: 29 }],
      })
      .mockRejectedValueOnce(new Error("offline"));
    await expect(
      loadPeriodsForResolution("H6", "forecasts/test", {
        requireManifest: true,
      }),
    ).rejects.toThrow("manifest is unavailable");
  });
  it("accepts files with the forecast directory prefix", async () => {
    vi.mocked(fetchJson)
      .mockResolvedValueOnce({
        url: "periods.json",
        data: [{ year: 2026, stat_week: 29 }],
      })
      .mockResolvedValueOnce({
        url: "manifest.json",
        data: { files: ["forecasts/test/2026_29_H6.json"] },
      });
    expect(
      await loadPeriodsForResolution("H6", "forecasts/test", {
        requireManifest: true,
      }),
    ).toEqual([
      expect.objectContaining({ fileId: "2026_29", forecastAvailable: true }),
    ]);
  });
});
