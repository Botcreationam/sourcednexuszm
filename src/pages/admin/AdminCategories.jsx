import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Upload, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isSupabaseConfigured, supabase, uploadImageToSupabase } from "@/lib/supabase";

const empty = { name: "", slug: "", description: "", image: "" };

export default function AdminCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from("categories").select("*").order("display_order", { ascending: true });
        if (!error && data) setCategories(data);
        return;
      }
      const data = await base44.entities.Category.list("-created_date", 50);
      setCategories(data);
    } catch (err) {
      console.error("Load categories error:", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm(empty); };
  const openEdit = (c) => { setEditing(c); setForm({ name: c.name || "", slug: c.slug || "", description: c.description || "", image: c.image || "" }); };
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      let imageUrl = "";
      if (isSupabaseConfigured) {
        imageUrl = await uploadImageToSupabase(file, "category-images");
      } else {
        const res = await base44.integrations.Core.UploadPublicFile({ file });
        imageUrl = res.file_url;
      }
      update("image", imageUrl);
    } catch (err) {
      console.error("Category image upload error:", err);
      alert("Image upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    const slug = form.slug || form.name.toLowerCase().replace(/\s+/g, "-");
    const payload = { ...form, slug };
    try {
      if (isSupabaseConfigured) {
        if (editing) {
          const { error } = await supabase.from("categories").update(payload).eq("id", editing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("categories").insert([payload]);
          if (error) throw error;
        }
      } else {
        if (editing) await base44.entities.Category.update(editing.id, payload);
        else await base44.entities.Category.create(payload);
      }
      setEditing(null);
      setForm(empty);
      load();
    } catch (err) {
      console.error("Category save error:", err);
      alert("Failed to save category: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    if (isSupabaseConfigured) {
      await supabase.from("categories").delete().eq("id", c.id);
    } else {
      await base44.entities.Category.delete(c.id);
    }
    load();
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl md:text-5xl">Categories</h1>
          <p className="text-sm text-muted-foreground mt-2">{categories.length} categories</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 bg-foreground text-background px-5 py-3 text-[11px] tracking-wide-2 uppercase hover:opacity-85">
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      {loading ? (
        <p className="mt-10 text-center text-muted-foreground text-sm tracking-wide-2 uppercase">Loading…</p>
      ) : categories.length === 0 ? (
        <div className="mt-10 border border-border p-12 text-center">
          <p className="font-display text-2xl">No categories yet</p>
          <p className="text-sm text-muted-foreground mt-2">The storefront shows default categories (Dresses, Suits, Heels, Shoes) until you add your own.</p>
        </div>
      ) : (
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((c) => (
            <div key={c.id} className="border border-border p-4">
              <div className="aspect-[3/4] bg-muted overflow-hidden mb-3">
                {c.image && <img src={c.image} alt={c.name} className="w-full h-full object-cover" />}
              </div>
              <h3 className="font-display text-xl">{c.name}</h3>
              {c.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={() => openEdit(c)} className="flex-1 border border-border py-2 text-[10px] tracking-wide-2 uppercase hover:bg-muted flex items-center justify-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                <button onClick={() => remove(c)} className="border border-border px-3 py-2 hover:bg-muted"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-start md:items-center justify-center p-4 overflow-y-auto" onClick={() => setEditing(null)}>
          <div className="bg-background border border-border w-full max-w-md my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-display text-2xl">{editing ? "Edit Category" : "Add Category"}</h2>
              <button onClick={() => setEditing(null)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="px-6 py-5 space-y-4">
              <In label="Name *"><input required value={form.name} onChange={(e) => update("name", e.target.value)} className={inp} /></In>
              <In label="Slug (optional)"><input value={form.slug} onChange={(e) => update("slug", e.target.value)} placeholder="auto-generated" className={inp} /></In>
              <In label="Description"><textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} className={inp} /></In>
              <In label="Category Image">
                <div className="flex items-center gap-3">
                  <div className="w-20 h-24 bg-muted overflow-hidden border border-border">
                    {form.image && <img src={form.image} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <label className="border border-dashed border-border px-4 py-3 cursor-pointer hover:border-foreground text-xs tracking-wide-2 uppercase flex items-center gap-2">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
                    <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                  </label>
                </div>
              </In>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-foreground text-background py-3 text-[11px] tracking-wide-2 uppercase hover:opacity-85 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={() => setEditing(null)} className="px-6 border border-border py-3 text-[11px] tracking-wide-2 uppercase hover:bg-muted">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = "w-full bg-transparent border border-border px-3 py-2.5 text-sm focus:border-foreground outline-none transition-colors";
function In({ label, children }) {
  return <label className="block"><span className="block text-[10px] tracking-wide-2 uppercase text-muted-foreground mb-1.5">{label}</span>{children}</label>;
}