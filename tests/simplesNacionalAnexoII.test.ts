import test from "node:test";
import assert from "node:assert/strict";
import { calculateSimplesNationalAnexoII } from "../src/services/taxService.js";

const RULE={
  annex:"II" as const,
  activity:"industry" as const,
  brackets:[
    {max_revenue_12m:180000,nominal_rate:0.045,deduction:0},
    {max_revenue_12m:360000,nominal_rate:0.078,deduction:5940},
    {max_revenue_12m:720000,nominal_rate:0.10,deduction:13860},
    {max_revenue_12m:1800000,nominal_rate:0.112,deduction:22500},
    {max_revenue_12m:3600000,nominal_rate:0.147,deduction:85500},
    {max_revenue_12m:4800000,nominal_rate:0.30,deduction:720000},
  ],
};

test("Simples Nacional Anexo II calculates effective rate",()=>{
  const r=calculateSimplesNationalAnexoII({revenue12m:360000,monthlyRevenue:30000},RULE);
  assert.equal(r.bracketMaxRevenue12m,360000);
  assert.equal(r.nominalRate,0.078);
  assert.equal(r.effectiveRate,0.0615);
  assert.equal(r.estimatedMonthlyTax,1845);
});

test("Simples Nacional Anexo II rejects revenue above limit",()=>{
  assert.throws(()=>calculateSimplesNationalAnexoII({revenue12m:4800000.01,monthlyRevenue:1000},RULE),/exceeds Simples Nacional (?:Anexo I )?limit/);
});
