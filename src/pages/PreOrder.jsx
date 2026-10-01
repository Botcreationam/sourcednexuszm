import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Camera, Send, CheckCircle2, Lock, ShieldCheck, MessageCircle, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { buildWhatsAppUrl, photoSourcingMessage, preorderNotificationMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import ScrollReveal from "@/components/site/ScrollReveal";
import { toast } from "@/components/ui/use-toast";
import { isSupabaseConfigured, validateImageFile, uploadSecurePreorderImage, uploadImageToSupabase, createSupabasePreorder } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";

const CATEGORIES = [
  "Electronics",
  "Watches",
  "Dresses",
  "Suits",
  "Heels",
  "Shoes",
  "Bags & Accessories",
  "Perfumes",
  "Other",
];
const SIZES = ["Standard / N/A", "XS", "S", "M", "L", "XL", "XXL", "36", "37", "38", "39", "40", "41", "42", "43", "44", "One Size"];

export default function PreOrder() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    customer_name: "", phone: "", whatsapp: "", category: "Dresses", size: "", color: "", message: "",
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Auto-prefill customer name and email from authenticated user
  useEffect(() => {
    if (user && !form.customer_name) {
      const name = user.user_metadata?.full_name || (user.email ? user.email.split('@')[0] : '');
      if (name) {
        setForm((prev) => ({ ...prev, customer_name: name }));
      }
    }
  }, [user]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await validateImageFile(file, { maxSizeMB: 5 });
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      toast({
        title: "Invalid file",
        description: err.message || "Please upload a valid JPEG, PNG, or WebP image under 5MB.",
        variant: "destructive",
      });
      e.target.value = "";
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please sign in or create an account to submit your order request.",
        variant: "destructive",
      });
      return;
    }
    if (!form.customer_name) return;
    setSubmitting(true);
    try {
      let requested_image = "";
      if (imageFile) {
        if (isSupabaseConfigured) {
          requested_image = await uploadSecurePreorderImage(imageFile, user?.id);
        } else {
          const res = await base44.integrations.Core.UploadPrivateFile({ file: imageFile });
          requested_image = res.file_uri;
        }
      }
      if (isSupabaseConfigured) {
        await createSupabasePreorder({ ...form, requested_image }, user);
      } else {
        await base44.entities.Preorder.create({ ...form, requested_image, status: "new" });
      }
      setDone(true);
    } catch (err) {
      console.error("Failed to submit preorder:", err);
      toast({
        title: "Submission failed",
        description: err.message || "Could not submit your request. Please try again or contact us directly on WhatsApp.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const waUrl = buildWhatsAppUrl(preorderNotificationMessage(form));
  const waDirectUrl = buildWhatsAppUrl(photoSourcingMessage());

  // Best-effort WhatsApp open upon successful submission
  useEffect(() => {
    if (!done) return;
    try { window.open(waUrl, "_blank"); } catch {}
  }, [done]);

  if (done) {
    return (
      <div className="pt-32 pb-24">
        <div className="mx-auto max-w-lg px-5 text-center">
          <CheckCircle2 className="w-14 h-14 mx-auto text-[#1f7a4c]" strokeWidth={1} />
          <h1 className="font-display text-4xl mt-6">Request Received</h1>
          <p className="mt-4 text-sm font-light text-muted-foreground">
            Thank you, {form.customer_name}. We have saved your sourcing request securely. Tap below to send your request straight to our WhatsApp so our concierge team can respond immediately.
          </p>
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="mt-8 inline-flex items-center gap-2 bg-[#1f7a4c] text-white px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-[#165c39] transition-colors">
            <Send className="w-4 h-4" /> Send My Request to WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20">
      <section className="pt-6 pb-2">
        <div className="mx-auto max-w-2xl px-4">
          <ScrollReveal>
            <img
              src="https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/ff7228f03_cd0cf427-6a7a-41ef-b652-2d47772ddf5b.jpeg"
              alt="Sourced Nexus — Pre-Order Now: Curated Luxury, Sourced For You"
              className="w-full h-auto shadow-lg"
            />
          </ScrollReveal>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-2xl px-5 md:px-8">
          {/* Auth Gate for ordering & personal information */}
          {!user ? (
            <div className="border border-border p-8 md:p-10 bg-card/60 backdrop-blur-sm text-center shadow-sm">
              <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5 text-foreground">
                <Lock className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <h2 className="font-display text-2xl md:text-3xl">Sign In Required to Pre-Order</h2>
              <p className="mt-3 text-sm font-light text-muted-foreground max-w-md mx-auto leading-relaxed">
                To protect your personal information, manage orders securely, and receive status updates, please sign in or create an account.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/login?returnTo=/pre-order"
                  className="inline-flex items-center justify-center gap-2 bg-foreground text-background px-6 py-3.5 text-[11px] tracking-wide-2 uppercase hover:opacity-90 transition-opacity font-medium"
                >
                  <ShieldCheck className="w-4 h-4" /> Sign In to Submit Online
                </Link>
                <a
                  href={waDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-[#1f7a4c] text-white px-6 py-3.5 text-[11px] tracking-wide-2 uppercase hover:bg-[#165c39] transition-colors"
                >
                  <MessageCircle className="w-4 h-4" /> Order Directly via WhatsApp
                </a>
              </div>

              <div className="mt-6 pt-6 border-t border-border flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span>No account needed for WhatsApp orders</span>
                <span>•</span>
                <Link to="/register?returnTo=/pre-order" className="underline hover:text-foreground">
                  Create new account
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-6">
              <div className="flex items-center justify-between p-3 border border-border/80 bg-muted/30 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-[#1f7a4c]" />
                  <span>Authenticated as <strong className="text-foreground font-medium">{user.email}</strong></span>
                </div>
                <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Secure Session</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Name *">
                  <input required value={form.customer_name} onChange={(e) => update("customer_name", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Phone Number">
                  <input value={form.phone} onChange={(e) => update("phone", e.target.value)} className={inputCls} />
                </Field>
                <Field label="WhatsApp Number">
                  <input value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Category">
                  <select value={form.category} onChange={(e) => update("category", e.target.value)} className={inputCls}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Size">
                  <select value={form.size} onChange={(e) => update("size", e.target.value)} className={inputCls}>
                    <option value="">Select size</option>
                    {SIZES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Color / Preference">
                  <input value={form.color} onChange={(e) => update("color", e.target.value)} placeholder="e.g. Black, size 38" className={inputCls} />
                </Field>
              </div>

              <Field label="Upload Outfit / Image (Max 5MB • JPG, PNG, WebP)">
                <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border aspect-[16/9] cursor-pointer hover:border-foreground transition-colors overflow-hidden">
                  {imagePreview ? (
                    <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="w-7 h-7 text-muted-foreground" strokeWidth={1} />
                      <span className="text-[11px] tracking-wide-2 uppercase text-muted-foreground">Tap to upload a verified photo</span>
                      <span className="text-[10px] text-muted-foreground font-light">Stored securely in private cloud storage</span>
                    </>
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
                </label>
              </Field>

              <Field label="Additional Message">
                <textarea value={form.message} onChange={(e) => update("message", e.target.value)} rows={4} className={inputCls} placeholder="Tell us anything else about the item you want sourced…" />
              </Field>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-foreground text-background py-4 text-[11px] tracking-wide-2 uppercase hover:opacity-85 transition-opacity disabled:opacity-50"
              >
                {submitting ? "Submitting securely…" : <><Send className="w-4 h-4" /> Request This Item</>}
              </button>
              <p className="text-center text-[11px] tracking-wide-2 uppercase text-muted-foreground">
                Or WhatsApp / Call: <a href={buildWhatsAppUrl(photoSourcingMessage())} target="_blank" rel="noopener noreferrer" className="border-b border-muted-foreground">{WHATSAPP_DISPLAY}</a>
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

const inputCls = "w-full bg-transparent border border-border px-4 py-3 text-sm focus:border-foreground outline-none transition-colors";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] tracking-wide-2 uppercase text-muted-foreground mb-2">{label}</span>
      {children}
    </label>
  );
}