export type FormattableNumber = number | null | undefined;

function isFiniteNumber(value: FormattableNumber): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatNumber(value: FormattableNumber) {
  if (!isFiniteNumber(value)) return "0";
  return Math.round(value).toLocaleString();
}

export function formatPercent(value: FormattableNumber) {
  if (!isFiniteNumber(value)) return "0.00%";
  return `${(value * 100).toFixed(2)}%`;
}

export function formatSignedNumber(value: FormattableNumber) {
  if (!isFiniteNumber(value) || value === 0) return "0";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()}`;
}

export function formatSignedPercent(value: FormattableNumber) {
  if (!isFiniteNumber(value) || value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function getDeltaClassName(value: FormattableNumber) {
  if (!isFiniteNumber(value) || value === 0) return "text-slate-600";
  return value > 0 ? "text-green-700" : "text-red-700";
}

export function getGrowthClassName(value: FormattableNumber) {
  if (!isFiniteNumber(value) || value === 0) return "text-slate-600";
  return value > 0 ? "text-green-700" : "text-red-700";
}
