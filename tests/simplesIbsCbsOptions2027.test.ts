import test from "node:test";
import assert from "node:assert/strict";
import { resolveSimplesNationalIbsCbsOption } from "../src/services/taxService.js";

const RULE = {
  models: ["simples_puro","simples_hibrido"],
  first_semester:{start:"2027-01-01",end:"2027-06-30",option_window:{start:"2026-09-01",end:"2026-09-30"},cancellation_deadline:"2026-11-30"},
  second_semester:{start:"2027-07-01",end:"2027-12-31",option_window:{start:"2027-03-01",end:"2027-03-31"},cancellation_deadline:"2027-05-31"},
  regular_ibs_cbs_rates:null
};

test("2027 IBS/CBS option resolves first semester without inventing rates",()=>{
  const r=resolveSimplesNationalIbsCbsOption({period:"2027-02-01",optionModel:"simples_hibrido",rule: RULE});
  assert.equal(r.semester,"first");
  assert.equal(r.optionModel,"simples_hibrido");
  assert.equal(r.regularIbsCbsRatesAvailable,false);
  assert.deepEqual(r.optionWindow,{start:"2026-09-01",end:"2026-09-30"});
});

test("2027 IBS/CBS option resolves second semester window",()=>{
  const r=resolveSimplesNationalIbsCbsOption({period:"2027-08-01",rule: RULE});
  assert.equal(r.semester,"second");
  assert.equal(r.optionModel,"simples_puro");
  assert.equal(r.cancellationDeadline,"2027-05-31");
});

test("2027 IBS/CBS option rejects unsupported period",()=>{
  assert.throws(()=>resolveSimplesNationalIbsCbsOption({period:"2026-12-01",rule: RULE}),/outside the 2027 IBS\/CBS option framework/);
});
