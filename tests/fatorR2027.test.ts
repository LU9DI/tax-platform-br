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
  zero_both_factor:0.01,
  zero_revenue_factor:0.28,
  zero_fs_factor:0.01,
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

function establishedHistory(): Array<import("../src/services/taxService.js").FatorRHistoryMonth> {
  return Array.from({length:12},(_,i)=>({
    year:2026 + Math.floor((i+2)/12),
    month:((i+2)%12)+1,
    fs:28000,
    revenue:100000,
    regime:i<6?"mei":"simples_nacional",
    origin:`source:${i}`,
    evidence:{regime:i<6?"mei":"simples_nacional",sourceReference:`source:${i}`,ruleVersionId:`rule:${i}`}
  }));
}

test("2027 Fator R established uses exactly the 12 prior monthly records",()=>{
  const r=calculateFatorR({
    revenue12m:999999,
    employeeAndAvulsoRemuneration12m:1,
    individualContributorRemuneration12m:1,
    thirteenthSalary12m:1,
    employerSocialSecurityContribution12m:1,
    fgts12m:1
  },RULE,{mode:"established",periodYear:2027,periodMonth:3,history:establishedHistory()});
  assert.equal(r.factorR,0.28);
  assert.equal(r.factorBasis,"FS12_RBT12");
  assert.equal(r.windowStart,"2026-03");
  assert.equal(r.windowEnd,"2027-02");
  assert.equal(r.factorNumerator,336000);
  assert.equal(r.factorDenominator,1200000);
  assert.equal(r.effectiveAnnex,"III");
});

test("2027 Fator R established rejects incomplete, duplicate, future, or unevidenced history",()=>{
  const base=establishedHistory();
  assert.throws(()=>calculateFatorR({revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0},RULE,{mode:"established",periodYear:2027,periodMonth:3,history:base.slice(1)}),/every month/);
  assert.throws(()=>calculateFatorR({revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0},RULE,{mode:"established",periodYear:2027,periodMonth:3,history:[...base,{...base[11]}]}),/duplicate/);
  assert.throws(()=>calculateFatorR({revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0},RULE,{mode:"established",periodYear:2027,periodMonth:3,history:[...base.slice(0,11),{...base[11],year:2027,month:3}]}),/calculation period or a future/);
  const unevidenced=base.map((x,i)=>i===5?{...x,evidence:undefined}:x);
  assert.throws(()=>calculateFatorR({revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0},RULE,{mode:"established",periodYear:2027,periodMonth:3,history:unevidenced}),/monthly normative evidence/);
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
  assert.deepEqual(r.monthlyEvidence.map((m)=>m.evidence!.regime),["mei","simples_nacional"]);
  assert.deepEqual(r.monthlyEvidence.map((m)=>m.evidence!.ruleVersionId),["mei-rule-2027","sn-rule-2027"]);
  assert.deepEqual(r.monthlyEvidence.map((m)=>m.evidence!.sourceReference),["mei:2027-01","sn:2027-02"]);
});

test("2027 Fator R rejects a startup history without monthly evidence",()=>{
  const input={revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0};
  assert.throws(()=>calculateFatorR(input,RULE,{mode:"startup",periodYear:2027,periodMonth:3,openingYear:2027,openingMonth:1,priorMonths:[{year:2027,month:1,fs:28000,revenue:100000}]}),/monthly normative evidence/);
});
