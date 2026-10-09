// ============================================================================
// Shared security helpers (inquiry endpoint hardening).
// Pure functions, no network access, so they are unit-testable offline.
// ============================================================================

/** Only http(s) image URLs may be stored; blocks javascript:, data:, file: etc. */
export function safeImageUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const u = new URL(value.slice(0, 1000));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function isValidEmailAddress(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,10}$/.test(email)
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

/**
 * Client IP for rate limiting / audit. On Vercel, x-real-ip and the LAST hop we
 * do not control are set by the platform; the first x-forwarded-for entry is
 * client-controlled and spoofable. Prefer platform headers.
 */
export function trustedClientIp(req) {
  const h = req.headers || {};
  const real = h['x-vercel-forwarded-for'] || h['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.split(',')[0].trim().slice(0, 64);
  const xff = h['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    return (parts[parts.length - 1] || '').slice(0, 64) || '0.0.0.0';
  }
  return (req.socket && req.socket.remoteAddress) || '0.0.0.0';
}

/** Tiny fixed-window limiter (per warm instance; a best-effort speed bump). */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return function allow(key) {
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    }
    const rec = hits.get(key);
    if (!rec || now - rec.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    rec.count += 1;
    return rec.count <= max;
  };
}
