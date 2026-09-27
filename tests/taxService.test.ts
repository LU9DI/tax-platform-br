import test from "node:test";
import assert from "node:assert/strict";
import { simulateConsumptionTransition } from "../src/services/taxService.js";

const RTC_RULE={cbs_rate:0.009,ibs_rate:0.001};

test("2026 transition simulation uses versioned rule parameters",()=>{
  const r=simulateConsumptionTransition({base:1000,year:2026},RTC_RULE);
  assert.equal(r.cbs,9);
  assert.equal(r.ibs,1);
  assert.equal(r.total,10);
});