import test from "node:test";
import assert from "node:assert/strict";
import { calculateFatorR } from "../src/services/taxService.js";

const RULE={
  threshold:0.28,
  period_months:12,
  ratio:"FS12/RBT12" as const,
  fs12:{includes:["employee_and_avulso_remuneration","individual_contributor_remuneration","13th_salary","employer_social_security_contribution","FGTS"],excludes_examples:["rent","profit_distribution","intern_payments","MEI_payments"]},
  rbt12:{basis:"revenue_accrued_in_the_12_months_before_calculation_period"},
  selection:{greater_or_equal_threshold:"III" as const,below_threshold:"V" as const}
};

test("Fator R at 28% resolves to Anexo III",()=>{
  const r=calculateFatorR({
    revenue12m:100000,
    employeeAndAvulsoRemuneration12m:20000,
    individualContributorRemuneration12m:5000,
    thirteenthSalary12m:1000,
    employerSocialSecurityContribution12m:1500,
    fgts12m:500
  },RULE);
  assert.equal(r.fs12,28000);
  assert.equal(r.factorR,0.28);
  assert.equal(r.effectiveAnnex,"III");
  assert.equal(r.thresholdComparison,"greater_or_equal");
});

test("Fator R below 28% resolves to Anexo V",()=>{
  const r=calculateFatorR({
    revenue12m:100000,
    employeeAndAvulsoRemuneration12m:15000,
    individualContributorRemuneration12m:5000,
    thirteenthSalary12m:1000,
    employerSocialSecurityContribution12m:1000,
    fgts12m:500
  },RULE);
  assert.equal(r.fs12,22500);
  assert.equal(r.factorR,0.225);
  assert.equal(r.effectiveAnnex,"V");
});

test("Fator R rejects zero revenue denominator",()=>{
  assert.throws(()=>calculateFatorR({
    revenue12m:0,
    employeeAndAvulsoRemuneration12m:1,
    individualContributorRemuneration12m:0,
    thirteenthSalary12m:0,
    employerSocialSecurityContribution12m:0,
    fgts12m:0
  },RULE),/revenue12m must be greater than zero/);
});

test("Fator R keeps the 12-month input components explicit",()=>{
  const r=calculateFatorR({
    revenue12m:200000,
    employeeAndAvulsoRemuneration12m:30000,
    individualContributorRemuneration12m:10000,
    thirteenthSalary12m:2000,
    employerSocialSecurityContribution12m:10000,
    fgts12m:4000
  },RULE);
  assert.equal(r.periodMonths,12);
  assert.deepEqual(r.inputs,{
    employeeAndAvulsoRemuneration12m:30000,
    individualContributorRemuneration12m:10000,
    thirteenthSalary12m:2000,
    employerSocialSecurityContribution12m:10000,
    fgts12m:4000
  });
});
