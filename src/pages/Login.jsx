import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2, ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { ADMIN_EMAIL } from "@/lib/adminAccess";

const MAX_ATTEMPTS = 5;
// Escalating lockout (seconds): 30s, 1m, 2m, 5m, 15m
const LOCKOUT_STEPS = [30, 60, 120, 300, 900];
const LOCK_KEY = "admin_login_lock";

function readLock() {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    return raw ? JSON.parse(raw) : { attempts: 0, lockoutCount: 0, lockoutUntil: 0 };
  } catch {
    return { attempts: 0, lockoutCount: 0, lockoutUntil: 0 };
  }
}
function writeLock(s) {
  localStorage.setItem(LOCK_KEY, JSON.stringify(s));
}

export default function Login() {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lock, setLock] = useState(readLock);
  const [now, setNow] = useState(Date.now());

  const returnTo = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get("returnTo");
      return p && p.startsWith("/") ? p : "/admin";
    } catch {
      return "/admin";
    }
  })();

  // Tick every second so the lockout countdown updates live
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const lockedUntil = lock.lockoutUntil || 0;
  const isLocked = now < lockedUntil;
  const remaining = isLocked ? Math.ceil((lockedUntil - now) / 1000) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (isLocked) return;

    // Restrict to the single authorized administrator email
    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      setError("Access denied. This portal is restricted to the authorized administrator.");
      return;
    }

    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email.trim(), password);
      writeLock({ attempts: 0, lockoutCount: 0, lockoutUntil: 0 });
      window.location.href = returnTo;
    } catch (err) {
      const cur = readLock();
      const attempts = cur.attempts + 1;
      let lockoutCount = cur.lockoutCount;
      let lockoutUntil = 0;
      if (attempts >= MAX_ATTEMPTS) {
        const step = LOCKOUT_STEPS[Math.min(lockoutCount, LOCKOUT_STEPS.length - 1)];
        lockoutUntil = Date.now() + step * 1000;
        lockoutCount += 1;
        writeLock({ attempts: 0, lockoutCount, lockoutUntil });
      } else {
        writeLock({ attempts, lockoutCount, lockoutUntil });
      }
      setLock(readLock());
      setNow(Date.now());
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Admin Sign In"
      subtitle="Authorized personnel only"
      footer={
        <Link to="/" className="text-primary font-medium hover:underline">
          Back to store
        </Link>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLocked && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          Too many failed attempts. Please try again in {remaining}s.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
              disabled={isLocked}
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || isLocked}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}