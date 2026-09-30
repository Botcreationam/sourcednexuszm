import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Eye, EyeOff, X, Upload, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUSES = [
  { value: "available", label: "Available" },
  { value: "preorder", label: "Pre-Order" },
  { value: "soldout", label: "Sold Out" },
  { value: "hidden", label: "Hidden" },
];

const emptyForm = {
  name: "", price: "", category: "Dresses", description: "",
  sizes: "", colors: "", status: "available",
  is_new_arrival: false, is_popular: false, delivery_info: "7–14 working days",
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.Product.list("-created_date", 200),
      base44.entities.Category.list("-created_date", 50),
    ]).then(([p, c]) => { setProducts(p); setCategories(c); }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setImages([]);
    setModalOpen(true);
  };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name || "", price: p.price || "", category: p.category || "Dresses",
      description: p.description || "", sizes: (p.sizes || []).join(", "), colors: (p.colors || []).join(", "),
      status: p.status || "available", is_new_arrival: !!p.is_new_arrival, is_popular: !!p.is_popular,
      delivery_info: p.delivery_info || "7–14 working days",
    });
    setImages(p.images || []);
    setModalOpen(true);
  };

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((f) => base44.integrations.Core.UploadPublicFile({ file: f })));
      setImages((prev) => [...prev, ...uploaded.map((r) => r.file_url)]);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeImage = (i) => setImages((prev) => prev.filter((_, idx) => idx !== i));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    const payload = {
      ...form,
      sizes: form.sizes.split(",").map((s) => s.trim()).filter(Boolean),
      colors: form.colors.split(",").map((s) => s.trim()).filter(Boolean),
      images,
    };
    try {
      if (editing) await base44.entities.Product.update(editing.id, payload);
      else await base44.entities.Product.create(payload);
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setImages([]);
      load();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.Product.delete(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  const toggleHide = async (p) => {
    await base44.entities.Product.update(p.id, { status: p.status === "hidden" ? "available" : "hidden" });
    load();
  };

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = products.length > 0 && selected.size === products.length;
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  const confirmBulkDelete = async () => {
    await base44.entities.Product.deleteMany({ id: { $in: Array.from(selected) } });
    setSelected(new Set());
    setBulkDeleteOpen(false);
    load();
  };

  const catOptions = categories.length ? categories.map((c) => c.name) : ["Dresses", "Suits", "Heels", "Shoes"];

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl md:text-5xl">Products</h1>
          <p className="text-sm text-muted-foreground mt-2">{products.length} items in your catalog</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-3 text-[11px] tracking-wide-2 uppercase hover:opacity-85">
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {selected.size > 0 && (
        <div className="mt-6 flex items-center justify-between gap-4 border border-border bg-muted/40 px-4 py-3 flex-wrap">
          <span className="text-sm">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setBulkDeleteOpen(true)} className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 text-[11px] tracking-wide-2 uppercase hover:opacity-90">
              <Trash2 className="w-4 h-4" /> Delete Selected
            </button>
            <button onClick={() => setSelected(new Set())} className="border border-border px-4 py-2 text-[11px] tracking-wide-2 uppercase hover:bg-muted">Clear</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="mt-10 text-center text-muted-foreground text-sm tracking-wide-2 uppercase">Loading products…</p>
      ) : products.length === 0 ? (
        <div className="mt-10 border border-border p-12 text-center">
          <p className="font-display text-2xl">No products yet</p>
          <p className="text-sm text-muted-foreground mt-2">Click "Add Product" to create your first catalog item.</p>
        </div>
      ) : (
        <div className="mt-8 border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/50 text-[10px] tracking-wide-2 uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-normal w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-foreground" />
                </th>
                <th className="text-left px-4 py-3 font-normal">Product</th>
                <th className="text-left px-4 py-3 font-normal">Category</th>
                <th className="text-left px-4 py-3 font-normal">Price</th>
                <th className="text-left px-4 py-3 font-normal">Status</th>
                <th className="text-right px-4 py-3 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="accent-foreground" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-12 bg-muted overflow-hidden flex-shrink-0">
                        {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <span className="truncate max-w-[180px]">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category}</td>
                  <td className="px-4 py-3">{p.price || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] tracking-wide-2 uppercase px-2 py-1 ${
                      p.status === "available" ? "bg-foreground text-background" :
                      p.status === "hidden" ? "bg-muted text-muted-foreground" : "border border-border"
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => toggleHide(p)} title={p.status === "hidden" ? "Show" : "Hide"} className="p-2 hover:bg-muted">
                        {p.status === "hidden" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEdit(p)} title="Edit" className="p-2 hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget(p)} title="Delete" className="p-2 hover:bg-muted"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-start md:items-center justify-center p-4 overflow-y-auto" onClick={() => setModalOpen(false)}>
          <div className="bg-background border border-border w-full max-w-2xl my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display text-2xl">{editing ? "Edit Product" : "Add Product"}</h2>
              <button onClick={() => setModalOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid sm:grid-cols-2 gap-4">
                <In label="Name *"><input required value={form.name} onChange={(e) => update("name", e.target.value)} className={inp} /></In>
                <In label="Price (optional)"><input value={form.price} onChange={(e) => update("price", e.target.value)} placeholder="e.g. K350 — leave blank for 'Price on request'" className={inp} /></In>
                <In label="Category">
                  <select value={form.category} onChange={(e) => update("category", e.target.value)} className={inp}>
                    {catOptions.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </In>
                <In label="Status">
                  <select value={form.status} onChange={(e) => update("status", e.target.value)} className={inp}>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </In>
                <In label="Sizes (comma separated)"><input value={form.sizes} onChange={(e) => update("sizes", e.target.value)} placeholder="S, M, L" className={inp} /></In>
                <In label="Colors (comma separated)"><input value={form.colors} onChange={(e) => update("colors", e.target.value)} placeholder="Black, Red" className={inp} /></In>
              </div>
              <In label="Delivery Info"><input value={form.delivery_info} onChange={(e) => update("delivery_info", e.target.value)} className={inp} /></In>
              <In label="Description"><textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={4} className={inp} /></In>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.is_new_arrival} onChange={(e) => update("is_new_arrival", e.target.checked)} className="accent-foreground" /> New Arrival
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.is_popular} onChange={(e) => update("is_popular", e.target.checked)} className="accent-foreground" /> Popular Pick
                </label>
              </div>

              <In label="Product Images">
                <div className="flex flex-wrap gap-3">
                  {images.map((img, i) => (
                    <div key={i} className="relative w-20 h-24 group">
                      <img src={img} alt="" className="w-full h-full object-cover border border-border" />
                      <button type="button" onClick={() => removeImage(i)} className="absolute -top-2 -right-2 w-5 h-5 bg-foreground text-background flex items-center justify-center text-xs"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <label className="w-20 h-24 border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-foreground">
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
                    <input type="file" accept="image/*" multiple onChange={onFiles} className="hidden" />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">Upload from your phone or computer. Images are optimized automatically.</p>
              </In>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-foreground text-background py-3 text-[11px] tracking-wide-2 uppercase hover:opacity-85 disabled:opacity-50">
                  {saving ? "Saving…" : editing ? "Save Changes" : "Add Product"}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="px-6 border border-border py-3 text-[11px] tracking-wide-2 uppercase hover:bg-muted">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} selected product{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const inp = "w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:border-foreground outline-none transition-colors";
function In({ label, children }) {
  return <label className="block"><span className="block text-[10px] tracking-wide-2 uppercase text-muted-foreground mb-1.5">{label}</span>{children}</label>;
}