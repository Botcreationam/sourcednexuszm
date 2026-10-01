import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  const { updatePassword, session } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isRecoveryActive, setIsRecoveryActive] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkRecoveryState() {
      // Check for Supabase session or URL hash recovery tokens
      const hash = window.location.hash;
      const hasRecoveryHash = hash.includes("type=recovery") || hash.includes("access_token");
      const code = searchParams.get("code");

      if (hasRecoveryHash || code || session) {
        if (isMounted) {
          setIsRecoveryActive(true);
          setCheckingSession(false);
        }
        return;
      }

      if (isSupabaseConfigured && supabase) {
        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (isMounted) {
            setIsRecoveryActive(Boolean(currentSession));
          }
        } catch {
          if (isMounted) setIsRecoveryActive(false);
        }
      }

      if (isMounted) setCheckingSession(false);
    }

    checkRecoveryState();

    // Listen for PASSWORD_RECOVERY event from Supabase
    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          if (isMounted) {
            setIsRecoveryActive(true);
            setCheckingSession(false);
          }
        }
      });
      return () => {
        isMounted = false;
        subscription?.unsubscribe();
      };
    }
  }, [searchParams, session]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await updatePassword(newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err?.message || "Failed to update password. Your recovery link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <AuthLayout
        icon={Lock}
        title="Verifying Reset Request"
        subtitle="Validating security token..."
      >
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout
        icon={CheckCircle2}
        title="Password Updated"
        subtitle="Your password has been changed successfully"
        footer={
          <Link to="/login" className="text-primary font-medium hover:underline">
            Proceed to Login
          </Link>
        }
      >
        <div className="text-center py-4 space-y-4">
          <p className="text-sm text-muted-foreground font-light leading-relaxed">
            Your new password is now active. You can now use your updated credentials to sign in to your Sourced Nexus account.
          </p>
          <div className="pt-2">
            <Button
              className="w-full h-12 font-medium"
              onClick={() => navigate("/login")}
            >
              Sign In Now
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (!isRecoveryActive) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Expired or Invalid Link"
        subtitle="This password reset link is invalid or has expired"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Request a new link
          </Link>
        }
      >
        <div className="text-center py-4 space-y-4">
          <p className="text-sm text-muted-foreground font-light leading-relaxed">
            For your security, password reset links expire after a short duration and can only be used once. Please request a fresh reset link.
          </p>
          <div className="pt-2">
            <Button
              className="w-full h-12 font-medium"
              onClick={() => navigate("/forgot-password")}
            >
              Request New Reset Link
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      logo="/logo.png"
      title="Create New Password"
      subtitle="Enter and confirm your new secure password"
      footer={
        <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground">
          Cancel and return to sign in
        </Link>
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
          <Label htmlFor="password">New Password (min 6 characters)</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
              disabled={loading}
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Updating Password...
            </>
          ) : (
            "Save New Password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
