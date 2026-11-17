import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; reset: number };

const buckets = new Map<string, Bucket>();
const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const windowMs = positiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
const apiMax = positiveInt(process.env.RATE_LIMIT_MAX, 120);
const authMax = positiveInt(process.env.AUTH_RATE_LIMIT_MAX, 20);
const maxBuckets = 10_000;

function cleanupExpired(now: number) {
  for (const [key, value] of buckets) {
    if (value.reset <= now) buckets.delete(key);
  }
}

export function rateLimit(req: Request & { userId?: string }, res: Response, next: NextFunction) {
  const isAuth = req.path.startsWith("/api/auth");
  const max = isAuth ? authMax : apiMax;
  // Try to use user_id from authenticated request for per-user rate limiting
  // The calculationRateLimit middleware injects userId into req.userId
  let key = `${req.ip || "unknown"}|${isAuth ? "auth" : "api"}`;
  if (req.userId && typeof req.userId === "string" && req.userId.length > 0) {
    key = `${req.userId}|${isAuth ? "auth" : "api"}`;
  }
  const now = Date.now();

  if (buckets.size >= maxBuckets) cleanupExpired(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  res.setHeader("X-RateLimit-Limit", String(max));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));

  if (bucket.count > max) {
    res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.reset - now) / 1000))));
    return res.status(429).json({ error: "rate limit exceeded" });
  }

  next();
}
