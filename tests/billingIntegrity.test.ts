import test from "node:test";
import assert from "node:assert/strict";
import {
  changePlan,
  recordPaymentConfirmation,
  getActivePaymentConfirmation,
  startTrial,
} from "../src/services/billingService.js";

const databaseUrl = process.env.DATABASE_URL;

const TEST_USER = "test-user-integrity";
const TEST_COMPANY = "test-company-integrity";

test(
  "P0-4: changePlan to paid plan without payment confirmation must fail",
  { skip: !databaseUrl },
  async () => {
    await assert.rejects(
      () => changePlan(TEST_USER, "pro", "manual", {}),
      /payment confirmation required/
    );
  }
);

test(
  "P0-4: changePlan to free plan without payment confirmation must succeed",
  { skip: !databaseUrl },
  async () => {
    const result = await changePlan(TEST_USER, "free", "manual", {});
    assert.equal(result.toPlan, "free");
    assert.equal(result.fromPlan, "free");
  }
);

test(
  "P0-4: changePlan to pro with payment confirmation must succeed",
  { skip: !databaseUrl },
  async () => {
    await recordPaymentConfirmation(
      TEST_USER,
      TEST_COMPANY,
      9990,
      "pro",
      "webhook-test-1",
      "sig-test-1",
      "idem-test-pro-1"
    );
    const confirmation = await getActivePaymentConfirmation(TEST_USER, "pro");
    assert.ok(confirmation, "payment confirmation should exist");
    assert.equal(confirmation.plan, "pro");

    const result = await changePlan(TEST_USER, "pro", "upgrade", {});
    assert.equal(result.toPlan, "pro");
  }
);

test(
  "P0-4: changePlan to business without payment confirmation must fail",
  { skip: !databaseUrl },
  async () => {
    await assert.rejects(
      () => changePlan(TEST_USER, "business", "manual", {}),
      /payment confirmation required/
    );
  }
);

test(
  "P0-4: startTrial must work and return trial subscription",
  { skip: !databaseUrl },
  async () => {
    const result = await startTrial("test-user-trial", 7);
    assert.ok(result.id);
    assert.equal(result.plan, "free");
    assert.equal(result.status, "trialing");
    assert.ok(result.trial_ends_at);
  }
);

test(
  "P0-4: startTrial cannot be started twice for same user",
  { skip: !databaseUrl },
  async () => {
    await assert.rejects(
      () => startTrial("test-user-trial-duplicate", 7),
      /trial already used/
    );
    await assert.rejects(
      () => startTrial("test-user-trial-duplicate", 7),
      /trial already used/
    );
  }
);