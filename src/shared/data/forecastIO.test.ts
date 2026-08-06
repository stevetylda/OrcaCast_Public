import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import { forecastPayloadSchema } from "./validation";
import { attachProbabilities, buildConsensusMean } from "./forecastIO";

const coverage = {
  grid_cell_count: 3,
  modeled_cell_count: 2,
  unknown_cell_count: 1,
  missing_cell_policy: "omitted_as_unknown" as const,
  unknown_reason: "outside_model_support" as const,
};

describe("forecast schema v2", () => {
  it("accepts sparse values, including a genuine modeled zero", () => {
    const result = forecastPayloadSchema.safeParse({
      schema_version: 2,
      resolution: "H6",
      target_start: "2026-07-13",
      target_end: "2026-07-19",
      models: [{ id: "model-a", values: { a: 0, b: 0.5 }, coverage }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid probability and coverage counts", () => {
    const result = forecastPayloadSchema.safeParse({
      schema_version: 2,
      resolution: "H6",
      models: [
        {
          id: "model-a",
          values: { a: 1.1 },
          coverage: { ...coverage, modeled_cell_count: 2 },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("forecast missingness", () => {
  it("builds consensus only on the strict model intersection", () => {
    expect(
      buildConsensusMean([
        { id: "a", values: { shared: 0, onlyA: 0.8 } },
        { id: "b", values: { shared: 0.4, onlyB: 0.7 } },
      ]),
    ).toEqual({ shared: 0.2 });
  });

  it("attaches modeled zero separately from unknown cells", () => {
    const grid: FeatureCollection = {
      type: "FeatureCollection",
      features: ["modeled-zero", "unknown"].map((h3) => ({
        type: "Feature" as const,
        properties: { h3 },
        geometry: { type: "Point" as const, coordinates: [-123, 48] },
      })),
    };

    const attached = attachProbabilities(grid, { "modeled-zero": 0 });
    expect(attached.features[0].properties).toMatchObject({
      prob: 0,
      prob_status: "modeled",
    });
    expect(attached.features[1].properties).toMatchObject({
      prob: null,
      prob_status: "unknown",
    });
  });
});
