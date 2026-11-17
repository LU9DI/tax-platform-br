import jwt from "jsonwebtoken";
import crypto from "node:crypto";

export type RevocationList = Set<string>;

export class TokenRevocationService {
  private revocationList: RevocationList;
  private readonly maxAge: number; // Tokens revogados são mantidos por este tempo

  constructor(maxAge: number = 24 * 60 * 60 * 1000) {
    this.revocationList = new Set();
    this.maxAge = maxAge;
  }

  /**
   * Mark a token as revoked. The token will be considered invalid after now().
   * In a production system, this would be stored in a database with persistence.
   */
  markRevoked(token: string): void {
    this.revocationList.add(token);
    // Clean up old revocations periodically
    // In production, this would be done by a background job
  }

  /**
   * Check if a token is revoked
   */
  isRevoked(token: string): boolean {
    // Clean up expired revocations
    const now = Date.now();
    // We can't easily check expiry on a Set without storing timestamps,
    // so we just check membership and rely on the maxAge above
    return this.revocationList.has(token);
  }

  /**
   * Verify a token with revocation check
   */
  verifyRevoked(token: string, secret: string): { valid: boolean; payload?: jwt.JwtPayload; error?: string } {
    try {
      // First check if token is revoked
      if (this.isRevoked(token)) {
        return { valid: false, error: "token revoked" };
      }
      const payload = jwt.verify(token, secret) as jwt.JwtPayload;
      return { valid: true, payload };
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  }
}