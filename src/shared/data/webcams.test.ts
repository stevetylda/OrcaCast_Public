import { describe, expect, it, vi } from "vitest";
import webcamFixture from "../../../public/data/webcams.json";
import type { PublicPoi } from "../../features/locations/poiData";
import {
  loadWebcamSites,
  mergePoiCamerasIntoWebcamSites,
  normalizeWebcamPayload,
  resetWebcamCacheForTests,
} from "./webcams";

function readWebcamFixture() {
  return JSON.parse(JSON.stringify(webcamFixture)) as unknown;
}

describe("webcam data", () => {
  it("normalizes the Tier 1 and Tier 2 inventory into grouped sites", async () => {
    const payload = normalizeWebcamPayload(readWebcamFixture());
    const feeds = payload.items.flatMap((site) => site.feeds);
    expect(payload.items).toHaveLength(48);
    expect(feeds).toHaveLength(58);
    expect(payload.items.filter((site) => site.feeds.length > 1)).toHaveLength(
      9,
    );
    expect(new Set(feeds.map((feed) => feed.id)).size).toBe(58);
    expect(feeds.every((feed) => feed.tier === 1 || feed.tier === 2)).toBe(
      true,
    );
    expect(payload.items[0]?.priorityScore).toBeGreaterThanOrEqual(
      payload.items.at(-1)?.priorityScore ?? 0,
    );
  });

  it("rejects duplicate feed ids and unsafe URLs", async () => {
    const payload = readWebcamFixture() as {
      items: Array<{ feeds: Array<Record<string, unknown>> }>;
    };
    payload.items[1]!.feeds[0]!.id = payload.items[0]!.feeds[0]!.id;
    expect(() => normalizeWebcamPayload(payload)).toThrow(
      /Duplicate webcam feed id/,
    );

    const unsafe = readWebcamFixture() as {
      items: Array<{ feeds: Array<Record<string, unknown>> }>;
    };
    unsafe.items[0]!.feeds[0]!.accessUrl = "javascript:alert(1)";
    expect(() => normalizeWebcamPayload(unsafe)).toThrow(
      /Invalid webcam access URL/,
    );
  });

  it("deduplicates POI cameras and preserves new POI-attached cameras", async () => {
    const sites = normalizeWebcamPayload(readWebcamFixture()).items;
    const duplicate: PublicPoi = {
      type: "Park",
      name: "Duplicate",
      latitude: sites[0]!.latitude,
      longitude: sites[0]!.longitude,
      hasLiveFeed: true,
      liveCameraUrl: "https://example.com/different-camera",
    };
    const addition: PublicPoi = {
      type: "Marina",
      name: "Added camera",
      latitude: 48.5,
      longitude: -122.5,
      region: "Test region",
      hasLiveFeed: true,
      liveCameraUrl: "https://example.com/camera",
    };
    const merged = mergePoiCamerasIntoWebcamSites(sites, [duplicate, addition]);
    expect(merged).toHaveLength(49);
    expect(merged.some((site) => site.name === "Duplicate")).toBe(false);
    expect(
      merged.find((site) => site.name === "Added camera")?.feeds[0],
    ).toMatchObject({ status: "listed", accessUrl: addition.liveCameraUrl });
  });

  it("fails cleanly when every static webcam path is unavailable", async () => {
    resetWebcamCacheForTests();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 404 }));
    await expect(loadWebcamSites()).rejects.toThrow(
      "Failed to load webcam data",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
    resetWebcamCacheForTests();
  });
});
