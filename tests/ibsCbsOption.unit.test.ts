import test from "node:test";
import assert from "node:assert/strict";
import { resolveSimplesNationalIbsCbsOption } from "../src/services/taxService.js";

const rule = {
  models: ["simples_puro", "simples_hibrido"] as const,
  first_semester: {
    start: "2027-01-01",
    end: "2027-06-30",
    option_window: { start: "2026-09-01", end: "2026-09-30" },
    cancellation_deadline: "2026-11-30",
  },
  second_semester: {
    start: "2027-07-01",
    end: "2027-12-31",
    option_window: { start: "2027-03-01", end: "2027-03-31" },
    cancellation_deadline: "2027-05-31",
  },
  regular_ibs_cbs_rates: null,
};

test("IBS/CBS option resolver defaults to pure and preserves prior hybrid continuity", () => {
  const first = resolveSimplesNationalIbsCbsOption({ period: "2027-01-15", rule });
  assert.equal(first.optionModel, "simples_puro");
  assert.equal(first.decisionSource, "default_no_regular_option");

  const second = resolveSimplesNationalIbsCbsOption({
    period: "2027-07-15",
    previousSemesterModel: "simples_hibrido",
    rule,
  });
  assert.equal(second.optionModel, "simples_hibrido");
  assert.equal(second.decisionSource, "continued_previous_option");
});

test("IBS/CBS option resolver rejects malformed calendar dates", () => {
  assert.throws(
    () => resolveSimplesNationalIbsCbsOption({ period: "2027-02-30", rule }),
    /invalid period/,
  );
  assert.throws(
    () => resolveSimplesNationalIbsCbsOption({ period: "2027-1-15", rule }),
    /invalid period/,
  );
  assert.throws(
    () => resolveSimplesNationalIbsCbsOption({ period: "not-a-date", rule }),
    /invalid period/,
  );
});
