export function meiRuleCode(year: number, explicit?: unknown): string {
  return typeof explicit === "string" && explicit.trim() ? explicit.trim() : `MEI_${year}`;
}

export function consumptionTransitionRuleCode(year: number, explicit?: unknown): string {
  return typeof explicit === "string" && explicit.trim() ? explicit.trim() : `RTC_CONSUMPTION_${year}`;
}
