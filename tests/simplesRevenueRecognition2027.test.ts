import test from "node:test";
import assert from "node:assert/strict";
import { resolveSimplesNationalMonthlyRevenue } from "../src/services/taxService.js";

const RULE = {
  monthly_basis: "gross_revenue_accrued" as const,
  cash_regime_for_monthly_calculation: false as const,
  goods_services_recognition: "operation_billing" as const,
  fiscal_document_as_general_reference: true
};

test("2027 Simples uses gross accrued revenue instead of cash receipts",()=>{
  const r=resolveSimplesNationalMonthlyRevenue({year:2027,grossRevenueAccrued:30000},RULE);
  assert.equal(r.monthlyRevenue,30000);
  assert.equal(r.grossRevenueAccrued,30000);
  assert.equal(r.revenueRecognitionBasis,"gross_revenue_accrued");
});

test("2027 Simples rejects missing accrued revenue",()=>{
  assert.throws(
    ()=>resolveSimplesNationalMonthlyRevenue({year:2027},RULE),
    /grossRevenueAccrued is required/
  );
});

test("2027 Simples rejects an incompatible recognition rule",()=>{
  assert.throws(
    ()=>resolveSimplesNationalMonthlyRevenue({year:2027,grossRevenueAccrued:1000},{...RULE,cash_regime_for_monthly_calculation:true}),
    /unsupported Simples Nacional revenue recognition rule/
  );
});


test("2027 Simples rejects the rule when fiscal-document recognition metadata is missing",()=>{
  assert.throws(
    ()=>resolveSimplesNationalMonthlyRevenue(
      {year:2027,grossRevenueAccrued:1000},
      {...RULE,fiscal_document_as_general_reference:false}
    ),
    /unsupported Simples Nacional revenue recognition rule/
  );
});

test("2027 Simples rule is not applied to pre-2027 periods",()=>{
  assert.throws(
    ()=>resolveSimplesNationalMonthlyRevenue({year:2026,grossRevenueAccrued:1000},RULE),
    /cannot be applied before 2027/
  );
});
