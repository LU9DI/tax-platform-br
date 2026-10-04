import test from "node:test";
import assert from "node:assert/strict";
import { resolveSimplesNationalIbsCbsOption } from "../src/services/taxService.js";

const RULE = {
  models: ["simples_puro","simples_hibrido"] as ["simples_puro","simples_hibrido"],
  first_semester:{start:"2027-01-01",end:"2027-06-30",option_window:{start:"2026-09-01",end:"2026-10-30"},cancellation_window:{start:"2026-11-03",end:"2026-12-20"},cancellation_deadline:"2026-12-20"},
    second_semester:{start:"2027-07-01",end:"2027-12-31",option_window:{start:"2027-03-01",end:"2027-03-31"},renunciation_window:{start:"2027-03-01",end:"2027-03-31"},cancellation_deadline:null},
  regular_ibs_cbs_rates:null
};

test("2027 IBS/CBS option resolves first semester without inventing rates",()=>{
  const r=resolveSimplesNationalIbsCbsOption({period:"2027-02-01",optionModel:"simples_hibrido",rule: RULE});
  assert.equal(r.semester,"first");
  assert.equal(r.optionModel,"simples_hibrido");
  assert.equal(r.regularIbsCbsRatesAvailable,false);
  assert.deepEqual(r.optionWindow,{start:"2026-09-01",end:"2026-10-30"});
  assert.equal(r.cancellationDeadline,"2026-12-20");
});

test("2027 IBS/CBS option preserves second-semester framework from prior rules",()=>{
  const r=resolveSimplesNationalIbsCbsOption({period:"2027-08-01",rule:RULE});
  assert.equal(r.semester,"second");
  assert.equal(r.optionWindow.start,"2027-03-01");
  assert.equal(r.optionWindow.end,"2027-03-31");
});

test("2027 IBS/CBS option rejects unsupported period",()=>{
  assert.throws(()=>resolveSimplesNationalIbsCbsOption({period:"2026-12-01",rule: RULE}),/invalid period|outside the 2027 IBS\/CBS option framework/);
});


test("2027 IBS/CBS option rejects impossible calendar dates",()=>{
  assert.throws(()=>resolveSimplesNationalIbsCbsOption({period:"2027-02-30",rule:RULE}),/invalid period/);
});


test("2027 IBS/CBS framework accepts first-semester boundary dates",()=>{
  assert.equal(resolveSimplesNationalIbsCbsOption({period:"2027-01-01",rule:RULE}).semester,"first");
  assert.equal(resolveSimplesNationalIbsCbsOption({period:"2027-06-30",rule:RULE}).semester,"first");
});
