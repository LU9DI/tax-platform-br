import test from "node:test";
import assert from "node:assert/strict";
import { calculateFatorR } from "../src/services/taxService.js";

const RULE={
  threshold:0.28,
  period_months:12,
  ratio:"FS12/RBT12",
  fs12:{includes:[],excludes_examples:[]},
  rbt12:{basis:"12_months_antecedent_to_month_before_PA"},
  selection:{greater_or_equal_threshold:"III",below_threshold:"V"},
  startup_fixed_months:2,
  startup_fixed_factor:0.28
} as const;

test("2027 Fator R fixes the first two startup months at 0.28",()=>{
  const input={revenue12m:0,employeeAndAvulsoRemuneration12m:0,individualContributorRemuneration12m:0,thirteenthSalary12m:0,employerSocialSecurityContribution12m:0,fgts12m:0};
  const opening=calculateFatorR(input,RULE,{mode:"opening_month",fspa:0,rpa:0});
  assert.equal(opening.factorR,0.28);
  assert.equal(opening.factorBasis,"startup_fixed_rule");
  const second=calculateFatorR(input,RULE,{mode:"startup",priorMonths:[]});
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
  },RULE);
  assert.equal(r.factorR,0.28);
  assert.equal(r.effectiveAnnex,"III");
});
