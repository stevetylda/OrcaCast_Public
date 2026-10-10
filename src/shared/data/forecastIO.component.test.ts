import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadForecast, resetForecastCache } from "./forecastIO";

const payload = {
  schema_version: 2,
  resolution: "H6",
  target_start: "2026-07-13",
  target_end: "2026-07-19",
  models: [
    {
      id: "model-a",
      values: { cell: 0 },
      coverage: {
        grid_cell_count: 2,
        modeled_cell_count: 1,
        unknown_cell_count: 1,
        missing_cell_policy: "omitted_as_unknown",
        unknown_reason: "outside_model_support",
      },
    },
  ],
};
const grid = {
  type: "FeatureCollection",
  features: ["cell", "unknown"].map((h3) => ({
    type: "Feature",
    properties: { h3 },
    geometry: { type: "Point", coordinates: [-123, 48] },
  })),
};

describe("forecast request caching", () => {
  beforeEach(() => {
    resetForecastCache();
    vi.restoreAllMocks();
  });

  it("shares one in-flight request between concurrent consumers", async () => {
    let release!: (response: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) =>
        String(input).includes("/data/grids/H6.geojson")
          ? Promise.resolve(new Response(JSON.stringify(grid), { status: 200 }))
          : responsePromise,
      );

    const first = loadForecast("H6", {
      kind: "explicit",
      explicitPath: "https://example.test/forecast.json",
      modelId: "model-a",
    });
    const second = loadForecast("H6", {
      kind: "explicit",
      explicitPath: "https://example.test/forecast.json",
      modelId: "model-a",
    });

    release(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes("/forecast.json"),
      ),
    ).toHaveLength(1);
    expect(firstResult).toEqual(secondResult);
    expect(firstResult.values).toEqual({ cell: 0 });
  });

  it("evicts rejected requests so Retry can load again", async () => {
    let forecastAttempts = 0;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) => {
        if (String(input).includes("/data/grids/H6.geojson")) {
          return Promise.resolve(
            new Response(JSON.stringify(grid), { status: 200 }),
          );
        }
        forecastAttempts += 1;
        return Promise.resolve(
          forecastAttempts === 1
            ? new Response("missing", { status: 404 })
            : new Response(JSON.stringify(payload), { status: 200 }),
        );
      });
    const options = {
      kind: "explicit" as const,
      explicitPath: "https://example.test/retry.json",
      modelId: "model-a",
    };

    await expect(loadForecast("H6", options)).rejects.toThrow();
    await expect(loadForecast("H6", options)).resolves.toMatchObject({
      values: { cell: 0 },
    });
    expect(forecastAttempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
