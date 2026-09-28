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


export type SimplesNationalBracket = {
  max_revenue_12m: number;
  nominal_rate: number;
  deduction: number;
};

export type SimplesNationalRuleParameters = {
  annex: "I" | "II" | "III" | "V";
  activity: "commerce" | "industry" | "services" | "services_factor_r";
  brackets: SimplesNationalBracket[];
};

export type RevenueRecognitionRuleParameters = { monthly_basis: "gross_revenue_accrued"; cash_regime_for_monthly_calculation: false; goods_services_recognition: "operation_billing"; fiscal_document_as_general_reference: boolean; };

export function resolveSimplesNationalMonthlyRevenue(input: { year: number; grossRevenueAccrued?: number }, rule: RevenueRecognitionRuleParameters) {
  if (!Number.isInteger(input.year)) throw new Error("year must be an integer");
  if (rule?.monthly_basis !== "gross_revenue_accrued" || rule?.cash_regime_for_monthly_calculation !== false) throw new Error("unsupported Simples Nacional revenue recognition rule");
  if (input.grossRevenueAccrued === undefined) throw new Error("grossRevenueAccrued is required for the applicable revenue recognition rule");
  const monthlyRevenue = finiteNonNegative(input.grossRevenueAccrued, "grossRevenueAccrued");
  return { monthlyRevenue, revenueRecognitionBasis: rule.monthly_basis, grossRevenueAccrued: monthlyRevenue };
}

export function calculateSimplesNationalBracketed(input: {
  revenue12m: number;
  monthlyRevenue: number;
}, rule: SimplesNationalRuleParameters) {
  const revenue12m = finiteNonNegative(input.revenue12m, "revenue12m");
  const monthlyRevenue = finiteNonNegative(input.monthlyRevenue, "monthlyRevenue");
  if (!Array.isArray(rule?.brackets) || rule.brackets.length !== 6) {
    throw new Error("invalid Simples Nacional bracket rule parameters");
  }
  const bracket = rule.brackets.find((item) =>
    Number.isFinite(item.max_revenue_12m) &&
    revenue12m <= item.max_revenue_12m
  );
  if (!bracket) throw new Error("revenue12m exceeds Simples Nacional limit");

  const nominalRate = Number(bracket.nominal_rate);
  const deduction = Number(bracket.deduction);
  if (!Number.isFinite(nominalRate) || nominalRate < 0 ||
      !Number.isFinite(deduction) || deduction < 0) {
    throw new Error("invalid Simples Nacional bracket parameters");
  }

  const effectiveRate = revenue12m === 0
    ? nominalRate
    : ((revenue12m * nominalRate) - deduction) / revenue12m;
  if (!Number.isFinite(effectiveRate) || effectiveRate < 0 || effectiveRate > nominalRate) {
    throw new Error("invalid effective Simples Nacional rate");
  }

  return {
    regime: "simples_nacional",
    annex: rule.annex,
    activity: rule.activity,
    revenue12m,
    monthlyRevenue,
    bracketMaxRevenue12m: bracket.max_revenue_12m,
    nominalRate: Math.round(nominalRate * 1000000) / 1000000,
    deduction: Math.round(deduction * 100) / 100,
    effectiveRate: Math.round(effectiveRate * 1000000) / 1000000,
    estimatedMonthlyTax: Math.round(monthlyRevenue * effectiveRate * 100) / 100,
    note: "Estimativa pelo anexo efetivo; o enquadramento e a segregação das receitas devem ser confirmados conforme a legislação e a situação do contribuinte."
  };
}

export function calculateSimplesNationalAnexoI(input: {
  revenue12m: number;
  monthlyRevenue: number;
}, rule: SimplesNationalRuleParameters) {
  return calculateSimplesNationalBracketed(input, rule);
}

export function calculateSimplesNationalByAnnex(input: {
  revenue12m: number;
  monthlyRevenue: number;
}, rule: SimplesNationalRuleParameters) {
  return calculateSimplesNationalBracketed(input, rule);
}

export const calculateSimplesNationalAnexoII = (input: {
  revenue12m: number;
  monthlyRevenue: number;
}, rule: SimplesNationalRuleParameters) =>
  calculateSimplesNationalBracketed(input, rule);


export type FatorRInput = {
  revenue12m: number;
  employeeAndAvulsoRemuneration12m: number;
  individualContributorRemuneration12m: number;
  thirteenthSalary12m: number;
  employerSocialSecurityContribution12m: number;
  fgts12m: number;
};

