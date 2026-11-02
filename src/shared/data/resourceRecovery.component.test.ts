import { afterEach, expect, it, vi } from "vitest";
import webcamFixture from "../../../public/data/webcams.json";
import poiFixture from "../../../public/data/places_of_interest.json";
import hydrophoneFixture from "../../../public/data/orcasound_hydrophones.json";
import { loadWebcamSites, resetWebcamCacheForTests } from "./webcams";
import {
  loadPoiData,
  resetPoiDataCacheForTests,
} from "../../features/locations/poiData";
import {
  loadOrcasoundHydrophonePayload,
  resetOrcasoundHydrophonesCacheForTests,
} from "./orcasoundHydrophones";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
for (const [label, load, reset, fixture, path] of [
  [
    "webcams",
    loadWebcamSites,
    resetWebcamCacheForTests,
    webcamFixture,
    "/data/webcams.json",
  ],
  [
    "places",
    loadPoiData,
    resetPoiDataCacheForTests,
    poiFixture,
    "/data/places_of_interest.json",
  ],
  [
    "hydrophones",
    loadOrcasoundHydrophonePayload,
    resetOrcasoundHydrophonesCacheForTests,
    hydrophoneFixture,
    "/data/orcasound_hydrophones.json",
  ],
] as const) {
  it(`${label} can recover after a failed canonical request`, async () => {
    reset();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fixture), { status: 200 }),
      );
    await expect(load()).rejects.toThrow("Request failed (404)");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(path);
    const recovered = await load();
    expect(
      Array.isArray(recovered) ? recovered.length : recovered.items.length,
    ).toBeGreaterThan(0);
    await load();
    expect(fetch).toHaveBeenCalledTimes(2);
    reset();
  });
}
it("does not permanently cache a failed photo manifest as empty", async () => {
  vi.resetModules();
  const { loadViewingSpotPhotoManifest } = await import("./viewingSpotPhotos");
  const payload = { park: { spotId: "park", alt: "Park", status: "missing" } };
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
  await expect(loadViewingSpotPhotoManifest()).rejects.toThrow();
  await expect(loadViewingSpotPhotoManifest()).resolves.toEqual(
    expect.objectContaining(payload),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("adopts metadata even when the version was requested before priming", async () => {
  vi.stubEnv("VITE_BUILD_ID", "");
  vi.resetModules();
  const { getDataVersionToken, loadDataMeta } = await import("./meta");
  expect(getDataVersionToken()).toBe("");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        data_version: "published-v2",
        generated_at: "2026-09-13T00:00:00Z",
      }),
    ),
  );
  await loadDataMeta();
  expect(getDataVersionToken()).toBe("published-v2");
});
