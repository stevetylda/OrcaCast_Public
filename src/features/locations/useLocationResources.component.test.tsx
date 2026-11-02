import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { loadPoiData } from "./poiData";
import { loadWebcamSites } from "../../shared/data/webcams";
import { loadOrcasoundHydrophonePayload } from "../../shared/data/orcasoundHydrophones";
import { useLocationResources } from "./useLocationResources";
vi.mock("./poiData", () => ({ loadPoiData: vi.fn() }));
vi.mock("../../shared/data/webcams", () => ({
  loadWebcamSites: vi.fn(),
  mergePoiCamerasIntoWebcamSites: (sites: unknown[]) => sites,
}));
vi.mock("../../shared/data/orcasoundHydrophones", () => ({
  loadOrcasoundHydrophonePayload: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
});
it("keeps cameras usable while POIs fail and retries only failed resources", async () => {
  vi.mocked(loadPoiData)
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce([]);
  vi.mocked(loadWebcamSites).mockResolvedValue([]);
  vi.mocked(loadOrcasoundHydrophonePayload).mockResolvedValue({
    items: [],
    listenUrl: "https://live.orcasound.net/",
  } as Awaited<ReturnType<typeof loadOrcasoundHydrophonePayload>>);
  const { result } = renderHook(useLocationResources);
  await waitFor(() =>
    expect(result.current.unavailable).toEqual(["viewing places"]),
  );
  expect(loadWebcamSites).toHaveBeenCalledTimes(1);
  act(() => result.current.retry());
  await waitFor(() => expect(loadPoiData).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.unavailable).toEqual([]));
  expect(loadWebcamSites).toHaveBeenCalledTimes(1);
  expect(loadOrcasoundHydrophonePayload).toHaveBeenCalledTimes(1);
});
it("does not wait for POIs before exposing cameras", async () => {
  vi.mocked(loadPoiData).mockReturnValue(new Promise(() => {}));
  const cameras = [{ id: "working-camera" }] as Awaited<
    ReturnType<typeof loadWebcamSites>
  >;
  vi.mocked(loadWebcamSites).mockResolvedValue(cameras);
  vi.mocked(loadOrcasoundHydrophonePayload).mockResolvedValue({
    items: [],
  } as unknown as Awaited<ReturnType<typeof loadOrcasoundHydrophonePayload>>);
  const { result } = renderHook(useLocationResources);
  await waitFor(() => expect(result.current.cameraLocations).toBe(cameras));
});
