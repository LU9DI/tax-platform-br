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
  },RULE,{mode:"established",periodYear:2026,periodMonth:10});
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
  },RULE,{mode:"established",periodYear:2026,periodMonth:10});
  assert.equal(r.fs12,22500);
  assert.equal(r.factorR,0.225);
  assert.equal(r.effectiveAnnex,"V");
});

test("Fator R with zero FS12 and zero RBT12 uses 0.01",()=>{
  const r=calculateFatorR({revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0},RULE,{mode:"established",periodYear:2026,periodMonth:10});
  assert.equal(r.factorR,0.01);
  assert.equal(r.effectiveAnnex,"V");
});

test("Fator R with FS12 positive and RBT12 zero uses 0.28",()=>{
  const r=calculateFatorR({revenue12m:0,employeeAndAvulsoRemuneration12m:1000,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0},RULE,{mode:"established",periodYear:2026,periodMonth:10});
  assert.equal(r.factorR,0.28);
  assert.equal(r.effectiveAnnex,"III");
});

test("Fator R keeps the 12-month input components explicit",()=>{
  const r=calculateFatorR({
    revenue12m:200000,
    employeeAndAvulsoRemuneration12m:30000,
    individualContributorRemuneration12m:10000,
    thirteenthSalary12m:2000,
    employerSocialSecurityContribution12m:10000,
    fgts12m:4000
  },RULE,{mode:"established",periodYear:2026,periodMonth:10});
  assert.equal(r.periodMonths,12);
  assert.deepEqual(r.inputs,{
    employeeAndAvulsoRemuneration12m:30000,
    individualContributorRemuneration12m:10000,
    thirteenthSalary12m:2000,
    employerSocialSecurityContribution12m:10000,
    fgts12m:4000
  });
});

test("Fator R opening month uses FSPA/RPA",()=>{
  const r=calculateFatorR({
    revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,
    thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0
  },RULE,{mode:"opening_month",periodYear:2026,periodMonth:1,openingYear:2026,openingMonth:1,fspa:2800,rpa:10000});
  assert.equal(r.factorBasis,"FSPA_RPA");
  assert.equal(r.factorNumerator,2800);
  assert.equal(r.factorDenominator,10000);
  assert.equal(r.factorR,0.28);
  assert.equal(r.effectiveAnnex,"III");
});

test("Fator R startup period uses completed months before PA",()=>{
  const r=calculateFatorR({
    revenue12m:999999,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,
    thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0
  },RULE,{mode:"startup",periodYear:2026,periodMonth:3,openingYear:2026,openingMonth:1,priorMonths:[
    {year:2026,month:1,fs:2000,revenue:10000},{year:2026,month:2,fs:2500,revenue:10000}
  ]});
  assert.equal(r.factorBasis,"startup_prior_months");
  assert.equal(r.factorNumerator,4500);
  assert.equal(r.factorDenominator,20000);
  assert.equal(r.factorR,0.225);
  assert.equal(r.effectiveAnnex,"V");
});
