import type { Request, Response, NextFunction } from "express";
import { initDb } from "../core/db.js";

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const windowSeconds = positiveInt(process.env.CALCULATION_RATE_LIMIT_WINDOW_SECONDS, 60);
const maxRequests = positiveInt(process.env.CALCULATION_RATE_LIMIT_MAX, 60);

export async function calculationRateLimit(req: Request, res: Response, next: NextFunction) {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) return res.status(401).json({ error: "unauthorized" });

  const db = initDb();
  const bucketExpression = windowSeconds === 60
    ? "date_trunc('minute', now())"
    : "to_timestamp(floor(extract(epoch from now()) / $2) * $2)";

  try {
    const result = await db.query(
      `INSERT INTO api_rate_limit_windows(user_id,bucket_start,request_count)
       VALUES($1,${bucketExpression},1)
       ON CONFLICT(user_id,bucket_start)
       DO UPDATE SET request_count=api_rate_limit_windows.request_count+1
       RETURNING request_count,bucket_start`,
      windowSeconds === 60 ? [userId] : [userId, windowSeconds],
    );
    const count = Number(result.rows[0].request_count);
    const resetAt = new Date(new Date(result.rows[0].bucket_start).getTime() + windowSeconds * 1000);
    res.setHeader("X-Calculation-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-Calculation-RateLimit-Remaining", String(Math.max(0, maxRequests - count)));
    res.setHeader("X-Calculation-RateLimit-Reset", String(Math.ceil(resetAt.getTime() / 1000)));

    if (count > maxRequests) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))));
      return res.status(429).json({ error: "calculation rate limit exceeded" });
    }

    // Best-effort cleanup keeps the small fixed-window table bounded.
    await db.query(
      "DELETE FROM api_rate_limit_windows WHERE bucket_start < now() - make_interval(secs => $1)",
      [Math.max(windowSeconds * 10, 600)],
    ).catch(() => undefined);

    return next();
  } catch {
    // Fail closed for calculation endpoints: quota protection must not disappear
    // when the database-backed limiter itself cannot be evaluated.
    return res.status(503).json({ error: "calculation quota unavailable" });
  }
}
