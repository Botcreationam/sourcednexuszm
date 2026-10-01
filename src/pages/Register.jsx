import React, { useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, User, Loader2, CheckCircle2, ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import OnboardingModal from "@/components/site/OnboardingModal";
import TurnstileWidget, { verifyTurnstileToken } from "@/components/TurnstileWidget";

export default function Register() {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Legal Consents (Not preselected as required by Zambian regulations)
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Cloudflare Turnstile token & single-use ref
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!agreeTerms || !agreePrivacy) {
      setError("Please review and accept both the Terms & Conditions and Privacy Policy to create your account.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the Cloudflare security verification before creating your account.");
      return;
    }

    setLoading(true);
    try {
      // 1. Canonical server-side siteverify verification
      await verifyTurnstileToken(turnstileToken, "signup");

      // 2. Existing registration logic (unchanged)
      const legalMetadata = {
        full_name: name.trim(),
        terms_accepted: true,
        terms_version: "2026-v1.0",
        terms_accepted_at: new Date().toISOString(),
        privacy_accepted: true,
        privacy_version: "2026-v1.0",
        privacy_accepted_at: new Date().toISOString(),
        marketing_consent: marketingConsent,
        personalization_consent: true,
      };

      const data = await register(email, password, legalMetadata, { captchaToken: turnstileToken });
      
      // If user session is established immediately without email confirmation blocking
      if (data?.session) {
        setShowOnboarding(true);
        return;
      }

      // If email confirmation link was sent
      setSuccess(true);
    } catch (err) {
      // Single-use token lifecycle: reset widget on submission failure
      turnstileRef.current?.reset();
      setTurnstileToken("");
      setError(err?.message || "Registration could not be completed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout
        icon={CheckCircle2}
        title="Account Created"
        subtitle="Verification link sent"
        footer={
          <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary font-medium hover:underline">
            Proceed to Login
          </Link>
        }
      >
        <div className="text-center py-4 space-y-4">
          <p className="text-sm text-muted-foreground font-light leading-relaxed">
            We've sent a verification link to <strong className="text-foreground">{email}</strong>.
            Please open the link in your email to confirm your account and activate protected features.
          </p>
          <div className="p-3 bg-muted/40 rounded-lg text-xs text-muted-foreground font-light text-left">
            💡 <strong>Note:</strong> Check your Spam or Promotions folder if the email doesn't appear within 2 minutes. Google sign-in users are automatically verified without email confirmation.
          </div>
          <div className="pt-2">
            <Button
              className="w-full h-12 font-medium"
              onClick={() => navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)}
            >
              Continue to Sign In
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <>
      <AuthLayout
        logo="/logo.png"
        title="Create Your Account"
        subtitle="Join Sourced Nexus for personal luxury sourcing"
        footer={
          <div className="space-y-2 text-center text-sm">
            <div>
              Already have an account?{" "}
              <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary font-medium hover:underline">
                Sign In
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
            <Label htmlFor="name">Full Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="name"
                type="text"
                autoComplete="name"
                autoFocus
                placeholder="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10 h-12"
                required
                disabled={loading || googleLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
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
            <Label htmlFor="password">Password (min 6 characters)</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-12"
                required
                disabled={loading || googleLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm Password</Label>
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
                disabled={loading || googleLoading}
              />
            </div>
          </div>

          {/* Legal Acceptance Checkboxes (Not preselected) */}
          <div className="space-y-3 pt-2 pb-1 border-t border-border">
            <div className="flex items-start gap-2.5">
              <input
                id="agree-terms"
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-foreground accent-foreground cursor-pointer"
                required
              />
              <label htmlFor="agree-terms" className="text-xs text-muted-foreground leading-snug cursor-pointer select-none">
                I agree to the{" "}
                <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2 hover:opacity-80">
                  Terms and Conditions
                </Link>{" "}
                governing orders and sourcing in Zambia. <span className="text-destructive">*</span>
              </label>
            </div>

            <div className="flex items-start gap-2.5">
              <input
                id="agree-privacy"
                type="checkbox"
                checked={agreePrivacy}
                onChange={(e) => setAgreePrivacy(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-foreground accent-foreground cursor-pointer"
                required
              />
              <label htmlFor="agree-privacy" className="text-xs text-muted-foreground leading-snug cursor-pointer select-none">
                I have read and accept the{" "}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2 hover:opacity-80">
                  Privacy Policy
                </Link>{" "}
                under the Zambian Data Protection Act. <span className="text-destructive">*</span>
              </label>
            </div>

            <div className="flex items-start gap-2.5">
              <input
                id="marketing-consent"
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border text-foreground accent-foreground cursor-pointer"
              />
              <label htmlFor="marketing-consent" className="text-xs text-muted-foreground leading-snug cursor-pointer select-none">
                (Optional) Receive personalized recommendations, new collection drops and private sourcing alerts.
              </label>
            </div>
          </div>

          {/* Cloudflare Turnstile Verification Widget */}
          <TurnstileWidget
            ref={turnstileRef}
            action="signup"
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

          <Button type="submit" className="w-full h-12 font-medium" disabled={loading || googleLoading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating Account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground tracking-wide-2 text-[10px]">
                Or sign up with
              </span>
            </div>
          </div>

          <button
            type="button"
            id="google-signup-btn"
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

      {/* Immediate Onboarding Modal on successful instant registration */}
      <OnboardingModal
        open={showOnboarding}
        onClose={() => {
          setShowOnboarding(false);
          navigate(returnTo, { replace: true });
        }}
      />
    </>
  );
}
