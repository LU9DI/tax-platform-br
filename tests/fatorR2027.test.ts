import test from "node:test";
import assert from "node:assert/strict";
import { calculateFatorR } from "../src/services/taxService.js";

const RULE={
  threshold:0.28,
  period_months:12,
  ratio:"FS12/RBT12",
  fs12:{includes:[] as string[],excludes_examples:[] as string[]},
  rbt12:{basis:"12_months_antecedent_to_month_before_PA"},
  selection:{greater_or_equal_threshold:"III",below_threshold:"V"},
  startup_fixed_months:2,
  startup_fixed_factor:0.28
} as const;

test("2027 Fator R fixes the first two startup months at 0.28",()=>{
  const input={revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0};
  const opening=calculateFatorR(input,RULE,{mode:"opening_month",periodYear:2027,periodMonth:1,openingYear:2027,openingMonth:1,fspa:0,rpa:0});
  assert.equal(opening.factorR,0.01);
  assert.equal(opening.factorBasis,"FSPA_RPA");
  const second=calculateFatorR(input,RULE,{mode:"startup",periodYear:2027,periodMonth:2,openingYear:2027,openingMonth:1,priorMonths:[]});
  assert.equal(second.factorR,0.28);
  assert.equal(second.factorBasis,"startup_fixed_rule");
});

test("2027 Fator R keeps normal FS12/RBT12 after startup",()=>{
  const r=calculateFatorR({
    revenue12m:100000,
    employeeAndAvulsoRemuneration12m:20000,
    individualContributorRemuneration12m:5000,
    thirteenthSalary12m:1000,
    employerSocialSecurityContribution12m:1500,
    fgts12m:500
  },RULE,{mode:"established",periodYear:2027,periodMonth:3});
  assert.equal(r.factorR,0.28);
  assert.equal(r.effectiveAnnex,"III");
});


test("2027 Fator R third month uses months antecedent to the month before PA",()=>{
  const input={revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0};
  const third=calculateFatorR(input,RULE,{mode:"startup",periodYear:2027,periodMonth:3,openingYear:2027,openingMonth:1,priorMonths:[{year:2027,month:1,fs:28000,revenue:100000,regime:"mei",origin:"mei-payroll:2027-01",evidence:{regime:"mei",sourceReference:"mei-payroll:2027-01",ruleVersionId:"mei-rule-2027"}}]});
  assert.equal(third.factorR,0.28);
  assert.equal(third.factorBasis,"startup_prior_months");
  assert.deepEqual(third.monthsUsed.map((m)=>`${m.year}-${String(m.month).padStart(2,"0")}`),["2027-01"]);
  assert.equal(third.windowStart,"2027-01");
  assert.equal(third.windowEnd,"2027-01");
  assert.throws(()=>calculateFatorR(input,RULE,{mode:"startup",periodYear:2027,periodMonth:3,openingYear:2027,openingMonth:1,priorMonths:[{year:2027,month:1,fs:28000,revenue:100000,regime:"mei",origin:"mei-payroll:2027-01",evidence:{regime:"mei",sourceReference:"mei-payroll:2027-01",ruleVersionId:"mei-rule-2027"}},{year:2027,month:2,fs:28000,revenue:100000,regime:"simples_nacional",origin:"simples-payroll:2027-02",evidence:{regime:"simples_nacional",sourceReference:"simples-payroll:2027-02",ruleVersionId:"simples-rule-2027"}}]}));
});


test("2027 Fator R retains MEI to Simples provenance across the historical window",()=>{
  const r=calculateFatorR({
    revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,
    thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0
  },RULE,{mode:"startup",periodYear:2027,periodMonth:4,openingYear:2027,openingMonth:1,priorMonths:[
    {year:2027,month:1,fs:10000,revenue:30000,regime:"mei",origin:"mei:2027-01",evidence:{regime:"mei",sourceReference:"mei:2027-01",ruleVersionId:"mei-rule-2027"}},
    {year:2027,month:2,fs:8000,revenue:25000,regime:"simples_nacional",origin:"sn:2027-02",evidence:{regime:"simples_nacional",sourceReference:"sn:2027-02",ruleVersionId:"sn-rule-2027"}}
  ]});
  assert.deepEqual(r.monthlyEvidence.map((m)=>m.evidence.regime),["mei","simples_nacional"]);
  assert.deepEqual(r.monthlyEvidence.map((m)=>m.evidence.ruleVersionId),["mei-rule-2027","sn-rule-2027"]);
  assert.deepEqual(r.monthlyEvidence.map((m)=>m.evidence.sourceReference),["mei:2027-01","sn:2027-02"]);
});

test("2027 Fator R rejects a startup history without monthly evidence",()=>{
  const input={revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0};
  assert.throws(()=>calculateFatorR(input,RULE,{mode:"startup",periodYear:2027,periodMonth:3,openingYear:2027,openingMonth:1,priorMonths:[{year:2027,month:1,fs:28000,revenue:100000}]}),/monthly normative evidence/);
});
