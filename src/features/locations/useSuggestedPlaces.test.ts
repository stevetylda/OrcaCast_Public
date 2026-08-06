import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import type { PublicPoi } from "./poiData";
import {
  buildForecastCellScores,
  rankPoiAgainstForecast,
  type ForecastCellScore,
} from "./useSuggestedPlaces";

const poi: PublicPoi = {
  type: "Park",
  name: "Test shore",
  latitude: 48,
  longitude: -123,
};

describe("suggested-place distance contracts", () => {
  it("omits forecast cells whose probability is unknown", () => {
    const grid: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { h3: "modeled" },
          geometry: { type: "Point", coordinates: [-123, 48] },
        },
        {
          type: "Feature",
          properties: { h3: "unknown" },
          geometry: { type: "Point", coordinates: [-123.1, 48.1] },
        },
      ],
    };

    expect(buildForecastCellScores(grid, { modeled: 0 })).toEqual([
      { value: 0, center: [-123, 48] },
    ]);
  });

  it("keeps base mileage separate from forecast-support proximity", () => {
    const cells: ForecastCellScore[] = [{ value: 0.8, center: [-123, 48.01] }];
    const [place] = rankPoiAgainstForecast(
      [poi],
      cells,
      cells,
      { latitude: 47, longitude: -122 },
      200,
      25,
    );

    expect(place.distanceFromBaseKm).toBeGreaterThan(130);
    expect(place.distanceToForecastSupportKm).toBeLessThan(2);
    expect(place.distanceFromBaseKm).not.toBeCloseTo(
      place.distanceToForecastSupportKm ?? 0,
    );
  });

  it("does not make a base-distance claim when no base is selected", () => {
    const cells: ForecastCellScore[] = [{ value: 0.8, center: [-123, 48.01] }];
    const [place] = rankPoiAgainstForecast([poi], cells, cells, null, null, 25);

    expect(place.distanceFromBaseKm).toBeUndefined();
    expect(place.distanceToForecastSupportKm).toBeLessThan(2);
  });
});
