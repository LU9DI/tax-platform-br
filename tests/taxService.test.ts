import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMeiLoad,
  simulateConsumptionTransition,
  resolveSimplesNationalRevenueComposition,
  resolveSimplesNationalStartupRbt12,
  calculateSimplesNationalBracketed2027,
  calculateFatorR,
  FatorRRuleParameters
} from "../src/services/taxService.js";

const RTC_RULE={cbs_rate:0.009,ibs_rate:0.001};

test("2026 transition simulation uses versioned rule parameters",()=>{
  const r=simulateConsumptionTransition({base:1000,year:2026},RTC_RULE);
  assert.equal(r.cbs,9);
  assert.equal(r.ibs,1);
  assert.equal(r.total,10);
});

import { ruleEvidenceMatches } from "../src/services/taxAuditService.js";

test("rule evidence stays bound to the resolved version when validity dates change", () => {
  const ruleX = {
    id: "rule-x",
    rule_code: "MEI_2026",
    version: "1",
    parameters: { annual_limit: 81000, das: { commerce: 76.9 } },
  };

  const evidenceFromX = {
    total: 76.9,
    ruleVersion: {
      id: "rule-x",
      code: "MEI_2026",
      version: "1",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      parameters: { annual_limit: 81000, das: { commerce: 76.9 } },
    },
  };

  const evidenceFromY = {
    ...evidenceFromX,
    ruleVersion: {
      ...evidenceFromX.ruleVersion,
      id: "rule-y",
      version: "2",
      parameters: { annual_limit: 90000, das: { commerce: 80 } },
    },
  };

  assert.equal(ruleEvidenceMatches(evidenceFromX, ruleX), true);
  assert.equal(ruleEvidenceMatches({
    ...evidenceFromX,
    ruleVersion: { ...evidenceFromX.ruleVersion, effectiveTo: "2026-06-30" },
  }, ruleX), true);
  assert.equal(ruleEvidenceMatches(evidenceFromY, ruleX), false);
});

const FATOR_R_RULE: FatorRRuleParameters = {
  threshold: 0.28,
  period_months: 12,
  ratio: "FS12/RBT12",
  fs12: { includes: [], excludes_examples: [] },
  rbt12: { basis: "versioned" },
  selection: { greater_or_equal_threshold: "III", below_threshold: "V" },
  zero_both_factor: 0.01,
  zero_revenue_factor: 0.28,
  zero_fs_factor: 0.01,
};

const FACTOR_INPUT = {
  revenue12m: 0,
  employeeAndAvulsoRemuneration12m: 0,
  individualContributorRemuneration12m: 0,
  thirteenthSalary12m: 0,
  employerSocialSecurityContribution12m: 0,
  fgts12m: 0,
};

const ESTABLISHED_HISTORY = Array.from({length:12},(_,i)=>{ const key=(2026*12+9)-12+i; const year=Math.floor(key/12); const month=(key%12)+1; const regime=(i<6?"mei":"simples_nacional") as "mei"|"simples_nacional"; return {year,month,fs:28000,revenue:100000,regime,origin:`test:${year}-${String(month).padStart(2,"0")}`,evidence:{regime,sourceReference:`test:${year}-${String(month).padStart(2,"0")}`,ruleVersionId:`rule:${year}-${String(month).padStart(2,"0")}`}}; });

test("Fator R uses the explicit FS12/RBT12 ratio", () => {
  const r = calculateFatorR({
    ...FACTOR_INPUT,
    revenue12m: 100000,
    employeeAndAvulsoRemuneration12m: 10000,
    individualContributorRemuneration12m: 10000,
  }, FATOR_R_RULE, { mode: "established", periodYear: 2026, periodMonth: 10, history: ESTABLISHED_HISTORY });
  assert.equal(r.factorR, 0.2);
  assert.equal(r.effectiveAnnex, "V");
});

test("2027 first two startup months use the versioned fixed factor", () => {
  const rule = { ...FATOR_R_RULE, startup_fixed_months: 2, startup_fixed_factor: 0.28 };
  const r = calculateFatorR(FACTOR_INPUT, rule, {
    mode: "startup", periodYear: 2027, periodMonth: 2,
    openingYear: 2027, openingMonth: 1, priorMonths: []
  });
  assert.equal(r.factorR, 0.28);
  assert.equal(r.effectiveAnnex, "III");
});

test("startup third month requires a complete contiguous history from opening through prior month", () => {
  const rule = { ...FATOR_R_RULE, startup_fixed_months: 2, startup_fixed_factor: 0.28 };
  const r = calculateFatorR(FACTOR_INPUT, rule, {
    mode: "startup", periodYear: 2027, periodMonth: 3,
    openingYear: 2027, openingMonth: 1,
    priorMonths: [
      { year: 2027, month: 1, fs: 100, revenue: 1000, regime: "mei", origin: "historical", evidence: { regime: "mei", sourceReference: "historical:2027-01", ruleVersionId: "rule:2027-01" } },
      { year: 2027, month: 2, fs: 100, revenue: 1000, regime: "simples_nacional", origin: "historical", evidence: { regime: "simples_nacional", sourceReference: "historical:2027-02", ruleVersionId: "rule:2027-02" } },
    ]
  });
  assert.equal(r.factorNumerator, 200);
  assert.equal(r.factorDenominator, 2000);
  assert.equal(r.factorR, 0.1);
  assert.equal(r.windowStart, "2027-01");
  assert.equal(r.windowEnd, "2027-02");
  assert.equal(r.monthsUsed.length, 2);
});

