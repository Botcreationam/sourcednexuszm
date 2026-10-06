import { useCallback, useEffect, useState } from "react";
import { Megaphone, Send, Mail, Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SUBJECT_MAX = 150;
const MESSAGE_MAX = 5000;
const BUTTON_LABEL_MAX = 40;

const STATUS_LABELS = {
  pending: "Queued",
  processing: "Sending",
  completed: "Completed",
  failed: "Some failed",
  skipped: "No recipients",
};

const inputClass =
  "w-full bg-transparent border border-border px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors";
const labelClass = "block text-xs tracking-wide-2 uppercase text-muted-foreground mb-1.5";

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function callWorker(body) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Your session expired. Please sign in again.");
  const res = await fetch("/api/announcements/process", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export default function AdminAnnouncements() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [recipientCount, setRecipientCount] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  const loadAll = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoadingHistory(false); return; }
    setLoadingHistory(true);
    setHistoryError(null);
    const [countRes, listRes] = await Promise.all([
      supabase.rpc("count_eligible_notification_recipients"),
      supabase.rpc("list_announcements"),
    ]);
    setRecipientCount(!countRes.error && typeof countRes.data === "number" ? countRes.data : null);
    if (listRes.error) {
      setHistory([]);
      setHistoryError(
        /list_announcements|does not exist|schema cache/i.test(listRes.error.message || "")
          ? "The announcements database update has not been applied yet. Run the announcements SQL in Supabase first."
          : listRes.error.message || "Could not load announcement history.",
      );
    } else {
      setHistory(Array.isArray(listRes.data) ? listRes.data : []);
    }
    setLoadingHistory(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Keep the history fresh while something is still sending.
  useEffect(() => {
    const active = history.some((h) => h.status === "pending" || h.status === "processing");
    if (!active) return undefined;
    const t = setInterval(loadAll, 8000);
    return () => clearInterval(t);
  }, [history, loadAll]);

  const trimmedSubject = subject.trim();
  const trimmedMessage = message.trim();
  const trimmedUrl = buttonUrl.trim();
  const urlInvalid = trimmedUrl !== "" && !isHttpsUrl(trimmedUrl);
  const valid = trimmedSubject.length > 0 && trimmedMessage.length > 0 && !urlInvalid;

  const sendTest = async () => {
    if (!valid) return;
    setTesting(true);
    try {
      await callWorker({
        action: "test",
        subject: trimmedSubject,
        message: trimmedMessage,
        buttonLabel: buttonLabel.trim(),
        buttonUrl: trimmedUrl,
      });
      toast({ title: "Test email sent", description: "Check your own inbox (and spam folder). Nothing was sent to customers." });
    } catch (err) {
      toast({ title: "Could not send the test email", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const sendToCustomers = async () => {
    setConfirmOpen(false);
    if (!valid) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("create_announcement", {
        p_subject: trimmedSubject,
        p_message: trimmedMessage,
        p_button_label: buttonLabel.trim() || null,
        p_button_url: trimmedUrl || null,
      });
      if (error) {
        const missing = /create_announcement|does not exist|schema cache/i.test(error.message || "");
        throw new Error(
          missing
            ? "The announcements database update has not been applied yet. Run the announcements SQL in Supabase first."
            : error.message,
        );
      }
      // The message is now safely saved. Kick the sender; the daily sweep and
      // retries cover anything it cannot finish right now.
      let result = null;
      try { result = await callWorker({}); } catch { result = null; }

      setSubject("");
      setMessage("");
      setButtonLabel("");
      setButtonUrl("");
      toast({
        title: "Announcement queued",
        description: result?.emailConfigured === false
          ? "Saved, but the email provider is not configured yet, so nothing has been sent."
          : "Emails are being sent. Queued does not mean delivered; the history below shows real sent and failed counts.",
      });
      await loadAll();
    } catch (err) {
      toast({ title: "Announcement was not sent", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const retryNow = async () => {
    try {
      await callWorker({});
      toast({ title: "Sending resumed" });
    } catch (err) {
      toast({ title: "Could not resume sending", description: err.message, variant: "destructive" });
    }
    loadAll();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl flex items-center gap-3">
          <Megaphone className="w-6 h-6" /> Announcements
        </h1>
        <p className="text-xs tracking-wide-2 uppercase text-muted-foreground mt-1">
          Email a message to your customers
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Composer */}
        <div className="lg:col-span-3 border border-border p-5 md:p-6 space-y-5">
          <div>
            <label className={labelClass} htmlFor="ann-subject">Subject</label>
            <input
              id="ann-subject"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. New deliveries arriving this Friday"
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-muted-foreground text-right">{subject.length}/{SUBJECT_MAX}</p>
          </div>

          <div>
            <label className={labelClass} htmlFor="ann-message">Message</label>
            <textarea
              id="ann-message"
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              rows={9}
              placeholder="Write your message. Leave a blank line to start a new paragraph."
              className={`${inputClass} resize-y min-h-[180px]`}
            />
            <p className="mt-1 text-[11px] text-muted-foreground text-right">{message.length}/{MESSAGE_MAX}</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="ann-btn-label">Button text (optional)</label>
              <input
                id="ann-btn-label"
                value={buttonLabel}
                maxLength={BUTTON_LABEL_MAX}
                onChange={(e) => setButtonLabel(e.target.value)}
                placeholder="Shop Now"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="ann-btn-url">Button link (optional)</label>
              <input
                id="ann-btn-url"
                value={buttonUrl}
                onChange={(e) => setButtonUrl(e.target.value)}
                placeholder="https://sourcednexus.online/catalog"
                inputMode="url"
                className={`${inputClass} ${urlInvalid ? "border-destructive" : ""}`}
              />
              {urlInvalid && <p className="mt-1 text-[11px] text-destructive">Link must start with https://</p>}
            </div>
          </div>

          <div className="border border-border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
            <Mail className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Sent only to customers who have email notifications turned on
              {recipientCount !== null && (
                <> (<strong className="text-foreground">{recipientCount}</strong> {recipientCount === 1 ? "customer" : "customers"} right now)</>
              )}
              . Customers who opted out are never emailed. The email greets each person by first name.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={sendTest}
              disabled={!valid || testing || sending}
              className="inline-flex items-center gap-2 border border-border px-5 py-3 text-xs tracking-wide-2 uppercase hover:border-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send test to me
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!valid || sending || testing}
              className="inline-flex items-center gap-2 bg-foreground text-background px-6 py-3 text-xs tracking-wide-2 uppercase hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send to customers
            </button>
          </div>
        </div>

        {/* History */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs tracking-wide-2 uppercase text-muted-foreground">Recent announcements</h2>
            <button
              type="button"
              onClick={loadAll}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Refresh history"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {historyError ? (
            <div className="border border-destructive/40 p-4 text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p>{historyError}</p>
            </div>
          ) : loadingHistory && history.length === 0 ? (
            <div className="border border-border p-6 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : history.length === 0 ? (
            <div className="border border-border p-6 text-sm text-muted-foreground">
              Nothing sent yet. Your announcements will appear here with real sent and failed counts.
            </div>
          ) : (
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-sm break-words min-w-0">{h.subject}</p>
                    <span className="text-[10px] tracking-wide-2 uppercase border border-border px-2 py-0.5 shrink-0">
                      {STATUS_LABELS[h.status] || h.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2 break-words">{h.message}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {h.sent} sent</span>
                    <span>{h.pending} waiting</span>
                    <span className={h.failed > 0 ? "text-destructive" : "text-muted-foreground"}>{h.failed} failed</span>
                    <span className="text-muted-foreground">of {h.recipients_queued}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{new Date(h.created_at).toLocaleString()}</p>
                  {h.pending > 0 && (
                    <button
                      type="button"
                      onClick={retryNow}
                      className="mt-2 text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
                    >
                      Send waiting emails now
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              {recipientCount !== null
                ? `This will email ${recipientCount} ${recipientCount === 1 ? "customer" : "customers"}.`
                : "This will email every customer who has notifications turned on."}{" "}
              It cannot be unsent. Tip: use "Send test to me" first to check how it looks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="border border-border p-3 text-sm">
            <p className="font-medium break-words">{trimmedSubject}</p>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-3 break-words">{trimmedMessage}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={sendToCustomers}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
