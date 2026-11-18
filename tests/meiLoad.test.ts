import test from "node:test";
import assert from "node:assert/strict";
import { calculateMeiLoad } from "../src/services/taxService.js";

const MEI_RULE={annual_limit:81000,monthly_das:{services:86.05,commerce:82.05,commerce_services:87.05}};

test("MEI services load uses versioned 2026 DAS and limit",()=>{
  const r=calculateMeiLoad({revenueYearToDate:60000,month:9,activity:"services",year:2026},MEI_RULE);
  assert.equal(r.annualLimit,81000);
  assert.equal(r.estimatedDasMonthly,86.05);
  assert.equal(r.percentageUsed,74.07);
  assert.equal(r.alerts.length,0);
});
test("MEI monitor warns near limit",()=>{
  const r=calculateMeiLoad({revenueYearToDate:77000,month:11,activity:"commerce",year:2026},MEI_RULE);
  assert.ok(r.alerts.includes("revenue_above_80_percent_of_limit"));
  assert.ok(r.alerts.includes("revenue_near_mei_limit"));
});

test("MEI rejects a zero annual limit", () => {
  assert.throws(
    () => calculateMeiLoad(
      { revenueYearToDate: 1000, month: 3, activity: "services" },
      { ...MEI_RULE, annual_limit: 0 }
    ),
    /greater than zero/
  );
});

test("MEI rejects a fractional start month", () => {
  assert.throws(
    () => calculateMeiLoad(
      { revenueYearToDate: 1000, month: 3, activity: "services", startMonth: 2.5 },
      MEI_RULE
    ),
    /startMonth must be an integer/
  );
});

test("MEI rejects a start month outside 1 through 12", () => {
  assert.throws(
    () => calculateMeiLoad(
      { revenueYearToDate: 1000, month: 3, activity: "services", startMonth: 13 },
      MEI_RULE
    ),
    /startMonth must be an integer/
  );
});

test("MEI rejects a reference month before activity starts", () => {
  assert.throws(
    () => calculateMeiLoad(
      { revenueYearToDate: 1000, month: 2, activity: "services", startMonth: 3 },
      MEI_RULE
    ),
    /on or after startMonth/
  );
});

test("MEI preserves the proportional limit for a March start", () => {
  const result = calculateMeiLoad(
    { revenueYearToDate: 10000, month: 3, activity: "services", startMonth: 3, year: 2026 },
    MEI_RULE
  );
  assert.equal(result.annualLimit, 67500);
});

test("MEI rejects a zero reference year", () => {
  assert.throws(
    () => calculateMeiLoad(
      { revenueYearToDate: 1000, month: 3, activity: "services", year: 0 },
      MEI_RULE
    ),
    /year must be a positive integer/
  );
});

test("MEI rejects a fractional reference year", () => {
  assert.throws(
    () => calculateMeiLoad(
      { revenueYearToDate: 1000, month: 3, activity: "services", year: 2026.5 },
      MEI_RULE
    ),
    /year must be a positive integer/
  );
});