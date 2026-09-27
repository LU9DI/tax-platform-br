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
  year?: number;
};

export type MeiRuleParameters = {
  annual_limit: number;
  monthly_das: Record<MeiLoadInput["activity"], number>;
};

function finiteNonNegative(value: unknown, name: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
  return n;
}

export function calculateMeiLoad(input: MeiLoadInput, rule: MeiRuleParameters) {
  const revenue = finiteNonNegative(input.revenueYearToDate, "revenueYearToDate");
  const month = Number(input.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error("month must be between 1 and 12");
  const annualLimit = finiteNonNegative(rule?.annual_limit, "MEI annual limit");
  const das = finiteNonNegative(rule?.monthly_das?.[input.activity], "MEI DAS");
  const startMonth = input.startMonth ? Math.max(1, Math.min(12, Math.floor(input.startMonth))) : 1;
  const monthsAvailable = 13 - startMonth;
  const proportionalLimit = annualLimit * (monthsAvailable / 12);
  const referenceLimit = startMonth > 1 ? proportionalLimit : annualLimit;
  const monthlyAverage = revenue / Math.max(1, month - startMonth + 1);
  const projectedAnnual = monthlyAverage * Math.max(12 - startMonth + 1, 1);
  const remaining = Math.max(0, referenceLimit - revenue);
  const monthlySafeRevenue = Math.max(0, remaining / Math.max(1, 12 - month));

  return {
    referenceYear: input.year ?? new Date().getUTCFullYear(),
    annualLimit: referenceLimit,
    revenueYearToDate: revenue,
    remainingLimit: remaining,
    percentageUsed: Math.round((revenue / referenceLimit) * 10000) / 100,
    projectedAnnualRevenue: Math.round(projectedAnnual * 100) / 100,
    monthlySafeRevenueToLimit: Math.round(monthlySafeRevenue * 100) / 100,
    estimatedDasMonthly: Math.round(das * 100) / 100,
    alerts: [
      ...(revenue / referenceLimit >= 0.8 ? ["revenue_above_80_percent_of_limit"] : []),
      ...(revenue / referenceLimit >= 0.95 ? ["revenue_near_mei_limit"] : []),
      ...(projectedAnnual > referenceLimit ? ["projection_above_mei_limit"] : [])
    ],
    disclaimer: "Indicador de acompanhamento, não substitui contador nem enquadramento oficial. Os parâmetros são versionados por regra tributária e devem ser atualizados quando a legislação mudar."
  };
}

export type TaxSimulationInput = { base: number; year: number };
export type ConsumptionRuleParameters = { cbs_rate: number; ibs_rate: number };

export function simulateConsumptionTransition(input: TaxSimulationInput, rule: ConsumptionRuleParameters) {
  if (!Number.isFinite(input.base) || input.base < 0) throw new Error("base must be a non-negative number");
  if (!Number.isInteger(input.year)) throw new Error("year must be an integer");
  const cbsRate = Number(rule?.cbs_rate);
  const ibsRate = Number(rule?.ibs_rate);
  if (!Number.isFinite(cbsRate) || cbsRate < 0 || !Number.isFinite(ibsRate) || ibsRate < 0) {
    throw new Error("invalid consumption transition rule parameters");
  }
  return {
    year: input.year, informational: true, base: input.base,
    cbs: Math.round(input.base * cbsRate * 100) / 100,
    ibs: Math.round(input.base * ibsRate * 100) / 100,
    total: Math.round(input.base * (cbsRate + ibsRate) * 100) / 100,
    rates: { cbs: cbsRate, ibs: ibsRate },
    note: "Simulation only; actual treatment depends on the applicable regime, operation, base and accessory obligations."
  };
}
