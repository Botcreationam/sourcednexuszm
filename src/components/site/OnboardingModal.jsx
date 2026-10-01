import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  ONBOARDING_CATEGORIES,
  getStoredInterests,
  saveUserInterests,
  resetPersonalization,
} from "@/lib/recommendations";

export default function OnboardingModal({ open, onClose, isEditMode = false }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const current = user?.user_metadata?.interests || getStoredInterests();
      setSelected(Array.isArray(current) ? current : []);
    }
  }, [open, user]);

  const toggleCategory = (label) => {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveUserInterests(selected, user, supabase);
      onClose();
    } catch (err) {
      console.error("Failed to save interests:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      await saveUserInterests([], user, supabase);
      onClose();
    } catch {
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await resetPersonalization(user, supabase);
      setSelected([]);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border p-6 md:p-8 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center space-y-2">
          <div className="text-primary text-xs uppercase tracking-wide-2 font-medium">
            Personalized For You
          </div>
          <DialogTitle className="font-display text-2xl md:text-3xl tracking-tight">
            {isEditMode ? "Update Your Shopping Interests" : "Welcome to Sourced Nexus"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm font-light max-w-md mx-auto">
            Select the categories you're interested in to calibrate your personalized feed. We'll curate recommendations tailored to your style.
          </DialogDescription>
        </DialogHeader>

        <div className="my-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wide-2 mb-3">
            <span>Choose categories ({selected.length} selected)</span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-primary hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ONBOARDING_CATEGORIES.map((cat) => {
              const isSelected = selected.includes(cat.label);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.label)}
                  className={`flex items-center justify-between px-4 py-3 border text-left text-xs uppercase tracking-wide-2 transition-all duration-200 ${
                    isSelected
                      ? "border-foreground bg-foreground text-background font-medium shadow-sm"
                      : "border-border bg-card/50 text-foreground/80 hover:border-foreground/50 hover:bg-muted/40"
                  }`}
                >
                  <span className="truncate pr-2">{cat.label}</span>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center border transition-colors ${
                      isSelected
                        ? "border-background bg-background text-foreground"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {isEditMode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={saving}
                className="text-destructive hover:bg-destructive/10 text-xs w-full sm:w-auto"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset Personalization
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={saving}
                className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide-2 w-full sm:w-auto"
              >
                Skip for now
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto px-6 h-11 text-xs uppercase tracking-wide-2 font-medium bg-foreground text-background hover:bg-foreground/85"
            >
              {saving ? "Saving..." : selected.length > 0 ? "Save Preferences" : "Continue"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
