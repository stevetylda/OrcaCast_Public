import { fridayHarborWeekKeys, summarizeFridayHarborWeather } from "./weather";

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  },
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Values are not deeply equal");
  },
};

export function runHomeWeatherUnitTests() {
  const instant = new Date("2026-07-12T04:00:00Z");
  assert.deepEqual(fridayHarborWeekKeys(instant), [
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
    instant
  );
  assert.equal(week[6]?.key, "2026-07-11");
  assert.equal(week[6]?.temperatureF, 68);
  assert.equal(week[6]?.summary, "Clear");
}
