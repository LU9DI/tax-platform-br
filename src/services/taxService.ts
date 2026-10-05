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

export type RevenueRecognitionRuleParameters = { monthly_basis: "gross_revenue_accrued"; cash_regime_for_monthly_calculation: boolean; goods_services_recognition: "operation_billing"; fiscal_document_as_general_reference: boolean; };

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
  if (!Array.isArray(rule?.brackets) || rule.brackets.length === 0) {
    throw new Error("invalid Simples Nacional bracket rule parameters");
  }
  let previousMaxRevenue = -Infinity;
  for (const item of rule.brackets) {
    const maxRevenue = Number(item?.max_revenue_12m);
    const rate = Number(item?.nominal_rate);
    const deduction = Number(item?.deduction);
    if (!Number.isFinite(maxRevenue) || maxRevenue <= previousMaxRevenue ||
        !Number.isFinite(rate) || rate < 0 || rate > 1 ||
        !Number.isFinite(deduction) || deduction < 0) {
      throw new Error("invalid Simples Nacional bracket parameters");
    }
    previousMaxRevenue = maxRevenue;
  }
  const bracket = rule.brackets.find((item) =>
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


export type SimplesNationalIbsCbsOptionRule = {
  models: readonly ["simples_puro","simples_hibrido"];
  first_semester: { start: string; end: string; option_window: { start: string; end: string }; cancellation_window?: { start: string; end: string }; cancellation_deadline?: string | null; renunciation_window?: { start: string; end: string } };
  second_semester?: { start: string; end: string; option_window: { start: string; end: string }; cancellation_window?: { start: string; end: string }; cancellation_deadline?: string | null; renunciation_window?: { start: string; end: string } };
  start_of_activity?: SimplesNationalIbsCbsStartOfActivityRule;
  regular_ibs_cbs_rates: null;
};

export type SimplesNationalIbsCbsStartOfActivityRule = {
  simples_nacional_cnpj_registration_window: { start: string; end: string };
  simples_nacional_effective_window: { start: string; end: string };
  ibs_cbs_cnpj_registration_window: { start: string; end: string };
  option_at_cnpj_registration: true;
  ibs_cbs_effective_window: { start: string; end: string };
  effect_basis: "cnpj_registration_for_ibs_cbs";
};

export type SimplesNationalStartOfActivityRule = {
  simples_nacional_cnpj_registration_window: { start: string; end: string };
  simples_nacional_effective_window: { start: string; end: string };
  option_at_cnpj_registration: true;
};

function validIsoDate(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`invalid ${name}`);
  const d = new Date(value + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error(`invalid ${name}`);
  return d;
}

export function resolveSimplesNationalStartOfActivityOption(input: {
  cnpjRegistrationDate: string;
  period: string;
  rule: SimplesNationalIbsCbsOptionRule;
  startOfActivityRule?: SimplesNationalStartOfActivityRule;
}) {
  const registration = validIsoDate(input.cnpjRegistrationDate, "cnpjRegistrationDate");
  const period = validIsoDate(input.period, "period");
  const special = input.startOfActivityRule ?? input.rule.start_of_activity;
  if (!special || !special.simples_nacional_cnpj_registration_window) {
    throw new Error("Simples Nacional start-of-activity rule is unavailable");
  }
  const registrationStart = validIsoDate(
    special.simples_nacional_cnpj_registration_window.start,
    "Simples Nacional start-of-activity registration window start"
  );
  const registrationEnd = validIsoDate(
    special.simples_nacional_cnpj_registration_window.end,
    "Simples Nacional start-of-activity registration window end"
  );
  if (special.option_at_cnpj_registration !== true) {
    throw new Error("invalid Simples Nacional start-of-activity rule");
  }
  if (registration < registrationStart || registration > registrationEnd) {
    throw new Error("CNPJ registration is outside the 2027 Simples Nacional start-of-activity exception");
  }
  const effectStart = validIsoDate(
    special.simples_nacional_effective_window.start,
    "Simples Nacional start-of-activity effect window start"
  );
  const effectEnd = validIsoDate(
    special.simples_nacional_effective_window.end,
    "Simples Nacional start-of-activity effect window end"
  );
  if (period < effectStart || period > effectEnd) {
    throw new Error("period is outside the 2027 Simples Nacional start-of-activity effect window");
  }
  return {
    year: 2027,
    optionAtCnpjRegistration: true as const,
    decisionSource: "start_of_activity_cnpj_registration" as const,
    cnpjRegistrationDate: input.cnpjRegistrationDate,
    optionWindow: {
      start: input.cnpjRegistrationDate,
      end: input.cnpjRegistrationDate
    },
    effectStart: special.simples_nacional_effective_window.start,
    effectEnd: special.simples_nacional_effective_window.end,
    note: "Simples Nacional option for start-of-activity companies is resolved from the CNPJ registration exception window; the general 2027 option window is not used for covered registrations."
  };
}

export function resolveSimplesNationalIbsCbsStartOfActivityOption(input: {
  cnpjRegistrationDate: string;
  period: string;
  optionModel?: "simples_puro" | "simples_hibrido";
  rule: SimplesNationalIbsCbsOptionRule;
  startOfActivityRule?: SimplesNationalIbsCbsStartOfActivityRule;
}) {
  const registration = validIsoDate(input.cnpjRegistrationDate, "cnpjRegistrationDate");
  const period = validIsoDate(input.period, "period");
  const special = input.startOfActivityRule ?? input.rule.start_of_activity;
  if (!special) throw new Error("start-of-activity rule is unavailable");
  const registrationStart = validIsoDate(special.ibs_cbs_cnpj_registration_window.start, "IBS/CBS start-of-activity registration window start");
  const registrationEnd = validIsoDate(special.ibs_cbs_cnpj_registration_window.end, "IBS/CBS start-of-activity registration window end");
  const effectStart = validIsoDate(special.ibs_cbs_effective_window.start, "IBS/CBS effect window start");
  const effectEnd = validIsoDate(special.ibs_cbs_effective_window.end, "IBS/CBS effect window end");
  if (special.option_at_cnpj_registration !== true || special.effect_basis !== "cnpj_registration_for_ibs_cbs") {
    throw new Error("invalid start-of-activity rule");
  }
  if (registration < registrationStart || registration > registrationEnd) {
    throw new Error("CNPJ registration is outside the 2027 start-of-activity exception");
  }
  if (period < effectStart || period > effectEnd) {
    throw new Error("period is outside the start-of-activity IBS/CBS effect window");
  }
  const optionModel = input.optionModel ?? "simples_puro";
  if (!input.rule.models.includes(optionModel)) throw new Error("unsupported IBS/CBS option model");
  return {
    year: 2027,
    semester: "first" as const,
    optionModel,
    decisionSource: "start_of_activity_cnpj_registration" as const,
    cnpjRegistrationDate: input.cnpjRegistrationDate,
    effectStart: special.ibs_cbs_effective_window.start,
    effectEnd: special.ibs_cbs_effective_window.end,
    optionWindow: {
      start: input.cnpjRegistrationDate,
      end: input.cnpjRegistrationDate
    },
    cancellationDeadline: input.rule.first_semester.cancellation_deadline ?? null,
    regularIbsCbsRatesAvailable: false,
    note: "Start-of-activity option is made at CNPJ registration; the general 2026 option windows do not apply to registrations covered by the special rule."
  };
}

export function resolveSimplesNationalIbsCbsOption(input: {
  period: string;
  optionModel?: "simples_puro" | "simples_hibrido";
  previousSemesterModel?: "simples_puro" | "simples_hibrido";
  rule: SimplesNationalIbsCbsOptionRule;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.period)) throw new Error("invalid period");
  const period = new Date(input.period + "T00:00:00Z");
  if (Number.isNaN(period.getTime()) || period.toISOString().slice(0, 10) !== input.period) throw new Error("invalid period");
  const rule = input.rule;
  if (!rule || rule.regular_ibs_cbs_rates !== null) throw new Error("invalid IBS/CBS option rule");
  const first = period >= new Date(rule.first_semester.start + "T00:00:00Z") && period <= new Date(rule.first_semester.end + "T00:00:00Z");
  const second = !!rule.second_semester && period >= new Date(rule.second_semester.start + "T00:00:00Z") && period <= new Date(rule.second_semester.end + "T00:00:00Z");
  if (!first && !second) throw new Error("period is outside the 2027 IBS/CBS option framework");
  const semester = first ? "first" : "second";
  const window = first ? rule.first_semester.option_window : rule.second_semester!.option_window;

  if (input.optionModel && !rule.models.includes(input.optionModel)) {
    throw new Error("unsupported IBS/CBS option model");
  }
  if (input.previousSemesterModel && !rule.models.includes(input.previousSemesterModel)) {
    throw new Error("unsupported previous semester option model");
  }

  // For the first semester, no explicit choice means the default Simples Nacional model.
  // For the second semester, a prior hybrid election continues unless explicitly changed;
  // this preserves the normative continuity rule instead of silently resetting to pure.
  const selectedModel = input.optionModel
    ?? (second ? input.previousSemesterModel : undefined)
    ?? "simples_puro";
  const decisionSource =
    input.optionModel ? "explicit"
    : second && input.previousSemesterModel ? "continued_previous_option"
    : "default_no_regular_option";

  return {
    year: 2027,
    semester,
    optionModel: selectedModel,
    decisionSource,
    effectStart: first ? rule.first_semester.start : rule.second_semester!.start,
    effectEnd: first ? rule.first_semester.end : rule.second_semester!.end,
    optionWindow: window,
    cancellationDeadline: first ? rule.first_semester.cancellation_deadline : rule.second_semester!.cancellation_deadline,
    regularIbsCbsRatesAvailable: false,
    note: "Option framework only; regular IBS/CBS rates must be resolved from a separate applicable normative rule. A prior hybrid election continues into subsequent periods unless explicitly renounced or replaced within the applicable option window."
  };
}

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
  zero_both_factor?: number;
  zero_revenue_factor?: number;
  zero_fs_factor?: number;
  window_basis?: string;
};

