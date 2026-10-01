import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Cloudflare Turnstile Verification Widget
 * Conforms to Cloudflare Turnstile token lifecycle:
 * - Explicit rendering
 * - Retains widgetId for single-use token lifecycle
 * - Exposes .reset() via forwardRef
 * - Cleans up on unmount
 */
const TurnstileWidget = forwardRef(function TurnstileWidget(
  {
    action = "general",
    onVerify,
    onError,
    onExpire,
    siteKey,
    theme = "auto",
    className = "",
  },
  ref
) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [errorCode, setErrorCode] = useState(null);
  const [showRetry, setShowRetry] = useState(false);

  // Stable callback refs to prevent tearing down the widget on parent re-renders
  const onVerifyRef = useRef(onVerify);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
  });

  // Resolve site key from props, runtime window.__ENV__, or build-time env
  const resolvedSiteKey =
    siteKey ||
    (typeof window !== "undefined" && window.__ENV__?.VITE_TURNSTILE_SITE_KEY) ||
    import.meta.env.VITE_TURNSTILE_SITE_KEY ||
    "0x4AAAAAAFK-wvkqs7-r6aUS";

  // Expose reset and getResponse methods to parent forms
  useImperativeHandle(ref, () => ({
    reset: () => {
      setIsVerified(false);
      setErrorCode(null);
      if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current !== null) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch (e) {
          console.warn("[Turnstile] Reset failed:", e);
        }
      }
    },
    getResponse: () => {
      if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current !== null) {
        return window.turnstile.getResponse(widgetIdRef.current);
      }
      return "";
    },
  }));

  // Load Turnstile script once
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.turnstile) {
      setScriptLoaded(true);
      return;
    }

    const existingScript = document.querySelector(`script[src*="challenges.cloudflare.com/turnstile"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => setScriptLoaded(true));
      if (window.turnstile) setScriptLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = (err) => {
      console.error("[Turnstile] Script failed to load", err);
      onErrorRef.current?.(err);
    };
    document.head.appendChild(script);
  }, []);

  // Render the Turnstile widget explicitly
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || typeof window === "undefined" || !window.turnstile) {
      return;
    }

    // Prevent duplicate rendering
    if (widgetIdRef.current !== null) {
      return;
    }

    try {
      console.log("[Turnstile] Rendering widget with sitekey:", resolvedSiteKey, "action:", action);
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: resolvedSiteKey,
        action: action,
        theme: theme,
        retry: "never", // Do not spam reload in an infinite loop on verification failure
        callback: (token) => {
          setIsVerified(true);
          setErrorCode(null);
          onVerifyRef.current?.(token);
        },
        "error-callback": (code) => {
          console.error("[Turnstile] Error callback with code:", code);
          setErrorCode(code);
          onErrorRef.current?.(code);
        },
        "expired-callback": () => {
          setIsVerified(false);
          onExpireRef.current?.();
        },
      });

      widgetIdRef.current = widgetId;
    } catch (err) {
      console.error("[Turnstile] Render error:", err);
      onErrorRef.current?.(err);
    }

    return () => {
      if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [scriptLoaded, resolvedSiteKey, action, theme]);

  useEffect(() => {
    if (!isVerified) {
      const timer = setTimeout(() => setShowRetry(true), 7000);
      return () => clearTimeout(timer);
    } else {
      setShowRetry(false);
    }
  }, [isVerified]);

  const handleManualRetry = () => {
    if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current !== null) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {}
    }
  };

  return (
    <div className={`my-3 flex flex-col justify-center items-center min-h-[65px] ${className}`}>
      <div ref={containerRef} className="cf-turnstile-container" />
      {errorCode && (
        <div className="text-[12px] text-destructive text-center mt-1.5 max-w-[320px] bg-destructive/10 px-2.5 py-1.5 rounded">
          {errorCode === "110200" || errorCode === "300030" ? (
            <span>
              Cloudflare Turnstile domain mismatch: <strong>{typeof window !== "undefined" ? window.location.hostname : "this domain"}</strong> must be added under <em>Domains</em> in your Cloudflare Turnstile dashboard.
            </span>
          ) : (
            <span>Security check error (code: {String(errorCode)}).</span>
          )}
        </div>
      )}
      {showRetry && !isVerified && !errorCode && (
        <button
          type="button"
          onClick={handleManualRetry}
          className="text-[11px] text-muted-foreground hover:text-foreground underline mt-1.5"
        >
          Verification taking long? Click to retry
        </button>
      )}
    </div>
  );
});


/**
 * Validates a turnstile token with the canonical server siteverify endpoint
 * @param {string} token
 * @param {string} action
 */
export async function verifyTurnstileToken(token, action) {
  if (!token) {
    throw new Error("Please complete the bot security verification before proceeding.");
  }
  const res = await fetch("/api/verify-turnstile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, action }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Bot verification failed. Please try again.");
  }
  return data;
}

export default TurnstileWidget;
