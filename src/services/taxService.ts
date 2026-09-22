import { TaxProfile, validateTaxProfile } from "../domain/tax.js";

export function prepareTaxProfile(input: TaxProfile): TaxProfile {
  validateTaxProfile(input);
  return input;
}

export type MeiLoadInput = {
  revenueYearToDate: number;
  month: number;
  activity: "services" | "commerce" | "commerce_services";
  startMonth?: number;
};

export function calculateMeiLoad(input: MeiLoadInput) {
  const revenue = Number(input.revenueYearToDate);
  const month = Number(input.month);
  if (!Number.isFinite(revenue) || revenue < 0) throw new Error("revenueYearToDate must be non-negative");
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("month must be between 1 and 12");

  const annualLimit = 81000;
  const startMonth = input.startMonth ? Math.max(1, Math.min(12, Math.floor(input.startMonth))) : 1;
  const monthsAvailable = 13 - startMonth;
  const proportionalLimit = annualLimit * (monthsAvailable / 12);
  const referenceLimit = startMonth > 1 ? proportionalLimit : annualLimit;
  const monthlyAverage = revenue / Math.max(1, month - startMonth + 1);
  const projectedAnnual = monthlyAverage * Math.max(12 - startMonth + 1, 1);

  const das = input.activity === "services" ? 86.05 : input.activity === "commerce_services" ? 87.05 : 82.05;
  const remaining = Math.max(0, referenceLimit - revenue);
  const monthlySafeRevenue = Math.max(0, remaining / Math.max(1, 12 - month));

  return {
    referenceYear: 2026,
    annualLimit: referenceLimit,
    revenueYearToDate: revenue,
    remainingLimit: remaining,
    percentageUsed: Math.round((revenue / referenceLimit) * 10000) / 100,
    projectedAnnualRevenue: Math.round(projectedAnnual * 100) / 100,
    monthlySafeRevenueToLimit: Math.round(monthlySafeRevenue * 100) / 100,
    estimatedDasMonthly: das,
    alerts: [
      ...(revenue / referenceLimit >= 0.8 ? ["revenue_above_80_percent_of_limit"] : []),
      ...(revenue / referenceLimit >= 0.95 ? ["revenue_near_mei_limit"] : []),
      ...(projectedAnnual > referenceLimit ? ["projection_above_mei_limit"] : [])
    ],
    disclaimer: "Indicador de acompanhamento, não substitui contador nem enquadramento oficial. O limite e os valores devem ser atualizados quando a legislação mudar."
  };
}

export type TaxSimulationInput = { base: number; year: number };
export function simulateConsumptionTransition(input: TaxSimulationInput) {
  if (!Number.isFinite(input.base) || input.base < 0) throw new Error("base must be a non-negative number");
  if (input.year !== 2026) throw new Error("only the 2026 transition simulation is enabled");
  return {
    year: 2026, informational: true, base: input.base,
    cbs: Math.round(input.base * 0.009 * 100) / 100,
    ibs: Math.round(input.base * 0.001 * 100) / 100,
    total: Math.round(input.base * 0.01 * 100) / 100,
    note: "Simulation only; actual treatment depends on the applicable regime, operation, base and accessory obligations."
  };
}