import test from "node:test";
import assert from "node:assert/strict";
import { simulateConsumptionTransition } from "../src/services/taxService.js";
test("2026 transition simulation uses official test rates",()=>{const r=simulateConsumptionTransition({base:1000,year:2026});assert.equal(r.cbs,9);assert.equal(r.ibs,1);assert.equal(r.total,10);});
