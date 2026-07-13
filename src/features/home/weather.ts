export type MetNoTimeseriesEntry = {
  time: string;
  data?: {
    instant?: { details?: { air_temperature?: number } };
    next_1_hours?: { summary?: { symbol_code?: string } };
    next_6_hours?: { summary?: { symbol_code?: string } };
    next_12_hours?: { summary?: { symbol_code?: string } };
  };
};

export type WeatherDaySummary = {
  key: string;
  label: string;
  temperatureF: number | null;
  icon: string;
  summary: string;
};

export const FRIDAY_HARBOR_TIME_ZONE = "America/Los_Angeles";

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
  };
}

function isoDateFromUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateKeyInZone(date: Date, timeZone: string) {
  const parts = dateParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function fridayHarborWeekKeys(now: Date) {
  const current = dateParts(now, FRIDAY_HARBOR_TIME_ZONE);
  const weekdayIndex = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ].indexOf(current.weekday);
  const currentDate = new Date(
    Date.UTC(current.year, current.month - 1, current.day),
  );
  currentDate.setUTCDate(currentDate.getUTCDate() - Math.max(0, weekdayIndex));
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(currentDate);
    date.setUTCDate(currentDate.getUTCDate() + offset);
    return isoDateFromUtc(date);
  });
}

function summarizeSymbol(symbolCode: string | undefined) {
  const normalized = (symbolCode ?? "").split("_")[0];
  if (normalized === "clearsky") return "Clear";
  if (normalized === "fair") return "Fair";
  if (normalized === "partlycloudy") return "Partly cloudy";
  if (normalized === "cloudy") return "Cloudy";
  if (normalized === "fog") return "Fog";
  if (/rain|rainshowers/.test(normalized)) return "Rain";
  if (/sleet|sleetshowers/.test(normalized)) return "Sleet";
  if (/snow|snowshowers/.test(normalized)) return "Snow";
  if (normalized === "thunderstorm") return "Storms";
  return "Mixed";
}

function weatherIconName(summary: string) {
  if (summary === "Clear" || summary === "Fair") return "sunny";
  if (summary === "Partly cloudy" || summary === "Cloudy" || summary === "Fog")
    return "cloud";
  if (summary === "Rain" || summary === "Storms" || summary === "Sleet")
    return "rainy";
  if (summary === "Snow") return "ac_unit";
  return "partly_cloudy_day";
}

export function summarizeFridayHarborWeather(
  timeseries: MetNoTimeseriesEntry[],
  now: Date,
): WeatherDaySummary[] {
  const targetKeys = fridayHarborWeekKeys(now);
  const buckets = new Map(
    targetKeys.map((key) => [
      key,
      { temps: [] as number[], symbols: new Map<string, number>() },
    ]),
  );
  timeseries.forEach((entry) => {
    const bucket = buckets.get(
      dateKeyInZone(new Date(entry.time), FRIDAY_HARBOR_TIME_ZONE),
    );
    if (!bucket) return;
    const temperature = entry.data?.instant?.details?.air_temperature;
    if (typeof temperature === "number" && Number.isFinite(temperature))
      bucket.temps.push(temperature);
    const symbol =
      entry.data?.next_1_hours?.summary?.symbol_code ??
      entry.data?.next_6_hours?.summary?.symbol_code ??
      entry.data?.next_12_hours?.summary?.symbol_code;
    if (symbol)
      bucket.symbols.set(symbol, (bucket.symbols.get(symbol) ?? 0) + 1);
  });
  const labels = ["S", "M", "T", "W", "Th", "F", "S"];
  return targetKeys.map((key, index) => {
    const bucket = buckets.get(key);
    const temps = bucket?.temps ?? [];
    const topSymbol = [...(bucket?.symbols.entries() ?? [])].sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    const summary = summarizeSymbol(topSymbol);
    return {
      key,
      label: labels[index] ?? "S",
      temperatureF:
        temps.length > 0 ? Math.round((Math.max(...temps) * 9) / 5 + 32) : null,
      icon: weatherIconName(summary),
      summary,
    };
  });
}
