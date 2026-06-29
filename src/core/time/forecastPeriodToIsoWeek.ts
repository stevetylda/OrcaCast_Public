export function isoWeekFromDate(date: Date): number {
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}

export function isoWeekYearFromDate(date: Date): number {
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  return temp.getUTCFullYear();
}

function parseIsoDateAsUtc(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return new Date(dateStr);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

export function forecastPeriodToIsoWeek(period: {
  mode: "single" | "range";
  date?: string;
  start?: string;
  end?: string;
}): number {
  const dateStr = period.mode === "single" ? period.date : period.start;
  if (!dateStr) return isoWeekFromDate(new Date());
  return isoWeekFromDate(parseIsoDateAsUtc(dateStr));
}

export function forecastPeriodToIsoWeekYear(period: {
  mode: "single" | "range";
  date?: string;
  start?: string;
  end?: string;
}): number {
  const dateStr = period.mode === "single" ? period.date : period.start;
  if (!dateStr) return isoWeekYearFromDate(new Date());
  return isoWeekYearFromDate(parseIsoDateAsUtc(dateStr));
}

function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isoWeekToDateRange(year: number, week: number): { start: string; end: string } {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (day - 1));
  const start = new Date(mondayWeek1);
  start.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start: formatIsoDate(start), end: formatIsoDate(end) };
}
