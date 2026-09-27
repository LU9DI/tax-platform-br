import test from "node:test";
import assert from "node:assert/strict";
import { calculateSimplesNationalAnexoI } from "../src/services/taxService.js";

const RULE={
  annex:"I" as const,
  activity:"commerce" as const,
  brackets:[
    {max_revenue_12m:180000,nominal_rate:0.04,deduction:0},
    {max_revenue_12m:360000,nominal_rate:0.073,deduction:5940},
    {max_revenue_12m:720000,nominal_rate:0.095,deduction:13860},
    {max_revenue_12m:1800000,nominal_rate:0.107,deduction:22500},
    {max_revenue_12m:3600000,nominal_rate:0.143,deduction:87300},
    {max_revenue_12m:4800000,nominal_rate:0.19,deduction:378000},
  ],
};

test("Simples Nacional Anexo I selects bracket and calculates effective rate",()=>{
  const r=calculateSimplesNationalAnexoI({revenue12m:360000,monthlyRevenue:30000},RULE);
  assert.equal(r.bracketMaxRevenue12m,360000);
  assert.equal(r.nominalRate,0.073);
  assert.equal(r.deduction,5940);
  assert.equal(r.effectiveRate,0.0565);
  assert.equal(r.estimatedMonthlyTax,1695);
});

test("Simples Nacional Anexo I rejects revenue above rule limit",()=>{
  assert.throws(
    ()=>calculateSimplesNationalAnexoI({revenue12m:4800000.01,monthlyRevenue:1000},RULE),
    /exceeds Simples Nacional Anexo I limit/
  );
});

test("Simples Nacional Anexo I validates non-negative inputs",()=>{
  assert.throws(
    ()=>calculateSimplesNationalAnexoI({revenue12m:-1,monthlyRevenue:1000},RULE),
    /revenue12m must be a non-negative number/
  );
});
