import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Mail, Lock, Loader2, ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

const MAX_ATTEMPTS = 5;
const LOCKOUT_STEPS = [30, 60, 120, 300, 900];
const LOCK_KEY = "admin_portal_lock";

function readLock() {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    return raw ? JSON.parse(raw) : { attempts: 0, lockoutCount: 0, lockoutUntil: 0 };
  } catch {
    return { attempts: 0, lockoutCount: 0, lockoutUntil: 0 };
  }
}

function writeLock(s) {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(s));
  } catch {}
}

export default function AdminPortalLogin() {
  const { login, isAdmin, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lock, setLock] = useState(readLock);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // If already authenticated and verified admin, redirect to /admin
  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      navigate("/secure/nexuspanel-trust", { replace: true });
    }
  }, [isAuthenticated, isAdmin, navigate]);

  const lockedUntil = lock.lockoutUntil || 0;
  const isLocked = now < lockedUntil;
  const remaining = isLocked ? Math.ceil((lockedUntil - now) / 1000) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (isLocked) return;

    if (!email.trim() || !password) {
      setError("Please provide your admin email and password.");
      return;
    }

    setLoading(true);
    try {
      const data = await login(email.trim(), password);
      writeLock({ attempts: 0, lockoutCount: 0, lockoutUntil: 0 });

      // Note: AuthContext automatically checks admin_users table
      // In case the user is not an authorized admin, verify
      if (!data?.user) {
        throw new Error("Invalid credentials");
      }
      
      navigate("/secure/nexuspanel-trust", { replace: true });
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

      const msg = err?.message || "Invalid authentication credentials";
      setError(msg.includes("Invalid login") ? "Invalid administrator credentials." : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={ShieldCheck}
      logo={null}
      title="Restricted Admin Gateway"
      subtitle="Authorized management access only"
      footer={
        <Link to="/" className="text-muted-foreground hover:text-foreground text-xs uppercase tracking-wide-2">
          ← Return to Public Storefront
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
          Too many failed attempts. Security cooldown active: {remaining}s remaining.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="admin-email">Admin Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="admin-email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="sourcednexus@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
              disabled={isLocked || loading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-password">Secure Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
              disabled={isLocked || loading}
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 font-medium bg-foreground text-background hover:opacity-85" disabled={loading || isLocked}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Authenticating Credentials...
            </>
          ) : (
            "Authenticate Admin Portal"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
