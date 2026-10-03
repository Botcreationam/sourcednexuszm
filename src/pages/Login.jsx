import React, { useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Loader2, ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import TurnstileWidget, { verifyTurnstileToken } from "@/components/TurnstileWidget";

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Cloudflare Turnstile token & ref
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please fill in both email and password.");
      return;
    }

    setLoading(true);
    try {
      if (turnstileToken) {
        await verifyTurnstileToken(turnstileToken, "login").catch(() => {});
      }

      const loginResult = await login(email.trim(), password, { captchaToken: turnstileToken || undefined });
      
      if (loginResult?.isAdmin) {
        navigate("/secure/nexuspanel-trust", { replace: true });
        return;
      }

      if (returnTo && returnTo !== "/") {
        navigate(returnTo, { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (err) {
      turnstileRef.current?.reset();
      setTurnstileToken("");
      const msg = err?.message || "Invalid email or password.";
      setError(msg.includes("Invalid login") ? "Invalid email or password. Please try again." : msg);
    } finally {
      setLoading(false);
    }
  };


  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle(returnTo);
    } catch (err) {
      setError(err?.message || "Failed to initialize Google sign-in. Please ensure Supabase credentials are configured.");
      setGoogleLoading(false);
    }
  };

  return (
    <AuthLayout
      logo="/logo.png"
      title="Welcome Back"
      subtitle="Sign in to your Sourced Nexus account"
      footer={
        <div className="space-y-2 text-center text-sm">
          <div>
            Don't have an account?{" "}
            <Link to={`/register${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className="text-primary font-medium hover:underline">
              Create account
            </Link>
          </div>
          <div>
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
              ← Continue browsing without logging in
            </Link>
          </div>
        </div>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
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
              disabled={loading || googleLoading}
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
              disabled={loading || googleLoading}
            />
          </div>
        </div>

        {/* Turnstile verification */}
        <div className="flex justify-center my-2">
          <TurnstileWidget
            ref={turnstileRef}
            action="login"
            onVerify={(token) => setTurnstileToken(token)}
            onExpire={() => setTurnstileToken("")}
            onError={() => setTurnstileToken("")}
          />
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || googleLoading}>

          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign In"
          )}
        </Button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground tracking-wide-2 text-[10px]">
              Or continue with
            </span>
          </div>
        </div>

        <button
          type="button"
          id="google-signin-btn"
          onClick={handleGoogleSignIn}
          disabled={loading || googleLoading}
          className="w-full h-12 border border-border hover:border-foreground transition-all flex items-center justify-center gap-3 text-xs tracking-wide-2 uppercase font-medium bg-card hover:bg-muted/40 text-foreground shadow-sm"
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <GoogleIcon className="w-4 h-4" />
          )}
          <span>{googleLoading ? "Connecting to Google..." : "Continue with Google"}</span>
        </button>
      </form>
    </AuthLayout>
  );
}