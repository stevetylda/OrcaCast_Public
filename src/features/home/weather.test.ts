import { fridayHarborWeekKeys, summarizeFridayHarborWeather } from "./weather";
import { describe, expect, it } from "vitest";

describe("home weather", () => {
  it("builds Friday Harbor week keys and summarizes observations", () => {
    const instant = new Date("2026-07-12T04:00:00Z");
    expect(fridayHarborWeekKeys(instant)).toEqual([
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
    ]);
    const week = summarizeFridayHarborWeather(
      [
        {
          time: "2026-07-11T19:00:00Z",
          data: {
            instant: { details: { air_temperature: 20 } },
            next_1_hours: { summary: { symbol_code: "clearsky_day" } },
          },
        },
      ],
      instant,
    );
    expect(week[6]?.key).toBe("2026-07-11");
    expect(week[6]?.temperatureF).toBe(68);
    expect(week[6]?.summary).toBe("Clear");
  });
});
