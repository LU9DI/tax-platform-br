import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTaxProfile } from "../src/domain/tax.js";
test("validates Brazilian tax profile",()=>{assert.equal(validateTaxProfile({taxpayerType:"individual",country:"BR",taxYear:2026}),true);assert.equal(validateTaxProfile({taxpayerType:"individual",country:"US",taxYear:2026} as any),false);});
