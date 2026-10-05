import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveSimplesNationalRevenueComposition,
  calculateSimplesNationalBracketed2027,
  type SimplesNationalRevenueCompositionRule,
  type SimplesNationalRuleParameters,
} from "../src/services/taxService.js";

const rule: SimplesNationalRevenueCompositionRule = {
  year: 2027,
  monthly_basis: "gross_revenue_accrued",
  regular_ibs_cbs_excluded_from_simples_gross_revenue: true,
  exclusion_basis: "regular_ibs_cbs_amount",
};

const brackets: SimplesNationalRuleParameters = {
  annex: "I",
  activity: "commerce",
  brackets: [
    { max_revenue_12m: 180000, nominal_rate: 0.04, deduction: 0 },
    { max_revenue_12m: 360000, nominal_rate: 0.073, deduction: 5940 },
  ],
};

test("2027 pure Simples keeps the full accrued gross revenue", () => {
  const result = resolveSimplesNationalRevenueComposition({
    year: 2027,
    grossRevenueAccrued: 10000,
    optionModel: "simples_puro",
  }, rule);

  assert.equal(result.simplesGrossRevenue, 10000);
  assert.equal(result.regularIbsCbsAmountExcluded, 0);
  assert.equal(result.revenueBasis, "gross_revenue_accrued_less_regular_ibs_cbs");
});

test("2027 hybrid Simples excludes regular IBS/CBS from Simples revenue", () => {
  const result = resolveSimplesNationalRevenueComposition({
    year: 2027,
    grossRevenueAccrued: 10000,
    regularIbsCbsAmount: 900,
    optionModel: "simples_hibrido",
  }, rule);

  assert.equal(result.grossRevenueAccrued, 10000);
  assert.equal(result.regularIbsCbsAmountExcluded, 900);
  assert.equal(result.simplesGrossRevenue, 9100);
});

test("pure Simples rejects a non-zero regular IBS/CBS exclusion", () => {
  assert.throws(
    () => resolveSimplesNationalRevenueComposition({
      year: 2027,
      grossRevenueAccrued: 10000,
      regularIbsCbsAmount: 1,
      optionModel: "simples_puro",
    }, rule),
    /regular IBS\/CBS amount cannot be excluded/,
  );
});

test("regular IBS/CBS exclusion cannot exceed gross revenue", () => {
  assert.throws(
    () => resolveSimplesNationalRevenueComposition({
      year: 2027,
      grossRevenueAccrued: 10000,
      regularIbsCbsAmount: 10001,
      optionModel: "simples_hibrido",
    }, rule),
    /cannot exceed/,
  );
});

test("2027 bracket calculation uses the post-exclusion RBT12 and monthly base", () => {
  const result = calculateSimplesNationalBracketed2027({
    revenue12m: 200000,
    monthlyRevenue: 20000,
    regularIbsCbsRevenue12m: 20000,
    regularIbsCbsMonthlyRevenue: 2000,
    optionModel: "simples_hibrido",
  }, brackets, rule);

  assert.equal(result.grossRevenue12m, 200000);
  assert.equal(result.revenue12m, 180000);
  assert.equal(result.grossMonthlyRevenue, 20000);
  assert.equal(result.monthlyRevenue, 18000);
  assert.equal(result.regularIbsCbsRevenue12mExcluded, 20000);
  assert.equal(result.regularIbsCbsMonthlyRevenueExcluded, 2000);
  assert.equal(result.estimatedMonthlyTax, 720);
});

test("2027 revenue composition cannot be used for a pre-2027 calculation", () => {
  assert.throws(
    () => resolveSimplesNationalRevenueComposition({
      year: 2026,
      grossRevenueAccrued: 10000,
      optionModel: "simples_puro",
    }, rule),
    /cannot be applied before 2027/,
  );
});
