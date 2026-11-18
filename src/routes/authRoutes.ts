import { Router } from "express";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
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
    await db.query("INSERT INTO app_users (id,email,password_hash) VALUES ($1,$2,$3)", [id, email, hash]);
    return res.status(201).json({ user: { id, email }, token: issueToken(id) });
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
    const result = await db.query("SELECT id,email,password_hash FROM app_users WHERE email=$1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    return res.json({ user: { id: user.id, email: user.email }, token: issueToken(user.id) });
  } catch {
    return res.status(500).json({ error: "login failed" });
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