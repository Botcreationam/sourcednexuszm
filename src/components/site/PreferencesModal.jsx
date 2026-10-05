import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sliders, RotateCcw, ExternalLink, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  isPersonalizationEnabled,
  setPersonalizationEnabled,
  resetPersonalization,
  getStoredInterests,
} from "@/lib/recommendations";

export default function PreferencesModal({ open, onClose, onOpenInterests }) {
  const { user } = useAuth();
  const [personalization, setPersonalization] = useState(isPersonalizationEnabled);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [saving, setSaving] = useState(false);
  // Product-update emails: stored on the user's own user_profiles row.
  const [productEmails, setProductEmails] = useState(true);
  const [productEmailsLoading, setProductEmailsLoading] = useState(false);
  const [productEmailsError, setProductEmailsError] = useState("");

  useEffect(() => {
    if (open) {
      setPersonalization(isPersonalizationEnabled());
      setMarketingConsent(Boolean(user?.user_metadata?.marketing_consent));
      setResetDone(false);
    }
  }, [open, user]);

  // Load the saved product-update preference (defaults to ON when no row yet).
  useEffect(() => {
    if (!open || !user?.id || !supabase) return;
    let cancelled = false;
    setProductEmailsLoading(true);
    setProductEmailsError("");
    supabase
      .from("user_profiles")
      .select("product_notifications_enabled")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setProductEmailsError("Could not load your email preference.");
        } else {
          setProductEmails(data ? data.product_notifications_enabled !== false : true);
        }
      })
      .finally(() => { if (!cancelled) setProductEmailsLoading(false); });
    return () => { cancelled = true; };
  }, [open, user?.id]);

  const handleToggleProductEmails = async (checked) => {
    if (!user?.id || !supabase) return;
    const previous = productEmails;
    setProductEmails(checked);
    setProductEmailsError("");
    setProductEmailsLoading(true);
    // Upsert on the user's own id: RLS only permits writing your own row, so
    // this can never change another user's preference.
    const { error } = await supabase
      .from("user_profiles")
      .upsert({ id: user.id, product_notifications_enabled: checked, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) {
      setProductEmails(previous); // honest rollback: do not pretend it saved
      setProductEmailsError("Could not save your preference. Please try again.");
    }
    setProductEmailsLoading(false);
  };

  const handleTogglePersonalization = (checked) => {
    setPersonalization(checked);
    setPersonalizationEnabled(checked);
  };

  const handleToggleMarketing = async (checked) => {
    setMarketingConsent(checked);
    if (user && supabase) {
      setSaving(true);
      try {
        await supabase.auth.updateUser({
          data: {
            marketing_consent: checked,
            marketing_consent_updated_at: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.warn("Could not save marketing consent:", err);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleResetData = async () => {
    await resetPersonalization(user, supabase);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 3000);
  };

  const interests = user?.user_metadata?.interests || getStoredInterests();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border p-0 md:p-0 max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden">
        <div className="overflow-y-auto p-6 md:p-8 flex-1 no-scrollbar">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 text-primary text-xs uppercase tracking-wide-2 mb-1">
            <Sliders className="w-4 h-4" />
            <span>Account & Privacy Preferences</span>
          </div>
          <DialogTitle className="font-display text-2xl">Preferences & Privacy</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs font-light">
            Manage how Sourced Nexus personalizes your shopping experience and handles your data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 my-6 text-sm">
          {/* Shopping Interests Section */}
          <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground text-xs uppercase tracking-wide-2">Shopping Interests</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {interests.length > 0 ? `${interests.length} categories active` : "No specific categories selected"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  if (onOpenInterests) onOpenInterests();
                }}
                className="text-xs uppercase tracking-wide-2 h-8"
              >
                Edit
              </Button>
            </div>
            {interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {interests.map((it, i) => (
                  <span
                    key={i}
                    className="text-[10px] uppercase tracking-wide-2 bg-foreground/10 text-foreground px-2 py-0.5 rounded"
                  >
                    {it}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Personalization Toggle */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-xs uppercase tracking-wide-2 text-foreground font-medium">
                Algorithmic Feed Personalization
              </Label>
              <p className="text-xs text-muted-foreground font-light">
                Tailor your homepage and recommendations based on viewed items, likes, and searches.
              </p>
            </div>
            <Switch
              checked={personalization}
              onCheckedChange={handleTogglePersonalization}
              aria-label="Toggle personalization"
            />
          </div>

          {/* Optional Marketing Communications */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-xs uppercase tracking-wide-2 text-foreground font-medium">
                Optional Sourcing Offers & Updates
              </Label>
              <p className="text-xs text-muted-foreground font-light">
                Receive curated arrivals, private sourcing notifications, and special event announcements.
              </p>
            </div>
            <Switch
              checked={marketingConsent}
              onCheckedChange={handleToggleMarketing}
              disabled={saving}
              aria-label="Toggle marketing consent"
            />
          </div>

          {/* Email Notifications: Product Updates */}
          {user && (
            <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-2">
              <h4 className="font-medium text-foreground text-xs uppercase tracking-wide-2">Email Notifications</h4>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-xs uppercase tracking-wide-2 text-foreground font-medium">
                    Product Updates
                  </Label>
                  <p className="text-xs text-muted-foreground font-light">
                    Receive emails when new products are published or important product information is updated.
                  </p>
                </div>
                <Switch
                  checked={productEmails}
                  onCheckedChange={handleToggleProductEmails}
                  disabled={productEmailsLoading}
                  aria-label="Toggle product update emails"
                />
              </div>
              {productEmailsError && (
                <p role="alert" className="text-[11px] text-destructive">{productEmailsError}</p>
              )}
            </div>
          )}

          {/* Reset Personalization History */}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <div>
              <p className="text-xs text-foreground font-medium uppercase tracking-wide-2">Reset Browsing History</p>
              <p className="text-[11px] text-muted-foreground font-light">
                Erase all learned signals and return to the default feed layout.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetData}
              className="text-xs text-destructive hover:bg-destructive/10 h-8"
            >
              {resetDone ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-500" /> Cleared
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Legal links */}
        <div className="pt-4 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <Link to="/terms" onClick={onClose} className="hover:text-foreground hover:underline inline-flex items-center gap-0.5">
              Terms & Conditions <ExternalLink className="w-2.5 h-2.5" />
            </Link>
            <span>•</span>
            <Link to="/privacy" onClick={onClose} className="hover:text-foreground hover:underline inline-flex items-center gap-0.5">
              Privacy Policy <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
          <Button size="sm" onClick={onClose} className="bg-foreground text-background text-xs uppercase tracking-wide-2 h-8 px-4">
            Done
          </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
