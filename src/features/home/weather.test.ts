import { fridayHarborWeekKeys, summarizeFridayHarborWeather } from "./weather";
import { describe, expect, it } from "vitest";

describe("home weather", () => {
  it("starts today in Friday Harbor, including the UTC date boundary", () => {
    expect(fridayHarborWeekKeys(new Date("2026-07-12T04:00:00Z"))).toEqual([
      "2026-07-11",
      "2026-07-12",
      "2026-07-13",
    ]);
  });
  it("shows Wednesday onward rather than elapsed days of the week", () => {
    const now = new Date("2026-09-16T19:00:00Z");
    const days = summarizeFridayHarborWeather(
      [
        {
          time: now.toISOString(),
          data: {
            instant: { details: { air_temperature: 20 } },
            next_1_hours: { summary: { symbol_code: "clearsky_day" } },
          },
        },
      ],
      now,
    );
    expect(days.map((day) => day.key)).toEqual([
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(days[0]).toMatchObject({
      label: "Today",
      temperatureF: 68,
      summary: "Clear",
    });
    expect(days[1]).toMatchObject({
      temperatureF: null,
      summary: "Unavailable",
    });
  });
  it("does not invent conditions from empty or stale observations", () => {
    const now = new Date("2026-09-16T19:00:00Z");
    const days = summarizeFridayHarborWeather(
      [
        { time: "invalid" },
        {
          time: "2026-09-16T01:00:00Z",
          data: { instant: { details: { air_temperature: 25 } } },
        },
      ],
      now,
    );
    expect(
      days.every(
        (day) => day.temperatureF === null && day.summary === "Unavailable",
      ),
    ).toBe(true);
  });
  it("handles year rollover in local dates", () => {
    expect(fridayHarborWeekKeys(new Date("2026-12-31T20:00:00Z"))).toEqual([
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });
});
