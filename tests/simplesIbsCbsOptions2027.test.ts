import test from "node:test";
import assert from "node:assert/strict";
import { resolveSimplesNationalIbsCbsOption, resolveSimplesNationalIbsCbsStartOfActivityOption, resolveSimplesNationalStartOfActivityOption } from "../src/services/taxService.js";

const RULE = {
  models: ["simples_puro","simples_hibrido"] as ["simples_puro","simples_hibrido"],
  first_semester:{start:"2027-01-01",end:"2027-06-30",option_window:{start:"2026-09-01",end:"2026-10-30"},cancellation_window:{start:"2026-11-03",end:"2026-12-20"},cancellation_deadline:"2026-12-20"},
    second_semester:{start:"2027-07-01",end:"2027-12-31",option_window:{start:"2027-03-01",end:"2027-03-31"},cancellation_window:{start:"2027-03-01",end:"2027-05-31"},renunciation_window:{start:"2027-03-01",end:"2027-03-31"},cancellation_deadline:"2027-05-31"},
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

const START_OF_ACTIVITY_RULE = {
  simples_nacional_cnpj_registration_window:{start:"2026-10-16",end:"2026-12-31"},
  ibs_cbs_cnpj_registration_window:{start:"2026-10-31",end:"2026-12-31"},
  option_at_cnpj_registration:true as const,
  ibs_cbs_effective_window:{start:"2027-01-01",end:"2027-06-30"},
  effect_basis:"cnpj_registration_for_ibs_cbs" as const
};

test("2027 IBS/CBS start-of-activity option uses CNPJ registration instead of the general window",()=>{
  const r=resolveSimplesNationalIbsCbsStartOfActivityOption({
    cnpjRegistrationDate:"2026-11-15",
    period:"2027-02-01",
    optionModel:"simples_hibrido",
    rule:RULE,
    startOfActivityRule:START_OF_ACTIVITY_RULE
  });
  assert.equal(r.decisionSource,"start_of_activity_cnpj_registration");
  assert.equal(r.optionModel,"simples_hibrido");
  assert.deepEqual(r.optionWindow,{start:"2026-11-15",end:"2026-11-15"});
  assert.equal(r.effectStart,"2027-01-01");
  assert.equal(r.effectEnd,"2027-06-30");
});

test("2027 IBS/CBS start-of-activity exception rejects registrations before its normative boundary",()=>{
  assert.throws(()=>resolveSimplesNationalIbsCbsStartOfActivityOption({
    cnpjRegistrationDate:"2026-10-30",
    period:"2027-01-01",
    rule:RULE,
    startOfActivityRule:START_OF_ACTIVITY_RULE
  }),/outside the 2027 start-of-activity exception/);
});

test("2027 IBS/CBS start-of-activity exception rejects periods outside Jan-Jun",()=>{
  assert.throws(()=>resolveSimplesNationalIbsCbsStartOfActivityOption({
    cnpjRegistrationDate:"2026-12-31",
    period:"2027-07-01",
    rule:RULE,
    startOfActivityRule:START_OF_ACTIVITY_RULE
  }),/outside the start-of-activity IBS\/CBS effect window/);
});

test("2027 Simples Nacional start-of-activity option uses the separate CNPJ registration window",()=>{
  const r=resolveSimplesNationalStartOfActivityOption({
    cnpjRegistrationDate:"2026-10-16",
    period:"2027-01-01",
    rule:RULE,
    startOfActivityRule:START_OF_ACTIVITY_RULE
  });
  assert.equal(r.decisionSource,"start_of_activity_cnpj_registration");
  assert.equal(r.optionAtCnpjRegistration,true);
  assert.deepEqual(r.optionWindow,{start:"2026-10-16",end:"2026-10-16"});
  assert.equal(r.effectStart,"2027-01-01");
  assert.equal(r.effectEnd,"2027-12-31");
});

test("2027 Simples Nacional start-of-activity option accepts the last normative registration date",()=>{
  const r=resolveSimplesNationalStartOfActivityOption({
    cnpjRegistrationDate:"2026-12-31",
    period:"2027-12-31",
    rule:RULE,
    startOfActivityRule:START_OF_ACTIVITY_RULE
  });
  assert.equal(r.optionAtCnpjRegistration,true);
});

test("2027 Simples National start-of-activity option rejects registrations before its normative boundary",()=>{
  assert.throws(()=>resolveSimplesNationalStartOfActivityOption({
    cnpjRegistrationDate:"2026-10-15",
    period:"2027-01-01",
    rule:RULE,
    startOfActivityRule:START_OF_ACTIVITY_RULE
  }),/outside the 2027 Simples Nacional start-of-activity exception/);
});
