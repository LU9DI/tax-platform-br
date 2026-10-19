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
