import test from "node:test";
import assert from "node:assert/strict";
import { meiRuleCode, consumptionTransitionRuleCode } from "../src/domain/taxRuleDefaults.js";

test("MEI default rule follows the requested fiscal year", () => {
  assert.equal(meiRuleCode(2026), "MEI_2026");
  assert.equal(meiRuleCode(2027), "MEI_2027");
});

test("consumption transition default rule follows the requested fiscal year", () => {
  assert.equal(consumptionTransitionRuleCode(2026), "RTC_CONSUMPTION_2026");
  assert.equal(consumptionTransitionRuleCode(2027), "RTC_CONSUMPTION_2027");
});

test("explicit tax rule code is preserved after trimming", () => {
  assert.equal(meiRuleCode(2027, " CUSTOM_MEI "), "CUSTOM_MEI");
  assert.equal(consumptionTransitionRuleCode(2027, " CUSTOM_RTC "), "CUSTOM_RTC");
});

test("blank explicit rule code uses the requested year", () => {
  assert.equal(meiRuleCode(2027, "  "), "MEI_2027");
  assert.equal(consumptionTransitionRuleCode(2027, ""), "RTC_CONSUMPTION_2027");
});

test("validates supported fiscal years and months", async () => {
  const { isValidTaxYear, isValidTaxMonth } = await import("../src/domain/taxRuleDefaults.js");
  assert.equal(isValidTaxYear(2026), true);
  assert.equal(isValidTaxYear(2019), false);
  assert.equal(isValidTaxYear(2101), false);
  assert.equal(isValidTaxYear(2026.5), false);
  assert.equal(isValidTaxMonth(1), true);
  assert.equal(isValidTaxMonth(12), true);
  assert.equal(isValidTaxMonth(0), false);
  assert.equal(isValidTaxMonth(13), false);
  assert.equal(isValidTaxMonth(1.5), false);
});
