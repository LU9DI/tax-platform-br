import { Router } from "express";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import { initDb } from "../core/db.js";
import { issueToken, verifyTokenWithRevocation, logoutToken } from "../core/auth.js";
import { requireAuth, requireLogout } from "../middleware/auth.js";

const router = Router();
const emailOf = (value: unknown) => String(value ?? "").trim().toLowerCase();

router.post("/register", async (req, res) => {
  const email = emailOf(req.body?.email);
  const password = String(req.body?.password ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return res.status(400).json({ error: "valid email and password of at least 8 characters are required" });
  }
  try {
    const db = await initDb();
    const hash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    await db.query("INSERT INTO app_users (id,email,password_hash,email_verified) VALUES ($1,$2,$3,$4)", [id, email, hash, false]);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query(
      "INSERT INTO email_verification_tokens (id,user_id,token,expires_at) VALUES ($1,$2,$3,$4)",
      [randomUUID(), id, verificationToken, expiresAt]
    );
    return res.status(201).json({ 
      user: { id, email, email_verified: false }, 
      requiresVerification: true,
      message: "Registration successful. Please verify your email before signing in."
    });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ error: "email already registered" });
    return res.status(500).json({ error: "registration failed" });
  }
});

router.post("/login", async (req, res) => {
  const email = emailOf(req.body?.email);
  const password = String(req.body?.password ?? "");
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  try {
    const db = await initDb();
    const result = await db.query("SELECT id,email,password_hash,email_verified FROM app_users WHERE email=$1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    if (!user.email_verified) {
      return res.status(403).json({ 
        error: "email not verified", 
        requiresVerification: true,
        message: "Please verify your email before signing in."
      });
    }
    return res.json({ user: { id: user.id, email: user.email }, token: issueToken(user.id) });
  } catch {
    return res.status(500).json({ error: "login failed" });
  }
});

router.get("/verify-email", async (req, res) => {
  const token = String(req.query?.token ?? "");
  if (!token) return res.status(400).json({ error: "verification token is required" });
  try {
    const db = await initDb();
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const tokenRow = await client.query(
        "SELECT id,user_id,expires_at,used FROM email_verification_tokens WHERE token=$1 FOR UPDATE",
        [token]
      );
      if (!tokenRow.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "invalid verification token" });
      }
      const tr = tokenRow.rows[0];
      if (tr.used) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "verification token already used" });
      }
      if (new Date(tr.expires_at).getTime() <= Date.now()) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "verification token expired" });
      }
      await client.query(
        "UPDATE email_verification_tokens SET used=true WHERE id=$1",
        [tr.id]
      );
      await client.query(
        "UPDATE app_users SET email_verified=true,updated_at=now() WHERE id=$1",
        [tr.user_id]
      );
      await client.query("COMMIT");
      return res.json({ message: "email verified successfully" });
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error("verification transaction failed");
    } finally {
      client.release();
    }
  } catch {
    return res.status(500).json({ error: "verification failed" });
  }
});

router.post("/resend-verification", async (req, res) => {
  const email = emailOf(req.body?.email);
  if (!email) return res.status(400).json({ error: "email is required" });
  try {
    const db = await initDb();
    const result = await db.query("SELECT id,email_verified FROM app_users WHERE email=$1", [email]);
    if (!result.rowCount) {
      return res.json({ message: "if the email exists, a verification link was sent" });
    }
    const user = result.rows[0];
    if (user.email_verified) {
      return res.json({ message: "email already verified" });
    }
    await db.query(
      "UPDATE email_verification_tokens SET used=true WHERE user_id=$1 AND used=false",
      [user.id]
    );
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query(
      "INSERT INTO email_verification_tokens (id,user_id,token,expires_at) VALUES ($1,$2,$3,$4)",
      [randomUUID(), user.id, verificationToken, expiresAt]
    );
    return res.json({ message: "if the email exists, a verification link was sent" });
  } catch {
    return res.status(500).json({ error: "resend failed" });
  }
});

router.post("/logout", requireAuth, requireLogout, async (req, res) => {
  const header = req.header("authorization");
  const token = header?.slice(7).trim();
  const userId = (req as any).userId;
  if (!token || !userId) return res.status(401).json({ error: "unauthorized" });
  try {
    await logoutToken(userId, token, "logout");
    return res.json({ message: "logged out successfully" });
  } catch {
    return res.status(500).json({ error: "logout failed" });
  }
});

export default router;