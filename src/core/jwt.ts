import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { initDb } from "./db.js";

export type AuthPayload = { sub: string; role?: string; jti?: string };

const secrets = () =>
  [process.env.JWT_SECRET, process.env.JWT_SECRET_PREVIOUS]
    .filter((v): v is string => !!v?.trim())
    .map((v) => v.trim());

export function requireJwtSecret() {
  const s = secrets()[0];
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return s;
}

export function signAccessToken(payload: AuthPayload) {
  const jti = crypto.randomBytes(16).toString("hex");
  return jwt.sign({ ...payload, jti }, requireJwtSecret(), { expiresIn: 604800 });
}

export async function verifyAccessToken(token: string, checkRevocation = false) {
  requireJwtSecret();
  let last: unknown;
  for (const s of secrets()) {
    if (s.length < 32) continue;
    try {
      const payload = jwt.verify(token, s) as jwt.JwtPayload & AuthPayload;
      if (checkRevocation && payload.jti) {
        const revoked = await isTokenRevoked(payload.jti);
        if (revoked) throw new Error("token revoked");
      }
      return payload;
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("invalid token");
}

export async function isTokenRevoked(tokenId: string): Promise<boolean> {
  try {
    const db = initDb();
    const r = await db.query(
      "SELECT 1 FROM revoked_tokens WHERE token_id=$1 AND expires_at > now() LIMIT 1",
      [tokenId]
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    // Fail closed: if we cannot check revocation, treat as revoked
    return true;
  }
}

export async function revokeToken(
  userId: string,
  tokenId: string,
  tokenHash: string,
  expiresAt: Date,
  reason: string = "logout"
) {
  const db = initDb();
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO revoked_tokens(id,user_id,token_id,token_hash,revoked_at,reason,expires_at)
     VALUES($1,$2,$3,now(),$4,$5,$6)`,
    [id, userId, tokenId, tokenHash, reason, expiresAt]
  );
  return { id, userId, tokenId, reason };
}

export function generateJwtSecret() {
  return crypto.randomBytes(48).toString("base64url");
}
