const developmentBuckets = new Map();

function sharedStoreConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function assertRateLimitConfiguration() {
  if (process.env.NODE_ENV === 'production' && !sharedStoreConfigured()) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for production rate limiting.');
  }
}

function clientKey(req) {
  // req.ip is trustworthy only after Express's explicit trust-proxy configuration.
  return req.user?.id || req.ip || 'unknown';
}

async function incrementShared(key, windowMs) {
  const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['PEXPIRE', key, String(windowMs), 'NX'], ['PTTL', key]]),
  });
  if (!response.ok) throw new Error('Shared rate-limit store unavailable.');
  const results = await response.json();
  return { count: Number(results[0]?.result || 0), ttl: Math.max(0, Number(results[2]?.result || windowMs)) };
}

function incrementDevelopment(key, windowMs) {
  const now = Date.now();
  const current = developmentBuckets.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    developmentBuckets.set(key, next);
    return { count: next.count, ttl: windowMs };
  }
  current.count += 1;
  return { count: current.count, ttl: current.resetAt - now };
}

export function createRateLimiter({ limit, windowMs, keyPrefix }) {
  return async (req, res, next) => {
    try {
      const key = `${keyPrefix}:${clientKey(req)}`;
      const bucket = sharedStoreConfigured()
        ? await incrementShared(key, windowMs)
        : incrementDevelopment(key, windowMs);
      const retryAfterSeconds = Math.max(1, Math.ceil(bucket.ttl / 1000));
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((Date.now() + bucket.ttl) / 1000)));
      if (bucket.count > limit) {
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({ success: false, error: 'Too many requests.', retryAfterSeconds });
      }
      return next();
    } catch (error) {
      // Never silently downgrade production protection to a per-instance limiter.
      if (process.env.NODE_ENV === 'production') return res.status(503).json({ success: false, error: 'Rate-limit service unavailable.' });
      return next(error);
    }
  };
}

export const softReadLimiter = createRateLimiter({ keyPrefix: 'api-read', limit: 300, windowMs: 60_000 });
export const strictWriteLimiter = createRateLimiter({ keyPrefix: 'api-write', limit: 80, windowMs: 60_000 });
export const loginLimiter = createRateLimiter({ keyPrefix: 'login', limit: process.env.NODE_ENV === 'production' ? 10 : 1000, windowMs: 900_000 });
export const registrationLimiter = createRateLimiter({ keyPrefix: 'registration', limit: process.env.NODE_ENV === 'production' ? 5 : 1000, windowMs: 3_600_000 });
export const passwordResetLimiter = createRateLimiter({ keyPrefix: 'password-reset', limit: process.env.NODE_ENV === 'production' ? 5 : 1000, windowMs: 3_600_000 });
export const publicAddressLimiter = createRateLimiter({ keyPrefix: 'address', limit: 120, windowMs: 60_000 });
export const expensiveOperationLimiter = createRateLimiter({ keyPrefix: 'expensive', limit: 20, windowMs: 60_000 });
