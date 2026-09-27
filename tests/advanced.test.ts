import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateMeiLoad } from "../src/services/taxService.js";
const MEI_RULE={annual_limit:81000,monthly_das:{services:86.05,commerce:82.05,commerce_services:87.05}};
test("calculates MEI load indicators",()=>{
  const x=calculateMeiLoad({revenueYearToDate:65000,month:9,activity:"services",year:2026},MEI_RULE);
  assert.equal(x.annualLimit,81000);
  assert.ok(x.percentageUsed>80);
  assert.ok(x.alerts.includes("revenue_above_80_percent_of_limit"));
});