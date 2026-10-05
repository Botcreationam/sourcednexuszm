import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import PreferencesModal from "@/components/site/PreferencesModal";
import { Loader2 } from "lucide-react";

// Landing target for "Manage Notification Preferences" links in emails.
// Signed-out visitors are sent to login and returned here afterwards. The
// preference itself is read/written only for the signed-in user's own row.
export default function AccountNotifications() {
  const { user, isLoadingAuth } = useAuth();
  const [open, setOpen] = useState(true);

  useEffect(() => { setOpen(true); }, []);

  if (isLoadingAuth) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (!user) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent("/account/notifications")}`} replace />;
  }
  return (
    <div className="min-h-[60vh] pt-28 px-6 text-center">
      <h1 className="font-display text-2xl mb-2">Notification Preferences</h1>
      <p className="text-sm text-muted-foreground mb-6">Choose which emails you receive from Sourced Nexus.</p>
      <button onClick={() => setOpen(true)} className="bg-foreground text-background px-6 py-3 text-[11px] tracking-wide-2 uppercase hover:opacity-85">
        Open Preferences
      </button>
      <PreferencesModal open={open} onClose={() => setOpen(false)} onOpenInterests={() => setOpen(false)} />
    </div>
  );
}
