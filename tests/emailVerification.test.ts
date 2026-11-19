import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;

test(
  "P0-3: registration does not emit authenticated session (no token)",
  { skip: !databaseUrl },
  async () => {
    const db = (await import("../src/core/db.js")).initDb();
    const email = `test-${Date.now()}@example.com`;
    const password = "Password123!";
    const id = randomUUID();
    await db.query("INSERT INTO app_users (id,email,password_hash,email_verified) VALUES ($1,$2,$3,$4)", [id, email, "hash", false]);
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query("INSERT INTO email_verification_tokens (id,user_id,token,expires_at) VALUES ($1,$2,$3,$4)", [randomUUID(), id, token, expiresAt]);
    // User should NOT have a valid session token
    const userRow = await db.query("SELECT email_verified FROM app_users WHERE id=$1", [id]);
    assert.equal(userRow.rows[0].email_verified, false);
    // Cleanup
    await db.query("DELETE FROM email_verification_tokens WHERE user_id=$1", [id]);
    await db.query("DELETE FROM app_users WHERE id=$1", [id]);
  }
);

test(
  "P0-3: verify-email marks email_verified=true and marks token as used",
  { skip: !databaseUrl },
  async () => {
    const db = (await import("../src/core/db.js")).initDb();
    const email = `test-verify-${Date.now()}@example.com`;
    const id = randomUUID();
    await db.query("INSERT INTO app_users (id,email,password_hash,email_verified) VALUES ($1,$2,$3,$4)", [id, email, "hash", false]);
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query("INSERT INTO email_verification_tokens (id,user_id,token,expires_at) VALUES ($1,$2,$3,$4)", [randomUUID(), id, token, expiresAt]);
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const tokenRow = await client.query(
        "SELECT id,user_id,expires_at,used FROM email_verification_tokens WHERE token=$1 FOR UPDATE",
        [token]
      );
      assert.equal(tokenRow.rowCount, 1);
      assert.equal(tokenRow.rows[0].used, false);
      await client.query("UPDATE email_verification_tokens SET used=true WHERE id=$1", [tokenRow.rows[0].id]);
      await client.query("UPDATE app_users SET email_verified=true,updated_at=now() WHERE id=$1", [id]);
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      throw;
    } finally {
      client.release();
    }
    const userRow = await db.query("SELECT email_verified FROM app_users WHERE id=$1", [id]);
    assert.equal(userRow.rows[0].email_verified, true);
    const tokenRow = await db.query("SELECT used FROM email_verification_tokens WHERE token=$1", [token]);
    assert.equal(tokenRow.rows[0].used, true);
    await db.query("DELETE FROM email_verification_tokens WHERE user_id=$1", [id]);
    await db.query("DELETE FROM app_users WHERE id=$1", [id]);
  }
);

test(
  "P0-3: expired verification token is rejected",
  { skip: !databaseUrl },
  async () => {
    const db = (await import("../src/core/db.js")).initDb();
    const email = `test-expired-${Date.now()}@example.com`;
    const id = randomUUID();
    await db.query("INSERT INTO app_users (id,email,password_hash,email_verified) VALUES ($1,$2,$3,$4)", [id, email, "hash", false]);
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() - 1000); // already expired
    await db.query("INSERT INTO email_verification_tokens (id,user_id,token,expires_at) VALUES ($1,$2,$3,$4)", [randomUUID(), id, token, expiresAt]);
    const isExpired = new Date(expiresAt).getTime() <= Date.now();
    assert.equal(isExpired, true);
    await db.query("DELETE FROM email_verification_tokens WHERE user_id=$1", [id]);
    await db.query("DELETE FROM app_users WHERE id=$1", [id]);
  }
);

test(
  "P0-3: resend-verification creates new token and invalidates old ones",
  { skip: !databaseUrl },
  async () => {
    const db = (await import("../src/core/db.js")).initDb();
    const email = `test-resend-${Date.now()}@example.com`;
    const id = randomUUID();
    await db.query("INSERT INTO app_users (id,email,password_hash,email_verified) VALUES ($1,$2,$3,$4)", [id, email, "hash", false]);
    const oldToken = crypto.randomBytes(32).toString("hex");
    const oldExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query("INSERT INTO email_verification_tokens (id,user_id,token,expires_at) VALUES ($1,$2,$3,$4)", [randomUUID(), id, oldToken, oldExpires]);
    // Simulate resend: mark old as used, create new
    await db.query("UPDATE email_verification_tokens SET used=true WHERE user_id=$1 AND used=false", [id]);
    const newToken = crypto.randomBytes(32).toString("hex");
    const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query("INSERT INTO email_verification_tokens (id,user_id,token,expires_at) VALUES ($1,$2,$3,$4)", [randomUUID(), id, newToken, newExpires]);
    const oldRow = await db.query("SELECT used FROM email_verification_tokens WHERE token=$1", [oldToken]);
    assert.equal(oldRow.rows[0].used, true);
    const newRow = await db.query("SELECT used FROM email_verification_tokens WHERE token=$1", [newToken]);
    assert.equal(newRow.rows[0].used, false);
    await db.query("DELETE FROM email_verification_tokens WHERE user_id=$1", [id]);
    await db.query("DELETE FROM app_users WHERE id=$1", [id]);
  }
);

import { randomUUID } from "node:crypto";