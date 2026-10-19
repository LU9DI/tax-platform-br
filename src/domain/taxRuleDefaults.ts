export function meiRuleCode(year: number, explicit?: unknown): string {
  return typeof explicit === "string" && explicit.trim() ? explicit.trim() : `MEI_${year}`;
}

export function consumptionTransitionRuleCode(year: number, explicit?: unknown): string {
  return typeof explicit === "string" && explicit.trim() ? explicit.trim() : `RTC_CONSUMPTION_${year}`;
}

export function isValidTaxYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2020 && year <= 2100;
}

export function isValidTaxMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

export type NonNegativeNumberResult = { valid: true; value: number } | { valid: false };

export function parseNonNegativeFiniteNumber(value: unknown): NonNegativeNumberResult {
  if (typeof value === "boolean" || value === null || value === undefined) return { valid: false };
  if (typeof value === "string" && value.trim() === "") return { valid: false };
  if (typeof value !== "number" && typeof value !== "string") return { valid: false };
  if (typeof value === "string" && !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return { valid: false };
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return { valid: false };
  return { valid: true, value: parsed };
}