export type FatorRHistoryMonth = {
  year: number;
  month: number;
  fs: number;
  revenue: number;
  regime?: "mei" | "simples_nacional" | "other";
  origin?: string;
};

export type FatorRPeriodContext =
  | {
      mode: "established";
      periodYear: number;
      periodMonth: number;
    }
  | {
      mode: "opening_month";
      periodYear: number;
      periodMonth: number;
      openingYear: number;
      openingMonth: number;
      fspa: number;
      rpa: number;
    }
  | {
      mode: "startup";
      periodYear: number;
      periodMonth: number;
      openingYear: number;
      openingMonth: number;
      priorMonths: FatorRHistoryMonth[];
    };

export function calculateFatorR(input: FatorRInput, rule: FatorRRuleParameters, periodContext: FatorRPeriodContext) {
  const revenue12m = finiteNonNegative(input.revenue12m, "revenue12m");
  const employee = finiteNonNegative(input.employeeAndAvulsoRemuneration12m, "employeeAndAvulsoRemuneration12m");
  const individual = finiteNonNegative(input.individualContributorRemuneration12m, "individualContributorRemuneration12m");
  const thirteenth = finiteNonNegative(input.thirteenthSalary12m, "thirteenthSalary12m");
  const cpp = finiteNonNegative(input.employerSocialSecurityContribution12m, "employerSocialSecurityContribution12m");
  const fgts = finiteNonNegative(input.fgts12m, "fgts12m");

  const threshold = Number(rule?.threshold);
  const periodMonths = Number(rule?.period_months);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1 ||
      !Number.isInteger(periodMonths) || periodMonths < 1) {
    throw new Error("invalid Fator R rule parameters");
  }
  if (rule.ratio !== "FS12/RBT12") throw new Error("unsupported Fator R ratio rule");
  if (!rule.selection || rule.selection.greater_or_equal_threshold !== "III" || rule.selection.below_threshold !== "V") {
    throw new Error("invalid Fator R annex selection rule");
  }

  const fs12 = employee + individual + thirteenth + cpp + fgts;
  let factorNumerator = fs12;
  let factorDenominator = revenue12m;
  let factorBasis: "FS12_RBT12" | "FSPA_RPA" | "startup_prior_months" | "startup_fixed_rule" = "FS12_RBT12";
  let monthsUsed: FatorRHistoryMonth[] = [];
  let windowStart: string | null = null;
  let windowEnd: string | null = null;

  const monthKey = (year: number, month: number) => year * 12 + (month - 1);
  const periodKey = monthKey(periodContext.periodYear, periodContext.periodMonth);
  if (!Number.isInteger(periodContext.periodYear) || periodContext.periodYear < 2000 ||
      !Number.isInteger(periodContext.periodMonth) || periodContext.periodMonth < 1 || periodContext.periodMonth > 12) {
    throw new Error("invalid Fator R period");
  }

  if (periodContext.mode === "opening_month") {
    if (!Number.isInteger(periodContext.openingYear) || periodContext.openingYear < 2000 ||
        !Number.isInteger(periodContext.openingMonth) || periodContext.openingMonth < 1 || periodContext.openingMonth > 12 ||
        periodContext.periodYear !== periodContext.openingYear || periodContext.periodMonth !== periodContext.openingMonth) {
      throw new Error("opening month context does not match the calculation period");
    }
    const fspa = finiteNonNegative(periodContext.fspa, "fspa");
    const rpa = finiteNonNegative(periodContext.rpa, "rpa");
    factorNumerator = fspa;
    factorDenominator = rpa;
    factorBasis = "FSPA_RPA";
  } else if (periodContext.mode === "startup") {
    if (!Number.isInteger(periodContext.openingYear) || periodContext.openingYear < 2000 ||
        !Number.isInteger(periodContext.openingMonth) || periodContext.openingMonth < 1 || periodContext.openingMonth > 12) {
      throw new Error("invalid Fator R opening period");
    }
    const openingKey = monthKey(periodContext.openingYear, periodContext.openingMonth);
    if (periodKey <= openingKey) throw new Error("startup period must be after the opening month");

    const startupFixedMonths = Number(rule.startup_fixed_months ?? 0);
    if (!Number.isInteger(startupFixedMonths) || startupFixedMonths < 0) {
      throw new Error("invalid Fator R startup rule parameters");
    }
    if (startupFixedMonths >= 2 && periodKey <= openingKey + startupFixedMonths - 1) {
      const startupFixedFactor = Number(rule.startup_fixed_factor);
      if (!Number.isFinite(startupFixedFactor) || startupFixedFactor < 0 || startupFixedFactor > 1) {
        throw new Error("Fator R startup_fixed_factor is unavailable or invalid");
      }
      factorNumerator = startupFixedFactor;
      factorDenominator = 1;
      factorBasis = "startup_fixed_rule";
    } else {
      if (!Array.isArray(periodContext.priorMonths)) throw new Error("priorMonths must be an array");
      const expectedStart = Math.max(openingKey, periodKey - periodMonths);
      const expectedKeys: number[] = [];
      for (let key = expectedStart; key < periodKey; key++) expectedKeys.push(key);
      const byKey = new Map<number, FatorRHistoryMonth>();

      for (const item of periodContext.priorMonths) {
        if (!Number.isInteger(item.year) || item.year < 2000 ||
            !Number.isInteger(item.month) || item.month < 1 || item.month > 12) {
          throw new Error("invalid Fator R history month");
        }
        const key = monthKey(item.year, item.month);
        if (key >= periodKey) throw new Error("Fator R history cannot contain the calculation period or a future month");
        if (key < openingKey) throw new Error("Fator R history cannot precede the opening month");
        if (byKey.has(key)) throw new Error("duplicate Fator R history month");
        byKey.set(key, {
          year: item.year,
          month: item.month,
          fs: finiteNonNegative(item.fs, "history fs"),
          revenue: finiteNonNegative(item.revenue, "history revenue"),
          regime: item.regime,
          origin: item.origin
        });
      }

      if (byKey.size !== expectedKeys.length || expectedKeys.some((key) => !byKey.has(key))) {
        throw new Error("Fator R history must contain every month in the applicable window");
      }

      monthsUsed = expectedKeys.map((key) => byKey.get(key)!);
      factorNumerator = monthsUsed.reduce((sum, item) => sum + item.fs, 0);
      factorDenominator = monthsUsed.reduce((sum, item) => sum + item.revenue, 0);
      factorBasis = "startup_prior_months";
      windowStart = `${monthsUsed[0].year}-${String(monthsUsed[0].month).padStart(2, "0")}`;
      windowEnd = `${monthsUsed[monthsUsed.length - 1].year}-${String(monthsUsed[monthsUsed.length - 1].month).padStart(2, "0")}`;
    }
  } else {
    windowStart = `${periodContext.periodYear}-${String(periodContext.periodMonth).padStart(2, "0")}`;
    windowEnd = windowStart;
  }

  const zeroBothFactor = Number(rule?.zero_both_factor);
  const zeroRevenueFactor = Number(rule?.zero_revenue_factor);
  const zeroFsFactor = Number(rule?.zero_fs_factor);
  if (![zeroBothFactor, zeroRevenueFactor, zeroFsFactor].every(Number.isFinite)) {
    throw new Error("Fator R zero-case parameters are unavailable");
  }

  let factorR: number;
  let thresholdComparison: "greater_or_equal" | "below";
  if (factorNumerator === 0 && factorDenominator === 0) {
    factorR = zeroBothFactor;
    thresholdComparison = factorR >= threshold ? "greater_or_equal" : "below";
  } else if (factorNumerator > 0 && factorDenominator === 0) {
    factorR = zeroRevenueFactor;
    thresholdComparison = factorR >= threshold ? "greater_or_equal" : "below";
  } else if (factorNumerator === 0 && factorDenominator > 0) {
    factorR = zeroFsFactor;
    thresholdComparison = factorR >= threshold ? "greater_or_equal" : "below";
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
    period: { year: periodContext.periodYear, month: periodContext.periodMonth },
    windowStart,
    windowEnd,
    monthsUsed,
    inputs: {
      employeeAndAvulsoRemuneration12m: employee,
      individualContributorRemuneration12m: individual,
      thirteenthSalary12m: thirteenth,
      employerSocialSecurityContribution12m: cpp,
      fgts12m: fgts
    },
    periodMonths,
    note: "Fator R calculado pela razão FS12/RBT12 com janela histórica explícita. Para 2027, os 2 primeiros meses de início de atividades usam o fator fixado pela regra versionada; depois, a janela deve conter todos os meses aplicáveis. A atividade deve estar entre as hipóteses legais sujeitas ao Fator R para a resolução III/V ser aplicável."
  };
}
