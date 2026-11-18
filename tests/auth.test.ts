import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { issueToken, verifyToken } from "../src/core/auth.js";

const original = process.env.JWT_SECRET;

beforeEach(() => { process.env.JWT_SECRET = "test-secret-with-at-least-32-characters-123"; });
afterEach(() => {
  if (original === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = original;
});

test("issues and verifies a token with a subject", async () => {
  const token = issueToken("user-123");
  const payload = await verifyToken(token);
  assert.equal(payload.sub, "user-123");
});

test("rejects weak JWT secrets", async () => {
  process.env.JWT_SECRET = "short";
  assert.throws(() => issueToken("user-123"), /at least 32 characters/);
  await assert.rejects(() => verifyToken("not-a-token"), /at least 32 characters/);
});