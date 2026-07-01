export function formatForecastValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (value >= 0.1) return value.toFixed(3);
  if (value >= 0.01) return value.toFixed(4);
  return value.toFixed(5);
}

export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 10) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(1);
  return value.toFixed(0);
}

export function isObservedActual(value: number): boolean {
  return Number.isFinite(value) && value >= 0.999;
}

export function formatObservedFlag(value: number): string {
  return isObservedActual(value) ? "present" : "not observed";
}

export function formatScaledValue(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}
