import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateMeiLoad, parseMeiRule } from "../src/services/taxService.js";

const INPUT = { revenueYearToDate: 60000, month: 9, activity: "services" as const, year: 2026 };
const BASE = { annual_limit: 81000, monthly_das: { services: 86.05, commerce: 82.05, commerce_services: 87.05 } };

// Normative data: the rule exactly as stored by the migration, not a hand-copied fixture.
function storedMigrationRule(): Record<string, unknown> {
  const sql = readFileSync(new URL("../migrations/20261004_105_mei_2026_rule.sql", import.meta.url), "utf8");
  const match = sql.match(/'(\{"annual_limit".*?\})',\s*'2026-01-01'/s);
  assert.ok(match, "rule JSON not found in migration");
  return JSON.parse(match[1]);
}

test("the rule stored by the migration passes validation and drives the calculation", () => {
  const rule = parseMeiRule(storedMigrationRule());
  const r = calculateMeiLoad(INPUT, rule);
  assert.equal(r.annualLimit, 81000);
  assert.equal(r.estimatedDasMonthly, 86.05);
});

test("changing a normative parameter changes the matching result without touching the algorithm", () => {
  const base = calculateMeiLoad(INPUT, parseMeiRule(BASE));
  const higherLimit = calculateMeiLoad(INPUT, parseMeiRule({ ...BASE, annual_limit: 90000 }));
  assert.equal(higherLimit.annualLimit, 90000);
  assert.ok(higherLimit.remainingLimit > base.remainingLimit);
  assert.ok(higherLimit.percentageUsed < base.percentageUsed);

  const newDas = calculateMeiLoad(
    INPUT,
    parseMeiRule({ ...BASE, monthly_das: { ...BASE.monthly_das, services: 100 } })
  );
  assert.equal(newDas.estimatedDasMonthly, 100);
  assert.equal(newDas.annualLimit, base.annualLimit);
});

test("informational stored fields do not affect the result (documents current behavior)", () => {
  const informational = {
    ...BASE,
    inss: { amount: 999, rate: 0.5, rate_basis: "minimum_wage", minimum_wage: 1 },
    tax_components: { iss: 99, icms: 99 },
    proportional_limit_basis: "other",
    transport_cargas_supported: true
  };
  assert.deepEqual(calculateMeiLoad(INPUT, parseMeiRule(informational)), calculateMeiLoad(INPUT, parseMeiRule(BASE)));
});

test("the calculation is a pure function of the rule version it receives", () => {
  const v1 = parseMeiRule(BASE);
  const v2 = parseMeiRule({ ...BASE, annual_limit: 90000 });
  const before = calculateMeiLoad(INPUT, v1);
  calculateMeiLoad(INPUT, v2);
  assert.deepEqual(calculateMeiLoad(INPUT, v1), before);
});

test("parseMeiRule rejects missing, invalid or incompatible parameters", () => {
  const bad: [string, unknown][] = [
    ["null", null],
    ["array", []],
    ["empty object", {}],
    ["missing monthly_das", { annual_limit: 81000 }],
    ["monthly_das not an object", { annual_limit: 81000, monthly_das: 86 }],
    ["missing annual_limit", { monthly_das: BASE.monthly_das }],
    ["zero annual_limit", { ...BASE, annual_limit: 0 }],
    ["negative annual_limit", { ...BASE, annual_limit: -1 }],
    ["string annual_limit", { ...BASE, annual_limit: "81000" }],
    ["NaN annual_limit", { ...BASE, annual_limit: Number.NaN }],
    ["missing activity", { ...BASE, monthly_das: { services: 86.05, commerce: 82.05 } }],
    ["negative DAS", { ...BASE, monthly_das: { ...BASE.monthly_das, commerce: -1 } }]
  ];
  for (const [name, value] of bad) {
    assert.throws(() => parseMeiRule(value), /invalid MEI rule/, name);
  }
});

test("engine formulas are tested apart from data: same rule, different revenue, different alerts", () => {
  const rule = parseMeiRule(BASE);
  const low = calculateMeiLoad({ ...INPUT, revenueYearToDate: 10000 }, rule);
  const high = calculateMeiLoad({ ...INPUT, revenueYearToDate: 80000 }, rule);
  assert.equal(low.alerts.length, 0);
  assert.ok(high.alerts.includes("revenue_near_mei_limit"));
});
