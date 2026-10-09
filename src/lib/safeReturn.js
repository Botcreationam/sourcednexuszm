/**
 * Only same-site relative paths may be used as a post-login destination.
 * Blocks open redirects such as //evil.com, /\evil.com, https://evil.com,
 * javascript: and encoded variants. Anything unsafe falls back to "/".
 */
export function safeReturnTo(value, fallback = "/") {
  if (typeof value !== "string" || !value) return fallback;
  let v = value.trim();
  try { v = decodeURIComponent(v); } catch { return fallback; }
  if (v.length > 500) return fallback;
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(v)) return fallback;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(v)) return fallback;
  return v;
}
