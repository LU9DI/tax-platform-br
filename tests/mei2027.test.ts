import test from "node:test";
import assert from "node:assert/strict";
import { calculateMeiLoad } from "../src/services/taxService.js";

const MEI_2027_RULE = {
  annual_limit: 81000,
  monthly_das: { services: 86.05, commerce: 82.05, commerce_services: 87.05 },
};

test("MEI 2027 services load uses versioned DAS and limit", () => {
  const r = calculateMeiLoad({
    revenueYearToDate: 60000,
    month: 9,
    activity: "services",
    year: 2027,
  }, MEI_2027_RULE);
  assert.equal(r.annualLimit, 81000);
  assert.equal(r.estimatedDasMonthly, 86.05);
  assert.equal(r.percentageUsed, 74.07);
  assert.equal(r.alerts.length, 0);
});

test("MEI 2027 commerce load uses versioned DAS and limit", () => {
  const r = calculateMeiLoad({
    revenueYearToDate: 50000,
    month: 6,
    activity: "commerce",
    year: 2027,
  }, MEI_2027_RULE);
  assert.equal(r.annualLimit, 81000);
  assert.equal(r.estimatedDasMonthly, 82.05);
  assert.equal(r.percentageUsed, 61.73);
});

test("MEI 2027 commerce_services load uses versioned DAS and limit", () => {
  const r = calculateMeiLoad({
    revenueYearToDate: 70000,
    month: 10,
    activity: "commerce_services",
    year: 2027,
  }, MEI_2027_RULE);
  assert.equal(r.annualLimit, 81000);
  assert.equal(r.estimatedDasMonthly, 87.05);
});

test("MEI 2027 warns near limit and above 80 percent", () => {
  const r = calculateMeiLoad({
    revenueYearToDate: 77000,
    month: 11,
    activity: "commerce",
    year: 2027,
  }, MEI_2027_RULE);
  assert.ok(r.alerts.includes("revenue_above_80_percent_of_limit"));
  assert.ok(r.alerts.includes("revenue_near_mei_limit"));
});

test("MEI 2027 rejects negative revenue", () => {
  assert.throws(
    () => calculateMeiLoad({ revenueYearToDate: -1, month: 1, activity: "services", year: 2027 }, MEI_2027_RULE),
    /revenueYearToDate must be a non-negative number/,
  );
});

test("MEI 2027 rejects invalid month", () => {
  assert.throws(
    () => calculateMeiLoad({ revenueYearToDate: 1000, month: 13, activity: "services", year: 2027 }, MEI_2027_RULE),
    /month must be between 1 and 12/,
  );
});

test("MEI 2027 proportional limit for mid-year opening", () => {
  const r = calculateMeiLoad({
    revenueYearToDate: 30000,
    month: 6,
    activity: "services",
    startMonth: 4,
    year: 2027,
  }, MEI_2027_RULE);
  // Months available = 13 - 4 = 9; proportional limit = 81000 * 9/12 = 60750
  assert.equal(r.annualLimit, 60750);
  assert.equal(r.percentageUsed, Math.round((30000 / 60750) * 10000) / 100);
});