import { useState, useEffect } from "react";
import { Camera, Send, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { buildWhatsAppUrl, photoSourcingMessage, preorderNotificationMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import ScrollReveal from "@/components/site/ScrollReveal";
import { toast } from "@/components/ui/use-toast";

const CATEGORIES = ["Dresses", "Suits", "Heels", "Shoes", "Other"];
const SIZES = ["XS", "S", "M", "L", "XL", "36", "37", "38", "39", "40", "41", "42", "43", "One Size"];

export default function PreOrder() {
  const [form, setForm] = useState({
    customer_name: "", phone: "", whatsapp: "", category: "Dresses", size: "", color: "", message: "",
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.customer_name) return;
    setSubmitting(true);
    try {
      let requested_image = "";
      if (imageFile) {
        const res = await base44.integrations.Core.UploadPrivateFile({ file: imageFile });
        requested_image = res.file_uri;
      }
      await base44.entities.Preorder.create({ ...form, requested_image, status: "new" });
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

  // Best-effort: pop open the pre-filled WhatsApp chat to the store so the admin
  // is notified instantly. (Browsers may block non-gesture popups; the button below
  // is the reliable path.)
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
            Thank you, {form.customer_name}. Tap below to send your request straight to our WhatsApp so we can respond immediately.
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
          <form onSubmit={submit} className="space-y-6">
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

            <Field label="Upload Outfit / Image">
              <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border aspect-[16/9] cursor-pointer hover:border-foreground transition-colors overflow-hidden">
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <Camera className="w-7 h-7 text-muted-foreground" strokeWidth={1} />
                    <span className="text-[11px] tracking-wide-2 uppercase text-muted-foreground">Tap to upload a photo</span>
                  </>
                )}
                <input type="file" accept="image/*" onChange={onFile} className="hidden" />
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
              {submitting ? "Submitting…" : <><Send className="w-4 h-4" /> Request This Item</>}
            </button>
            <p className="text-center text-[11px] tracking-wide-2 uppercase text-muted-foreground">
              Or WhatsApp / Call: <a href={buildWhatsAppUrl(photoSourcingMessage())} target="_blank" rel="noopener noreferrer" className="border-b border-muted-foreground">{WHATSAPP_DISPLAY}</a>
            </p>
          </form>
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