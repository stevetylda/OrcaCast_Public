import { describe, expect, it } from "vitest";
import {
  accumulateWeightedRaster,
  fitRasterDimensionsToBudget,
  isRasterNoData,
} from "./weightedRaster";

describe("weighted raster aggregation", () => {
  it("preserves aspect ratio within the increased smooth pixel budget", () => {
    const sourceWidth = 2027;
    const sourceHeight = 2473;
    const dimensions = fitRasterDimensionsToBudget(
      sourceWidth,
      sourceHeight,
      1800,
      3_200_000,
    );

    expect(dimensions).toEqual({ width: 1475, height: 1800 });
    expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(3_200_000);
    expect(dimensions.width / dimensions.height).toBeCloseTo(
      sourceWidth / sourceHeight,
      3,
    );
  });

  it("caps square rasters by total pixels as well as side length", () => {
    const dimensions = fitRasterDimensionsToBudget(2400, 2400, 1800, 3_200_000);

    expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(3_200_000);
  });

  it("combines aligned weekly rasters using normalized date-share weights", () => {
    const combined = new Float32Array(3);
    accumulateWeightedRaster(combined, [1, 0.5, 0], 0.7);
    accumulateWeightedRaster(combined, [0, 1, 0.25], 0.3);
    expect([...combined]).toEqual([
      expect.closeTo(0.7, 6),
      expect.closeTo(0.65, 6),
      expect.closeTo(0.075, 6),
    ]);
  });

  it("rejects misaligned raster lengths", () => {
    expect(() => accumulateWeightedRaster(new Float32Array(2), [1], 1)).toThrow(
      /dimensions do not match/,
    );
  });

  it("distinguishes valid zero from nodata", () => {
    const combined = new Float32Array(4);
    const validMask = new Uint8Array(4);
    accumulateWeightedRaster(
      combined,
      [0, -9999, -0.25, 0.5],
      1,
      -9999,
      validMask,
    );

    expect([...combined]).toEqual([0, 0, -0.25, 0.5]);
    expect([...validMask]).toEqual([1, 0, 1, 1]);
    expect(isRasterNoData(0, -9999)).toBe(false);
    expect(isRasterNoData(-9999, -9999)).toBe(true);
  });
});
