import React, { useState } from "react";
import { LogOut, X, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export default function SignOutModal({ open, onClose }) {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!open) return null;

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logout(true);
      onClose();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl p-6 md:p-8 animate-in zoom-in-95 duration-200 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loggingOut}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon Emblem */}
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-5 border border-destructive/20 shadow-sm">
          <LogOut className="w-7 h-7 ml-0.5" strokeWidth={1.75} />
        </div>

        {/* Header */}
        <h3 className="font-display text-2xl md:text-3xl text-foreground">
          Sign Out of Sourced Nexus?
        </h3>

        <p className="mt-2 text-sm text-muted-foreground font-light leading-relaxed">
          Are you sure you want to end your session
          {user?.email ? (
            <>
              {" "}for <strong className="text-foreground font-medium">{user.email}</strong>
            </>
          ) : null}?
        </p>

        <div className="my-5 p-3.5 rounded-xl bg-card border border-border/80 text-xs text-muted-foreground/90 font-light text-left space-y-1.5">
          <p className="flex items-center gap-2 text-foreground font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1f7a4c]" />
            Your data remains secure
          </p>
          <p className="pl-3.5 leading-relaxed">
            Your personalized shopping feed, saved interests, and inquiry history will be safely preserved for your next visit.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loggingOut}
            className="flex-1 py-3 text-xs tracking-wide-2 uppercase border border-border hover:border-foreground transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmLogout}
            disabled={loggingOut}
            className="flex-1 py-3 text-xs tracking-wide-2 uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors font-medium flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            {loggingOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing Out...
              </>
            ) : (
              "Yes, Sign Out"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
