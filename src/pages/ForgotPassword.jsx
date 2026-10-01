import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2, CheckCircle2, ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import TurnstileWidget, { verifyTurnstileToken } from "@/components/TurnstileWidget";

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // Turnstile verification state & single-use ref
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the Cloudflare security verification.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      // 1. Canonical server-side siteverify verification
      await verifyTurnstileToken(turnstileToken, "forgot_password");

      // 2. Dispatch password reset link via Supabase
      await resetPassword(email.trim(), { captchaToken: turnstileToken });
      setSent(true);
    } catch (err) {
      // Single-use token lifecycle: reset widget on failure
      turnstileRef.current?.reset();
      setTurnstileToken("");
      // For security, still show generic confirmation or specific error if invalid format
      if (err?.message?.includes("valid email")) {
        setError("Please enter a valid email address.");
      } else {
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={sent ? CheckCircle2 : null}
      logo={sent ? null : "/logo.png"}
      title={sent ? "Check Your Inbox" : "Reset Password"}
      subtitle={sent ? "Password recovery email dispatched" : "Enter your email to receive a secure reset link"}
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to log in
        </Link>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {sent ? (
        <div className="space-y-4 py-2 text-center">
          <p className="text-sm text-muted-foreground font-light leading-relaxed">
            If an account is registered with <strong className="text-foreground">{email}</strong>, you will receive a password reset link shortly.
          </p>
          <p className="text-xs text-muted-foreground/80 font-light">
            Follow the instructions in the email to securely choose your new password. The link will expire for your security.
          </p>
          <div className="pt-3">
            <Button
              variant="outline"
              className="w-full h-11 text-xs uppercase tracking-wide-2"
              onClick={() => setSent(false)}
            >
              Send to another email
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
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
                disabled={loading}
              />
            </div>
          </div>

          {/* Cloudflare Turnstile Verification Widget */}
          <TurnstileWidget
            ref={turnstileRef}
            action="forgot_password"
            onVerify={(token) => {
              setTurnstileToken(token);
              setError("");
            }}
            onError={() => {
              setError("Bot verification encountered an issue. Please refresh or retry.");
            }}
            onExpire={() => {
              setTurnstileToken("");
            }}
          />

          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending secure link...
              </>
            ) : (
              "Send password reset link"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
