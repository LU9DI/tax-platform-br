import test from "node:test";
import assert from "node:assert/strict";
import { simulateConsumptionTransition } from "../src/services/taxService.js";

const RTC_2027_RULE = { cbs_rate: 0.009, ibs_rate: 0.001 };

test("2027 consumption transition uses versioned rule parameters", () => {
  const r = simulateConsumptionTransition({ base: 1000, year: 2027 }, RTC_2027_RULE);
  assert.equal(r.cbs, 9);
  assert.equal(r.ibs, 1);
  assert.equal(r.total, 10);
});

test("2027 consumption transition calculates proportionally", () => {
  const r = simulateConsumptionTransition({ base: 50000, year: 2027 }, RTC_2027_RULE);
  assert.equal(r.cbs, 450);
  assert.equal(r.ibs, 50);
  assert.equal(r.total, 500);
});

test("2027 consumption transition rejects negative base", () => {
  assert.throws(
    () => simulateConsumptionTransition({ base: -100, year: 2027 }, RTC_2027_RULE),
    /base must be a non-negative number/,
  );
});

test("2027 consumption transition rejects invalid year", () => {
  assert.throws(
    () => simulateConsumptionTransition({ base: 1000, year: 2026.5 }, RTC_2027_RULE),
    /year must be an integer/,
  );
});

test("2027 consumption transition rejects missing rule parameters", () => {
  assert.throws(
    () => simulateConsumptionTransition({ base: 1000, year: 2027 }, { cbs_rate: -1, ibs_rate: 0.001 }),
    /invalid consumption transition rule parameters/,
  );
});