export type FatorRRuleParameters = {
  threshold: number;
  period_months: number;
  ratio: "FS12/RBT12";
  fs12: {
    includes: string[];
    excludes_examples: string[];
  };
  rbt12: {
    basis: string;
  };
  selection: {
    greater_or_equal_threshold: "III";
    below_threshold: "V";
  };
  startup_fixed_months?: number;
  startup_fixed_factor?: number;
  window_basis?: string;
};

export type FatorRPeriodContext =
  | { mode: "established" }
  | {
      mode: "opening_month";
      fspa: number;
      rpa: number;
    }
  | {
      mode: "startup";
      priorMonths: Array<{ year: number; month: number; fs: number; revenue: number }>;
    };

export function calculateFatorR(input: FatorRInput, rule: FatorRRuleParameters, periodContext: FatorRPeriodContext = { mode: "established" }) {
  const revenue12m = finiteNonNegative(input.revenue12m, "revenue12m");

  const employee = finiteNonNegative(input.employeeAndAvulsoRemuneration12m, "employeeAndAvulsoRemuneration12m");
  const individual = finiteNonNegative(input.individualContributorRemuneration12m, "individualContributorRemuneration12m");
  const thirteenth = finiteNonNegative(input.thirteenthSalary12m, "thirteenthSalary12m");
  const cpp = finiteNonNegative(input.employerSocialSecurityContribution12m, "employerSocialSecurityContribution12m");
  const fgts = finiteNonNegative(input.fgts12m, "fgts12m");

  const threshold = Number(rule?.threshold);
  const periodMonths = Number(rule?.period_months);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1 || periodMonths !== 12) {
    throw new Error("invalid Fator R rule parameters");
  }

  const fs12 = employee + individual + thirteenth + cpp + fgts;
  let factorNumerator = fs12;
  let factorDenominator = revenue12m;
  let factorBasis: "FS12_RBT12" | "FSPA_RPA" | "startup_prior_months" | "startup_fixed_rule" = "FS12_RBT12";

  if (periodContext.mode === "opening_month") {
    const fspa = finiteNonNegative(periodContext.fspa, "fspa");
    const rpa = finiteNonNegative(periodContext.rpa, "rpa");
    if (Number(rule.startup_fixed_months) >= 1) {
      factorNumerator = Number(rule.startup_fixed_factor ?? threshold);
      factorDenominator = 1;
      factorBasis = "startup_fixed_rule";
    } else {
      factorNumerator = fspa;
      factorDenominator = rpa;
      factorBasis = "FSPA_RPA";
    }
  } else if (periodContext.mode === "startup") {
    if (!Array.isArray(periodContext.priorMonths)) throw new Error("priorMonths must be an array");
    if (Number(rule.startup_fixed_months) >= 2) {
      factorNumerator = Number(rule.startup_fixed_factor ?? threshold);
      factorDenominator = 1;
      factorBasis = "startup_fixed_rule";
    } else {
      factorNumerator = periodContext.priorMonths.reduce((sum, item) => sum + finiteNonNegative(item.fs, "prior month fs"), 0);
      factorDenominator = periodContext.priorMonths.reduce((sum, item) => sum + finiteNonNegative(item.revenue, "prior month revenue"), 0);
      factorBasis = "startup_prior_months";
    }
  }

  let factorR: number;
  let thresholdComparison: "greater_or_equal" | "below";
  if (factorNumerator === 0 && factorDenominator === 0) {
    factorR = 0.01;
    thresholdComparison = "below";
  } else if (factorNumerator > 0 && factorDenominator === 0) {
    factorR = 0.28;
    thresholdComparison = "greater_or_equal";
  } else if (factorNumerator === 0 && factorDenominator > 0) {
    factorR = 0.01;
    thresholdComparison = "below";
  } else {
    factorR = factorNumerator / factorDenominator;
    thresholdComparison = factorR >= threshold ? "greater_or_equal" : "below";
  }
  const effectiveAnnex = thresholdComparison === "greater_or_equal"
    ? rule.selection.greater_or_equal_threshold
    : rule.selection.below_threshold;

  return {
    revenue12m,
    fs12,
    factorBasis,
    factorNumerator,
    factorDenominator,
    factorR: Math.round(factorR * 100000000) / 100000000,
    threshold,
    thresholdComparison,
    effectiveAnnex,
    inputs: {
      employeeAndAvulsoRemuneration12m: employee,
      individualContributorRemuneration12m: individual,
      thirteenthSalary12m: thirteenth,
      employerSocialSecurityContribution12m: cpp,
      fgts12m: fgts
    },
    periodMonths,
    note: "Fator R calculado pela razão FS12/RBT12 com os componentes informados. A atividade deve estar entre as hipóteses legais sujeitas ao Fator R para a resolução III/V ser aplicável."
  };
}
