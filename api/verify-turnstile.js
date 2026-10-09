import { trustedClientIp } from '../lib/security-utils.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};
    const token = payload.token || payload['cf-turnstile-response'];
    const expectedAction = payload.action;

    const turnstileSecret = process.env.TURNSTILE_SECRET;
    const rawHostnames = process.env.TURNSTILE_HOSTNAMES || "localhost,127.0.0.1,sourcednexus.online,www.sourcednexus.online,sourcednexuszm.vercel.app";
    const expectedHostnames = new Set(
      rawHostnames.split(",").map((h) => h.trim()).filter(Boolean)
    );

    if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
      return res.status(403).json({ success: false, error: 'forbidden: invalid turnstile token format' });
    }

    if (!turnstileSecret && (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production')) {
      console.error('[turnstile] TURNSTILE_SECRET missing in production: refusing to bypass.');
      return res.status(503).json({ success: false, error: 'Verification is temporarily unavailable.' });
    }
    if (!turnstileSecret) {
      console.warn('[turnstile] TURNSTILE_SECRET is not configured.');
      return res.status(200).json({ 
        success: true, 
        warning: 'TURNSTILE_SECRET is not configured - bypassed for development' 
      });
    }

    const clientIp = trustedClientIp(req);
    
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: turnstileSecret,
        response: token,
        remoteip: clientIp,
      }),
    });

    if (!r.ok) {
      return res.status(403).json({ success: false, error: `siteverify failed with status ${r.status}` });
    }

    const result = await r.json();

    if (
      !result.success ||
      (expectedAction && result.action !== expectedAction) ||
      !expectedHostnames.has(result.hostname)
    ) {
      return res.status(403).json({ 
        success: false, 
        error: 'forbidden: verification rejected' 
      });
    }

    return res.status(200).json({ success: true, hostname: result.hostname });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error validating turnstile' });
  }
}
