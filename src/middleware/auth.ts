import type { Request, Response, NextFunction } from "express";
import { verifyToken, verifyTokenWithRevocation, logoutToken } from "../core/auth.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "unauthorized" });

  try {
    const payload = await verifyToken(header.slice(7).trim());
    if (typeof payload.sub !== "string" || payload.sub.length < 1) {
      return res.status(401).json({ error: "invalid token" });
    }
    (req as Request & { userId?: string }).userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}

export function requireAuthWithRevocation(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "unauthorized" });

  (async () => {
    try {
      const payload = await verifyTokenWithRevocation(header.slice(7).trim());
      if (typeof payload.sub !== "string" || payload.sub.length < 1) {
        return res.status(401).json({ error: "invalid token" });
      }
      (req as Request & { userId?: string }).userId = payload.sub;
      return next();
    } catch {
      return res.status(401).json({ error: "invalid token" });
    }
  })();
}

export async function requireLogout(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "unauthorized" });

  try {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) return res.status(401).json({ error: "unauthorized" });
    await logoutToken(userId, header.slice(7).trim(), "logout");
    return next();
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
}