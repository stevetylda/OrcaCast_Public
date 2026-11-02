import { expect, it } from "vitest";
import {
  getFeatureProbability,
  mercatorY,
  inverseMercatorY,
  buildBucketIndex,
  interpolateSurfaceValue,
  surfaceAlphaForValue,
} from "./surfaceRasterMath";
it("preserves modeled zero and excludes unavailable values", () => {
  expect(getFeatureProbability({ prob: 0, prob_status: "modeled" })).toBe(0);
  expect(
    getFeatureProbability({ prob: 0, prob_status: "unavailable" }),
  ).toBeNaN();
  expect(
    getFeatureProbability({ prob: null, prob_status: "modeled" }),
  ).toBeNaN();
  expect(surfaceAlphaForValue(Number.NaN, [], 1)).toBe(0);
});
it("round-trips supported latitudes", () => {
  for (const lat of [-80, 0, 48.5, 80])
    expect(inverseMercatorY(mercatorY(lat))).toBeCloseTo(lat, 8);
});
it("preserves a constant surface and leaves unsupported areas missing", () => {
  const buckets = buildBucketIndex(
    [
      { lng: 0, lat: 0, projX: 0, projY: 0, prob: 0.4 },
      { lng: 1, lat: 0, projX: 1, projY: 0, prob: 0.4 },
    ],
    2,
  );
  expect(interpolateSurfaceValue(buckets, 0.5, 0, 2, 2)).toBeCloseTo(0.4);
  expect(interpolateSurfaceValue(buckets, 100, 100, 2, 2)).toBeNull();
});
