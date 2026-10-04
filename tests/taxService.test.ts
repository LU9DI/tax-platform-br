import test from "node:test";
import assert from "node:assert/strict";
import { simulateConsumptionTransition } from "../src/services/taxService.js";

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


import { calculateFatorR, FatorRRuleParameters } from "../src/services/taxService.js";

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

test("Fator R uses the explicit FS12/RBT12 ratio", () => {
  const r = calculateFatorR({
    ...FACTOR_INPUT,
    revenue12m: 100000,
    employeeAndAvulsoRemuneration12m: 10000,
    individualContributorRemuneration12m: 10000,
  }, FATOR_R_RULE, { mode: "established", periodYear: 2026, periodMonth: 10 });
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
      { year: 2027, month: 1, fs: 100, revenue: 1000, regime: "mei", origin: "historical" },
      { year: 2027, month: 2, fs: 100, revenue: 1000, regime: "simples_nacional", origin: "historical" },
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
    mode: "established", periodYear: 2026, periodMonth: 10
  });
  assert.equal(r.factorR, 0.01);
  assert.equal(r.effectiveAnnex, "V");
});

test("threshold exactly 0.28 selects Annex III", () => {
  const r = calculateFatorR({
    ...FACTOR_INPUT, revenue12m: 1000, employeeAndAvulsoRemuneration12m: 280
  }, FATOR_R_RULE, { mode: "established", periodYear: 2026, periodMonth: 10 });
  assert.equal(r.factorR, 0.28);
  assert.equal(r.effectiveAnnex, "III");
});
