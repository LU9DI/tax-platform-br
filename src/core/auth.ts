import {
  signAccessToken,
  verifyAccessToken,
  revokeToken,
  isTokenRevoked,
} from "./jwt.js";

export function issueToken(subject: string) {
  return signAccessToken({ sub: subject });
}

export async function verifyToken(token: string) {
  return verifyAccessToken(token);
}

export async function verifyTokenWithRevocation(token: string) {
  return verifyAccessToken(token, true);
}

export async function logoutToken(userId: string, token: string, reason: string = "logout") {
  const payload = await verifyAccessToken(token);
  const tokenId = payload.jti;
  if (!tokenId) throw new Error("token has no jti");
  const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
  const expiresAt = new Date(decoded.exp * 1000);
  const tokenHash = require("crypto").createHash("sha256").update(token).digest("hex");
  return revokeToken(userId, tokenId, tokenHash, expiresAt, reason);
}
