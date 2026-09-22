import test from "node:test";
import assert from "node:assert/strict";
import { calculateMeiLoad } from "../src/services/taxService.js";
test("MEI services load uses 2026 DAS and limit",()=>{const r=calculateMeiLoad({revenueYearToDate:60000,month:9,activity:"services"});assert.equal(r.annualLimit,81000);assert.equal(r.estimatedDasMonthly,86.05);assert.equal(r.percentageUsed,74.07);assert.equal(r.alerts.length,0);});
test("MEI monitor warns near limit",()=>{const r=calculateMeiLoad({revenueYearToDate:77000,month:11,activity:"commerce"});assert.ok(r.alerts.includes("revenue_above_80_percent_of_limit"));assert.ok(r.alerts.includes("revenue_near_mei_limit"));});