test("startup history rejects duplicate and missing months", () => {
  const rule = { ...FATOR_R_RULE, startup_fixed_months: 2, startup_fixed_factor: 0.28 };
  const base = { mode: "startup" as const, periodYear: 2027, periodMonth: 4, openingYear: 2027, openingMonth: 1 };
  assert.throws(() => calculateFatorR(FACTOR_INPUT, rule, { ...base, priorMonths: [
    { year: 2027, month: 1, fs: 0, revenue: 1 },
    { year: 2027, month: 2, fs: 0, revenue: 1 },
    { year: 2027, month: 2, fs: 0, revenue: 1 },
  ] }), /duplicate/);
  assert.throws(() => calculateFatorR(FACTOR_INPUT, rule, { ...base, priorMonths: [
    { year: 2027, month: 1, fs: 0, revenue: 1 },
    { year: 2027, month: 3, fs: 0, revenue: 1 },
  ] }), /every month/);
});

test("zero payroll with positive revenue resolves to 0.01", () => {
  const r = calculateFatorR({ ...FACTOR_INPUT, revenue12m: 1000 }, FATOR_R_RULE, {
    mode: "established", periodYear: 2026, periodMonth: 10, history: ESTABLISHED_HISTORY
  });
  assert.equal(r.factorR, 0.01);
  assert.equal(r.effectiveAnnex, "V");
});

test("threshold exactly 0.28 selects Annex III", () => {
  const r = calculateFatorR({
    ...FACTOR_INPUT, revenue12m: 1000, employeeAndAvulsoRemuneration12m: 280
  }, FATOR_R_RULE, { mode: "established", periodYear: 2026, periodMonth: 10, history: ESTABLISHED_HISTORY });
  assert.equal(r.factorR, 0.28);
  assert.equal(r.effectiveAnnex, "III");
});

const REVENUE_RULE = {
  year: 2027 as const,
  monthly_basis: "gross_revenue_accrued" as const,
  regular_ibs_cbs_excluded_from_simples_gross_revenue: true as const,
  exclusion_basis: "regular_ibs_cbs_amount" as const
};

test("2027 fiscal revenue segregation excludes regular IBS/CBS from hybrid Simples revenue", () => {
  const r = resolveSimplesNationalRevenueComposition({
    year: 2027,
    grossRevenueAccrued: 12500,
    regularIbsCbsAmount: 1500,
    optionModel: "simples_hibrido"
  }, REVENUE_RULE);

  assert.equal(r.grossRevenueAccrued, 12500);
  assert.equal(r.regularIbsCbsAmountExcluded, 1500);
  assert.equal(r.simplesGrossRevenue, 11000);
  assert.equal(r.revenueBasis, "gross_revenue_accrued_less_regular_ibs_cbs");
});

test("2027 pure Simples rejects regular IBS/CBS segregation", () => {
  assert.throws(() => resolveSimplesNationalRevenueComposition({
    year: 2027,
    grossRevenueAccrued: 12500,
    regularIbsCbsAmount: 1500,
    optionModel: "simples_puro"
  }, REVENUE_RULE), /cannot be excluded/);
});

test("2027 bracket calculation preserves fiscal gross, excluded IBS/CBS and net RBT12", () => {
  const annexRule = {
    annex: "I" as const,
    activity: "commerce" as const,
    brackets: [
      { max_revenue_12m: 180000, nominal_rate: 0.04, deduction: 0 },
      { max_revenue_12m: 360000, nominal_rate: 0.073, deduction: 5940 }
    ]
  };

  const r = calculateSimplesNationalBracketed2027({
    revenue12m: 120000,
    monthlyRevenue: 12000,
    regularIbsCbsRevenue12m: 12000,
    regularIbsCbsMonthlyRevenue: 1200,
    optionModel: "simples_hibrido"
  }, annexRule, REVENUE_RULE);

  assert.equal(r.grossRevenue12m, 120000);
  assert.equal(r.regularIbsCbsRevenue12mExcluded, 12000);
  assert.equal(r.revenue12m, 108000);
  assert.equal(r.grossMonthlyRevenue, 12000);
  assert.equal(r.regularIbsCbsMonthlyRevenueExcluded, 1200);
  assert.equal(r.monthlyRevenue, 10800);
  assert.equal(r.revenueBasis, "gross_revenue_accrued_less_regular_ibs_cbs");
});

