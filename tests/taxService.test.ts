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

import { ruleEvidenceMatches } from "../src/services/taxAuditService.js";

test("rule evidence stays bound to the resolved version when validity dates change", () => {
  const ruleX = {
    id: "rule-x",
    rule_code: "MEI_2026",
    version: "1",
    parameters: { annual_limit: 81000, das: { commerce: 76.9 } },
  };

  const evidenceFromX = {
    total: 76.9,
    ruleVersion: {
      id: "rule-x",
      code: "MEI_2026",
      version: "1",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      parameters: { annual_limit: 81000, das: { commerce: 76.9 } },
    },
  };

  const evidenceFromY = {
    ...evidenceFromX,
    ruleVersion: {
      ...evidenceFromX.ruleVersion,
      id: "rule-y",
      version: "2",
      parameters: { annual_limit: 90000, das: { commerce: 80 } },
    },
  };

  assert.equal(ruleEvidenceMatches(evidenceFromX, ruleX), true);
  assert.equal(ruleEvidenceMatches({
    ...evidenceFromX,
    ruleVersion: { ...evidenceFromX.ruleVersion, effectiveTo: "2026-06-30" },
  }, ruleX), true);
  assert.equal(ruleEvidenceMatches(evidenceFromY, ruleX), false);
});
