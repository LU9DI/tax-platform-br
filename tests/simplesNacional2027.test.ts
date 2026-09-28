import test from "node:test";
import assert from "node:assert/strict";
import { calculateSimplesNationalByAnnex } from "../src/services/taxService.js";

const anexoIII={annex:"III" as const,activity:"services_factor_r",brackets:[
{max_revenue_12m:180000,nominal_rate:0.06,deduction:0},
{max_revenue_12m:360000,nominal_rate:0.112,deduction:9360},
{max_revenue_12m:720000,nominal_rate:0.135,deduction:17640},
{max_revenue_12m:1800000,nominal_rate:0.16,deduction:35640},
{max_revenue_12m:3600000,nominal_rate:0.21,deduction:125640},
{max_revenue_12m:4800000,nominal_rate:0.329,deduction:648000}]};

const anexoV={...anexoIII,annex:"V" as const,brackets:[
{max_revenue_12m:180000,nominal_rate:0.155,deduction:0},
{max_revenue_12m:360000,nominal_rate:0.18,deduction:4500},
{max_revenue_12m:720000,nominal_rate:0.195,deduction:9900},
{max_revenue_12m:1800000,nominal_rate:0.205,deduction:17100},
{max_revenue_12m:3600000,nominal_rate:0.23,deduction:62100},
{max_revenue_12m:4800000,nominal_rate:0.304,deduction:540000}]};

test("2027 Anexo III uses 32.9% top nominal rate",()=>{
  const r=calculateSimplesNationalByAnnex({revenue12m:4800000,monthlyRevenue:400000},anexoIII);
  assert.equal(r.nominalRate,0.329);
  assert.equal(r.deduction,648000);
});

test("2027 Anexo V uses 30.4% top nominal rate",()=>{
  const r=calculateSimplesNationalByAnnex({revenue12m:4800000,monthlyRevenue:400000},anexoV);
  assert.equal(r.nominalRate,0.304);
  assert.equal(r.deduction,540000);
});