test("2027 fiscal RBT12 and Fator R can consume the same net revenue basis", () => {
  const fiscalGrossByMonth = Array.from({length:12}, () => 10000);
  const regularIbsCbsByMonth = Array.from({length:12}, () => 1000);
  const rbt12 = fiscalGrossByMonth.reduce((sum, value, index) => sum + value - regularIbsCbsByMonth[index], 0);
  const establishedHistory2027 = Array.from({ length: 12 }, (_, i) => ({
    year: 2026,
    month: i + 1,
    fs: 2340,
    revenue: 9000,
    regime: (i < 6 ? "mei" : "simples_nacional") as "mei" | "simples_nacional",
    origin: `test:2027-${String(i + 1).padStart(2, "0")}`,
    evidence: {
      regime: (i < 6 ? "mei" : "simples_nacional") as "mei" | "simples_nacional",
      sourceReference: `test:2027-${String(i + 1).padStart(2, "0")}`,
      ruleVersionId: `rule:2027-${String(i + 1).padStart(2, "0")}`
    }
  }));
  const fator = calculateFatorR({
    ...FACTOR_INPUT,
    revenue12m: rbt12,
    employeeAndAvulsoRemuneration12m: 28080
  }, FATOR_R_RULE, {
    mode: "established",
    periodYear: 2027,
    periodMonth: 1,
    history: establishedHistory2027
  });

  assert.equal(rbt12, 108000);
  assert.equal(fator.factorR, 0.26);
  assert.equal(fator.effectiveAnnex, "V");
});


test("2027 startup RBT12 annualizes the first month from fiscal net revenue", () => {
  const r = resolveSimplesNationalStartupRbt12({
    period: "2027-01",
    openedAt: "2027-01-10",
    historicalNetRevenue: 0,
    currentNetRevenue: 10000
  }, { applicable_first_months: 12, first_month_multiplier: 12, subsequent_months_average_multiplier: 12 });
  assert.equal(r.applicable, true);
  assert.equal(r.monthsSinceOpening, 1);
  assert.equal(r.revenue12m, 120000);
  assert.equal(r.basis, "startup_first_month_annualized");
});

test("2027 startup RBT12 uses accumulated average after the first month", () => {
  const r = resolveSimplesNationalStartupRbt12({
    period: "2027-02",
    openedAt: "2027-01-10",
    historicalNetRevenue: 10000,
    currentNetRevenue: 14000
  }, { applicable_first_months: 12, first_month_multiplier: 12, subsequent_months_average_multiplier: 12 });
  assert.equal(r.applicable, true);
  assert.equal(r.monthsSinceOpening, 2);
  assert.equal(r.revenue12m, 144000);
  assert.equal(r.basis, "startup_average_annualized");
});

test("2027 startup RBT12 stops proportionalization after the first 12 months", () => {
  const r = resolveSimplesNationalStartupRbt12({
    period: "2028-01",
    openedAt: "2027-01-10",
    historicalNetRevenue: 132000,
    currentNetRevenue: 14000
  }, { applicable_first_months: 12, first_month_multiplier: 12, subsequent_months_average_multiplier: 12 });
  assert.equal(r.applicable, false);
  assert.equal(r.monthsSinceOpening, 13);
  assert.equal(r.revenue12m, 132000);
  assert.equal(r.basis, "normal_12_month_window");
});

test("MEI validates start month and avoids invalid annual-limit arithmetic", () => {
  const rule = { annual_limit: 81000, monthly_das: { services: 86.05, commerce: 82.05, commerce_services: 87.05 } };
  assert.throws(() => calculateMeiLoad({ revenueYearToDate: 1000, month: 3, activity: "services", startMonth: 0 }, rule), /startMonth must be an integer/);
  assert.throws(() => calculateMeiLoad({ revenueYearToDate: 1000, month: 3, activity: "services", startMonth: 13 }, rule), /startMonth must be an integer/);
  assert.throws(() => calculateMeiLoad({ revenueYearToDate: 1000, month: 2, activity: "services", startMonth: 3 }, rule), /month cannot be earlier/);
  assert.throws(() => calculateMeiLoad({ revenueYearToDate: 1000, month: 1, activity: "services" }, { ...rule, annual_limit: 0 }), /annual limit must be greater than zero/);
});

test("MEI projection uses elapsed months and remaining months from the activity start", () => {
  const rule = { annual_limit: 81000, monthly_das: { services: 86.05, commerce: 82.05, commerce_services: 87.05 } };
  const r = calculateMeiLoad({ revenueYearToDate: 10000, month: 4, activity: "services", startMonth: 3, year: 2026 }, rule);
  assert.equal(r.annualLimit, 67500);
  assert.equal(r.projectedAnnualRevenue, 50000); // 10.000 em 2 meses = 5.000/mês x 10 meses de atividade (mar-dez), comparável ao limite proporcional de 67.500
  assert.equal(r.remainingLimit, 57500);
  assert.equal(r.referenceYear, 2026);
});
