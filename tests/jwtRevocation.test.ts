import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  signAccessToken,
  verifyAccessToken,
  isTokenRevoked,
  revokeToken,
} from "../src/core/jwt.js";
import { logoutToken } from "../src/core/auth.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "P0-2: JWT token includes jti claim",
  () => {
    process.env.JWT_SECRET = "test-secret-with-at-least-32-characters-123";
    const token = signAccessToken({ sub: "user-1", role: "user" });
    const payloadPart = token.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString());
    assert.ok(payload.jti, "token should include jti claim");
    assert.equal(typeof payload.jti, "string");
  }
);

test(
  "P0-2: isTokenRevoked returns false for non-revoked token",
  { skip: !databaseUrl },
  async () => {
    process.env.JWT_SECRET = "test-secret-with-at-least-32-characters-123";
    const token = signAccessToken({ sub: "user-1", role: "user" });
    const payloadPart = token.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString());
    const revoked = await isTokenRevoked(payload.jti);
    assert.equal(revoked, false);
  }
);

test(
  "P0-2: revokeToken stores revocation in database",
  { skip: !databaseUrl },
  async () => {
    process.env.JWT_SECRET = "test-secret-with-at-least-32-characters-123";
    const token = signAccessToken({ sub: "user-1", role: "user" });
    const payloadPart = token.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString());
    const decoded = JSON.parse(Buffer.from(payloadPart, "base64").toString());
    const expiresAt = new Date(decoded.exp * 1000);
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const result = await revokeToken(
      "user-1",
      payload.jti,
      tokenHash,
      expiresAt,
      "logout"
    );
    assert.ok(result.id);
    assert.equal(result.userId, "user-1");
    assert.equal(result.tokenId, payload.jti);
    assert.equal(result.reason, "logout");

    const isRevoked = await isTokenRevoked(payload.jti);
    assert.equal(isRevoked, true);
  }
);

test(
  "P0-2: verifyAccessToken with checkRevocation throws for revoked token",
  { skip: !databaseUrl },
  async () => {
    process.env.JWT_SECRET = "test-secret-with-at-least-32-characters-123";
    const token = signAccessToken({ sub: "user-2", role: "user" });
    const payloadPart = token.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString());
    const decoded = JSON.parse(Buffer.from(payloadPart, "base64").toString());
    const expiresAt = new Date(decoded.exp * 1000);
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    await revokeToken("user-2", payload.jti, tokenHash, expiresAt, "logout");

    await assert.rejects(
      () => verifyAccessToken(token, true),
      /token revoked/
    );
  }
);

test(
  "P0-2: verifyAccessToken without checkRevocation still works for revoked token",
  { skip: !databaseUrl },
  async () => {
    process.env.JWT_SECRET = "test-secret-with-at-least-32-characters-123";
    const token = signAccessToken({ sub: "user-3", role: "user" });
    const payloadPart = token.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString());
    const decoded = JSON.parse(Buffer.from(payloadPart, "base64").toString());
    const expiresAt = new Date(decoded.exp * 1000);
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    await revokeToken("user-3", payload.jti, tokenHash, expiresAt, "logout");

    // Without checkRevocation, the token should still verify
    const result = await verifyAccessToken(token);
    assert.equal(result.sub, "user-3");
  }
);

test(
  "P0-2: logoutToken revokes the provided token",
  { skip: !databaseUrl },
  async () => {
    process.env.JWT_SECRET = "test-secret-with-at-least-32-characters-123";
    const token = signAccessToken({ sub: "user-4", role: "user" });
    const payloadPart = token.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadPart, "base64").toString());

    const result = await logoutToken("user-4", token, "logout");
    assert.ok(result.id);
    assert.equal(result.userId, "user-4");
    assert.equal(result.tokenId, payload.jti);

    const isRevoked = await isTokenRevoked(payload.jti);
    assert.equal(isRevoked, true);
  }
);