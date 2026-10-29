// api/_rate-limit.js
import { adminDb } from './_auth.js';

/**
 * Sliding window rate limiter backed by Firebase RTDB.
 * @param {string} uid - Firebase UID
 * @param {string} endpoint - unique endpoint name
 * @param {number} limit - max requests per window
 * @param {number} windowSeconds - window size (default 60)
 * @returns {{allowed: boolean, remaining: number, resetIn: number}}
 */
export async function checkRateLimit(uid, endpoint, limit, windowSeconds = 60) {
  if (!uid || !endpoint || !limit) {
    return { allowed: true, remaining: limit, resetIn: 0 };
  }

  const db = adminDb();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const bucket = Math.floor(now / windowMs);
  const key = `rate_limits/${uid}/${endpoint}/${bucket}`;

  const ref = db.ref(key);
  const snap = await ref.get();
  const current = snap.exists() ? Number(snap.val().count || 0) : 0;

  if (current >= limit) {
    const resetIn = Math.max(0, Math.ceil((windowMs - (now % windowMs)) / 1000));
    return { allowed: false, remaining: 0, resetIn };
  }

  const next = current + 1;
  await ref.set({
    count: next,
    ts: now,
    expireAt: now + windowMs * 3
  });
  // best-effort TTL cleanup on older buckets
  try {
    const oldBucket = bucket - 3;
    if (oldBucket > 0) db.ref(`rate_limits/${uid}/${endpoint}/${oldBucket}`).remove().catch(() => {});
  } catch (_) {}

  return { allowed: true, remaining: limit - next, resetIn: 0 };
}

export function rateLimitMiddleware(res, result) {
  if (!result.allowed) {
    res.setHeader('Retry-After', String(result.resetIn));
    res.status(429);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      success: false,
      status: false,
      error: `Terlalu banyak permintaan. Coba lagi dalam ${result.resetIn} detik.`
    }));
    return true;
  }
  return false;
}