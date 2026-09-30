import { useEffect, useState } from "react";
import { X, Image as ImageIcon, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUSES = ["new", "contacted", "processing", "sourced", "completed", "cancelled"];
const STATUS_COLORS = {
  new: "bg-foreground text-background",
  contacted: "border border-foreground",
  processing: "bg-muted text-foreground",
  sourced: "bg-[#1f7a4c] text-white",
  completed: "bg-[#165c39] text-white",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export default function AdminPreorders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewImg, setViewImg] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const load = () => {
    setLoading(true);
    base44.entities.Preorder.list("-created_date", 200).then(setOrders).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setStatus = async (o, status) => {
    await base44.entities.Preorder.update(o.id, { status });
    setOrders((prev) => prev.map((p) => (p.id === o.id ? { ...p, status } : p)));
  };

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = orders.length > 0 && selected.size === orders.length;
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.id)));
  const confirmBulkDelete = async () => {
    await base44.entities.Preorder.deleteMany({ id: { $in: Array.from(selected) } });
    setSelected(new Set());
    setBulkDeleteOpen(false);
    load();
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <h1 className="font-display text-4xl md:text-5xl">Pre-Orders</h1>
      <p className="text-sm text-muted-foreground mt-2">{orders.length} customer requests</p>

      {selected.size > 0 && (
        <div className="mt-6 flex items-center justify-between gap-4 border border-border bg-muted/40 px-4 py-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="accent-foreground" /> Select all
          </label>
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
        <p className="mt-10 text-center text-muted-foreground text-sm tracking-wide-2 uppercase">Loading pre-orders…</p>
      ) : orders.length === 0 ? (
        <div className="mt-10 border border-border p-12 text-center">
          <p className="font-display text-2xl">No pre-orders yet</p>
          <p className="text-sm text-muted-foreground mt-2">Customer sourcing requests will appear here.</p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="border border-border p-5">
              <div className="flex flex-col md:flex-row gap-5">
                <div className="flex items-start pt-1">
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} className="accent-foreground w-4 h-4" />
                </div>
                <div className="w-full md:w-24 h-28 md:h-28 bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {o.requested_image ? (
                    <button onClick={() => setViewImg(o.requested_image)} className="w-full h-full">
                      <img src={o.requested_image} alt="" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground" strokeWidth={1} />
                  )}
                </div>
                <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <div><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Name</span><p className="font-display text-lg">{o.customer_name}</p></div>
                  <div><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Date</span><p>{fmtDate(o.created_date)}</p></div>
                  <div><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Phone</span><p>{o.phone || "—"}</p></div>
                  <div><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">WhatsApp</span><p>{o.whatsapp || "—"}</p></div>
                  <div><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Category / Size / Color</span><p>{[o.category, o.size, o.color].filter(Boolean).join(" • ") || "—"}</p></div>
                  <div><span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Message</span><p className="text-muted-foreground line-clamp-2">{o.message || "—"}</p></div>
                </div>
                <div className="md:w-40 flex flex-col gap-2">
                  <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Status</span>
                  <select
                    value={o.status || "new"}
                    onChange={(e) => setStatus(o, e.target.value)}
                    className="border border-border px-3 py-2 text-sm focus:border-foreground outline-none"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className={`text-[10px] tracking-wide-2 uppercase px-2 py-1 text-center ${STATUS_COLORS[o.status || "new"]}`}>{o.status || "new"}</span>
                  {o.whatsapp && (
                    <a href={`https://wa.me/${o.whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-center text-[10px] tracking-wide-2 uppercase bg-[#1f7a4c] text-white py-2 hover:bg-[#165c39]">Contact</a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewImg && (
        <div className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setViewImg(null)}>
          <button className="absolute top-5 right-5 text-cream"><X className="w-7 h-7" /></button>
          <img src={viewImg} alt="Request" className="max-h-[90vh] max-w-[90vw] object-contain" />
        </div>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} selected request{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected pre-orders. This action cannot be undone.
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