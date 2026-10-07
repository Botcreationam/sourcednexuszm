import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, X, Upload, Loader2, Package, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { isSupabaseConfigured, supabase, uploadImageToSupabase } from "@/lib/supabase";
import { shapeBundle, UNAVAILABLE_TEXT } from "@/lib/bundles";
import { formatMoney } from "@/lib/cartPricing";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const emptyForm = { name: "", description: "", bundle_price: "", availability_note: "", is_active: true, display_order: 0 };

export default function AdminBundles() {
  const { toast } = useToast();
  const [bundles, setBundles] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setupMissing, setSetupMissing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]); // [{ product_id, quantity, grade_name }]
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [pick, setPick] = useState("");

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const load = async () => {
    setLoading(true);
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const [bRes, iRes, pRes] = await Promise.all([
      supabase.from("bundles").select("*").order("display_order", { ascending: true }).order("created_at", { ascending: false }),
      supabase.from("bundle_items").select("*"),
      supabase.from("products").select("*").order("name", { ascending: true }),
    ]);
    if (bRes.error) { setSetupMissing(true); setLoading(false); return; }
    setSetupMissing(false);
    const prods = pRes.data || [];
    setProducts(prods);
    const map = new Map(prods.map((p) => [p.id, p]));
    setBundles((bRes.data || []).map((b) => shapeBundle(b, iRes.data || [], map)));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setItems([]); setImages([]); setPick(""); setModalOpen(true); };
  const openEdit = (b) => {
    setEditing(b);
    setForm({ name: b.name, description: b.description, bundle_price: String(b.bundlePrice), availability_note: b.availabilityNote, is_active: b.isActive, display_order: 0 });
    setItems(b.components.map((c) => ({ product_id: c.productId, quantity: c.quantity, grade_name: c.gradeName || "" })));
    setImages(b.images);
    setPick("");
    setModalOpen(true);
  };

  const preview = useMemo(() => {
    const fake = {
      id: "preview", name: form.name, bundle_price: Number(form.bundle_price) || 0, is_active: form.is_active, images,
    };
    const rows = items.map((i, idx) => ({ ...i, bundle_id: "preview", sort_order: idx, grade_name: i.grade_name || null }));
    return shapeBundle(fake, rows, productsById);
  }, [form, items, images, productsById]);

  const addItem = () => {
    if (!pick || items.some((i) => i.product_id === pick && !i.grade_name)) return;
    setItems((p) => [...p, { product_id: pick, quantity: 1, grade_name: "" }]);
    setPick("");
  };

  const onImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadImageToSupabase(f, "product-images")));
      setImages((p) => [...p, ...urls]);
    } catch (err) {
      toast({ title: "Image upload failed", description: err?.message || "Please try again.", variant: "destructive" });
    } finally { setUploading(false); e.target.value = ""; }
  };

  const save = async (e) => {
    e.preventDefault();
    const price = Number(form.bundle_price);
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    if (!(price > 0)) return toast({ title: "Enter a bundle price above 0", variant: "destructive" });
    if (items.length === 0) return toast({ title: "Add at least one product", variant: "destructive" });
    if (preview.separateTotal > 0 && price >= preview.separateTotal) {
      toast({ title: "Bundle price is not a saving", description: `Items cost ${formatMoney(preview.separateTotal)} separately. You can still save, but customers will see no discount.` });
    }
    setSaving(true);
    try {
      const row = {
        name: form.name.trim(), description: form.description.trim() || null, bundle_price: price,
        availability_note: form.availability_note.trim() || null, is_active: form.is_active, images,
      };
      let id = editing?.id;
      if (id) {
        const { error } = await supabase.from("bundles").update(row).eq("id", id);
        if (error) throw error;
        const { error: dErr } = await supabase.from("bundle_items").delete().eq("bundle_id", id);
        if (dErr) throw dErr;
      } else {
        const { data, error } = await supabase.from("bundles").insert(row).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      const { error: iErr } = await supabase.from("bundle_items").insert(
        items.map((i, idx) => ({ bundle_id: id, product_id: i.product_id, quantity: Math.max(1, Number(i.quantity) || 1), grade_name: i.grade_name || null, sort_order: idx })),
      );
      if (iErr) throw iErr;
      toast({ title: editing ? "Bundle updated" : "Bundle created" });
      setModalOpen(false);
      load();
    } catch (err) {
      toast({ title: "Could not save bundle", description: err?.message || "Please try again.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const toggleActive = async (b) => {
    const { error } = await supabase.from("bundles").update({ is_active: !b.isActive }).eq("id", b.id);
    if (error) return toast({ title: "Could not update", description: error.message, variant: "destructive" });
    load();
  };

  const confirmDelete = async () => {
    // Deleting a bundle removes ONLY the bundle and its item links. Products are untouched,
    // and past orders keep their own frozen copy of what was bought.
    const { error } = await supabase.from("bundles").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null);
    if (error) return toast({ title: "Could not delete", description: error.message, variant: "destructive" });
    toast({ title: "Bundle deleted", description: "The products were not changed." });
    load();
  };

  if (setupMissing) {
    return (
      <div className="border border-border p-6 max-w-xl">
        <p className="font-display text-xl flex items-center gap-2"><AlertCircle className="w-5 h-5 text-[#C5A059]" /> Bundles need a database update</p>
        <p className="text-sm text-muted-foreground mt-2">
          Run the migration <code className="text-xs">20261008000000_bundles_and_size_verification.sql</code> in the Supabase SQL editor, then refresh this page.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-2xl flex items-center gap-2"><Package className="w-5 h-5" /> Bundles</h1>
          <p className="text-sm text-muted-foreground mt-1">Group existing products into one bundle price. Products are never copied or changed.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] tracking-wide-2 uppercase bg-[#C5A059] text-black hover:bg-[#b8914f]">
          <Plus className="w-4 h-4" /> New bundle
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : bundles.length === 0 ? (
        <div className="border border-border p-10 text-center text-sm text-muted-foreground">No bundles yet. Create your first one.</div>
      ) : (
        <div className="grid gap-4">
          {bundles.map((b) => (
            <div key={b.id} className="border border-border p-4 flex flex-col sm:flex-row gap-4" data-testid="admin-bundle-row">
              <div className="w-full sm:w-28 h-28 bg-muted shrink-0 overflow-hidden">{b.image && <img src={b.image} alt="" className="w-full h-full object-cover" loading="lazy" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{b.name}</h2>
                  <span className={`text-[10px] tracking-wide-2 uppercase px-2 py-0.5 border ${b.isActive ? "border-[#C5A059] text-[#C5A059]" : "border-border text-muted-foreground"}`}>{b.isActive ? "Active" : "Inactive"}</span>
                  {b.isActive && !b.purchasable && <span className="text-[10px] tracking-wide-2 uppercase px-2 py-0.5 bg-destructive/10 text-destructive">Not purchasable now</span>}
                </div>
                <p className="text-sm mt-1">{formatMoney(b.bundlePrice)} {b.savings > 0 && <span className="text-muted-foreground">· saves {formatMoney(b.savings)} vs {formatMoney(b.separateTotal)}</span>}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.components.map((c) => `${c.quantity}× ${c.name}`).join(", ")}</p>
                {!b.purchasable && b.isActive && b.blockedBy && <p className="text-xs text-destructive mt-1">{b.blockedBy.name} {UNAVAILABLE_TEXT[b.blockedBy.unavailableReason] || "is unavailable"}.</p>}
              </div>
              <div className="flex sm:flex-col gap-2 shrink-0">
                <button onClick={() => openEdit(b)} className="p-2 border border-border hover:border-foreground" aria-label="Edit bundle"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => toggleActive(b)} className="p-2 border border-border hover:border-foreground" aria-label={b.isActive ? "Deactivate bundle" : "Activate bundle"}>{b.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                <button onClick={() => setDeleteTarget(b)} className="p-2 border border-border hover:border-destructive hover:text-destructive" aria-label="Delete bundle"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6">
          <div className="fixed inset-0 bg-black/70" onClick={() => setModalOpen(false)} />
          <form onSubmit={save} className="relative w-full max-w-2xl bg-background border border-border p-5 sm:p-6 my-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">{editing ? "Edit bundle" : "New bundle"}</h2>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Close"><X className="w-5 h-5" /></button>
            </div>

            <label className="block"><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Name *</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full bg-transparent border border-border px-3 py-2 text-sm" placeholder="Gentleman Starter Bundle" /></label>
            <label className="block"><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Description</span>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full bg-transparent border border-border px-3 py-2 text-sm" /></label>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block"><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Bundle price (K) *</span>
                <input type="number" min="1" step="0.01" value={form.bundle_price} onChange={(e) => setForm({ ...form, bundle_price: e.target.value })} className="mt-1 w-full bg-transparent border border-border px-3 py-2 text-sm" /></label>
              <label className="block"><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Availability note</span>
                <input value={form.availability_note} onChange={(e) => setForm({ ...form, availability_note: e.target.value })} className="mt-1 w-full bg-transparent border border-border px-3 py-2 text-sm" placeholder="Optional" /></label>
            </div>

            <div>
              <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Products in this bundle *</span>
              <div className="mt-1 flex gap-2">
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 min-w-0 bg-background border border-border px-3 py-2 text-sm">
                  <option value="">Choose an existing product…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.price || "no price"})</option>)}
                </select>
                <button type="button" onClick={addItem} disabled={!pick} className="px-4 border border-border hover:border-foreground disabled:opacity-40 text-sm">Add</button>
              </div>
              <ul className="mt-3 divide-y divide-border border border-border">
                {items.length === 0 && <li className="p-3 text-xs text-muted-foreground">No products added yet.</li>}
                {items.map((it, idx) => {
                  const p = productsById.get(it.product_id);
                  const c = preview.components[idx];
                  return (
                    <li key={it.product_id + idx} className="p-3 flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{p?.name || "Missing product"}</p>
                        {c && !c.available && <p className="text-xs text-destructive">{UNAVAILABLE_TEXT[c.unavailableReason]}</p>}
                        {c?.requiresSize && <p className="text-[11px] text-muted-foreground">Customer will choose a size ({c.sizingStandard})</p>}
                      </div>
                      {p?.grades?.length > 0 && (
                        <select value={it.grade_name} onChange={(e) => setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, grade_name: e.target.value } : x)))} className="bg-background border border-border px-2 py-1.5 text-xs">
                          <option value="">Base price</option>
                          {p.grades.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
                        </select>
                      )}
                      <input type="number" min="1" max="20" value={it.quantity} onChange={(e) => setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} className="w-16 bg-transparent border border-border px-2 py-1.5 text-sm" aria-label="Quantity" />
                      <button type="button" onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))} aria-label="Remove from bundle" className="p-1.5 hover:text-destructive"><X className="w-4 h-4" /></button>
                    </li>
                  );
                })}
              </ul>
              {items.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground" data-testid="bundle-preview">
                  Bought separately: <span className="text-foreground">{formatMoney(preview.separateTotal)}</span>
                  {Number(form.bundle_price) > 0 && (preview.savings > 0
                    ? <> · customers save <span className="text-foreground">{formatMoney(preview.savings)} ({preview.savingsPercent}%)</span></>
                    : <> · <span className="text-destructive">no saving at this price</span></>)}
                </p>
              )}
            </div>

            <div>
              <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Bundle images</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {images.map((src, i) => (
                  <div key={src + i} className="relative w-20 h-20 border border-border">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setImages((a) => a.filter((_, x) => x !== i))} className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-0.5" aria-label="Remove image"><X className="w-3 h-3" /></button>
                  </div>
                ))}
                <label className="w-20 h-20 border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-foreground">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onImages} />
                </label>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="accent-[#C5A059]" /> Active (visible and purchasable)</label>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2.5 text-[11px] tracking-wide-2 uppercase border border-border">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 text-[11px] tracking-wide-2 uppercase bg-[#C5A059] text-black disabled:opacity-50 inline-flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? "Save changes" : "Create bundle"}
              </button>
            </div>
          </form>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bundle?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be removed from the shop. The products inside it are not changed, and past orders keep their records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete bundle</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
