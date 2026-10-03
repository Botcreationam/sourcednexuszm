import { useEffect, useState } from "react";
import { MessageSquareQuote, X, Trash2, ExternalLink, MessageCircle, RefreshCw, ZoomIn, CheckCircle, Clock } from "lucide-react";
import {
  getCustomerInquiries,
  updateCustomerInquiryStatus,
  deleteCustomerInquiries,
} from "@/lib/supabase";
import { formatKwachaPrice } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
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
import AdminChatModal from "./AdminChatModal";

const STATUSES = ["New", "Contacted", "Pending", "Reviewing", "Quoted", "Confirmed", "Completed", "Cancelled"];

const STATUS_STYLES = {
  New: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  Contacted: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  Pending: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
  Reviewing: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  Quoted: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
  Confirmed: "bg-[#1f7a4c]/20 text-emerald-400 border border-emerald-500/30",
  Completed: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  Cancelled: "bg-zinc-800 text-zinc-500 line-through border border-zinc-750",
};

export default function AdminInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [chatInquiry, setChatInquiry] = useState(null);

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const data = await getCustomerInquiries({
        limit: 150,
        status: activeFilter === "all" ? undefined : activeFilter,
      });
      setInquiries(data || []);
    } catch (err) {
      console.error("Failed to load inquiries:", err);
      toast({
        title: "Load Failed",
        description: "Could not load customer inquiries. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiries();
  }, [activeFilter]);

  const handleStatusChange = async (inquiryId, newStatus) => {
    try {
      await updateCustomerInquiryStatus(inquiryId, newStatus);
      setInquiries((prev) =>
        prev.map((item) => (item.id === inquiryId ? { ...item, status: newStatus } : item))
      );
      toast({
        title: "Status Updated",
        description: `Inquiry status changed to ${newStatus}.`,
      });
    } catch (err) {
      console.error("Failed to update status:", err);
      toast({
        title: "Update Failed",
        description: err.message || "Failed to update inquiry status.",
        variant: "destructive",
      });
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === inquiries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(inquiries.map((i) => i.id)));
    }
  };

  const handleConfirmDelete = async () => {
    try {
      const ids = Array.from(selected);
      await deleteCustomerInquiries(ids);
      setSelected(new Set());
      setBulkDeleteOpen(false);
      toast({
        title: "Deleted",
        description: `Successfully deleted ${ids.length} inquiry record(s).`,
      });
      fetchInquiries();
    } catch (err) {
      console.error("Failed to delete inquiries:", err);
      toast({
        title: "Delete Failed",
        description: err.message || "Could not delete inquiries.",
        variant: "destructive",
      });
    }
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] tracking-luxe uppercase text-[#C5A059] font-medium">
            Concierge Sourcing & Quotes
          </span>
          <h1 className="font-display text-4xl md:text-5xl mt-1">Customer Inquiries</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review quote requests, multi-product inquiries, and custom pre-orders.
          </p>
        </div>

        <button
          onClick={fetchInquiries}
          disabled={loading}
          className="inline-flex items-center gap-2 border border-border px-4 py-2.5 text-[11px] tracking-wide-2 uppercase hover:bg-muted transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mt-8 border-b border-border pb-3">
        {["all", ...STATUSES].map((st) => (
          <button
            key={st}
            onClick={() => setActiveFilter(st)}
            className={`text-xs uppercase tracking-wide-2 px-3.5 py-1.5 transition-colors ${
              activeFilter === st
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="mt-4 flex items-center justify-between gap-4 border border-border bg-muted/40 px-4 py-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs uppercase tracking-wide-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.size === inquiries.length && inquiries.length > 0}
              onChange={toggleSelectAll}
              className="accent-foreground"
            />
            <span>Select All ({selected.size} selected)</span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 text-[11px] tracking-wide-2 uppercase hover:opacity-90"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="border border-border px-4 py-2 text-[11px] tracking-wide-2 uppercase hover:bg-muted"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-2 border-border border-t-foreground rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs uppercase tracking-wide-2 text-muted-foreground">Loading inquiries…</p>
        </div>
      ) : inquiries.length === 0 ? (
        <div className="mt-10 border border-border p-14 text-center">
          <MessageSquareQuote className="w-10 h-10 mx-auto text-muted-foreground stroke-[1.2] mb-3" />
          <p className="font-display text-2xl">No inquiries found</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {activeFilter === "all"
              ? "Customer product inquiries and quote requests submitted via website or WhatsApp will appear here."
              : `No customer inquiries currently with status "${activeFilter}".`}
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {inquiries.map((inq) => {
            const items = Array.isArray(inq.items) ? inq.items : [];
            const cleanPhone = (inq.contact_number || "").replace(/[^0-9]/g, "");
            const waLink = cleanPhone
              ? buildWhatsAppUrl(
                  `Hello ${inq.customer_name || "Customer"}, this is Sourced Nexus following up on your inquiry (Ref: ${inq.id?.slice(0, 8)}). How may we assist you with this order?`
                )
              : null;

            return (
              <div
                key={inq.id}
                className="border border-border bg-card/60 p-6 transition-all hover:border-zinc-700"
              >
                {/* Top strip */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/80">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(inq.id)}
                      onChange={() => toggleSelect(inq.id)}
                      className="accent-foreground w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <h3 className="font-display text-xl text-foreground">
                        {inq.customer_name || "Anonymous Customer"}
                      </h3>
                      <p className="text-[10px] tracking-wide-2 uppercase text-muted-foreground mt-0.5">
                        Ref: <span className="font-mono text-foreground/80">{inq.id}</span> • {fmtDate(inq.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Status Dropdown & Badges */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[9px] uppercase tracking-wide-2 px-2 py-0.5 bg-muted text-muted-foreground">
                      {inq.inquiry_type === "preorder" ? "Pre-Order" : "Quote Request"}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wide-2 px-2.5 py-1 ${STATUS_STYLES[inq.status] || STATUS_STYLES.Pending}`}>
                      {inq.status || "Pending"}
                    </span>
                    <select
                      value={inq.status || "Pending"}
                      onChange={(e) => handleStatusChange(inq.id, e.target.value)}
                      className="border border-border bg-background px-2.5 py-1 text-xs focus:border-foreground outline-none"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Customer Contact & Notes Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-4 text-xs border-b border-border/60">
                  <div>
                    <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground block">
                      Contact Number
                    </span>
                    <p className="font-medium text-foreground mt-0.5">{inq.contact_number || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground block">
                      Email
                    </span>
                    <p className="text-foreground truncate mt-0.5">{inq.email || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground block">
                      Channel / Source
                    </span>
                    <p className="text-foreground capitalize mt-0.5">{inq.source || "Website"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground block">
                      Quick Action
                    </span>
                    {waLink ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[10px] tracking-wide-2 uppercase bg-[#1f7a4c] hover:bg-[#165c39] text-white px-3 py-1.5 mt-0.5 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" /> Message on WhatsApp
                      </a>
                    ) : (
                      <span className="text-muted-foreground mt-0.5 block">—</span>
                    )}
                    <button
                      onClick={() => setChatInquiry(inq)}
                      className="inline-flex items-center gap-1.5 text-[10px] tracking-wide-2 uppercase bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 px-3 py-1.5 mt-2 transition-colors w-max"
                    >
                      <MessageSquareQuote className="w-3.5 h-3.5" /> Platform Chat
                    </button>
                  </div>
                </div>

                {/* Exact Product Images & Items Section (Requirement 3 & 5) */}
                <div className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground font-semibold">
                      Exact Requested Products ({items.length})
                    </span>
                    <span className="text-[9px] tracking-wide-2 uppercase text-[#C5A059] flex items-center gap-3">
                      <span>Total Units: {inq.total_items || items.reduce((acc, i) => acc + (i.quantity || 1), 0)}</span>
                      {inq.estimated_total > 0 && <span>Est. Total: {formatKwachaPrice(inq.estimated_total)}</span>}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 border border-border/80 bg-background/50 flex gap-3 items-start group"
                      >
                        {/* Exact Product Image Thumbnail */}
                        <div
                          className="w-16 h-20 bg-muted border border-border flex-shrink-0 relative overflow-hidden cursor-zoom-in"
                          onClick={() => item.image && setLightboxImg(item.image)}
                          title="Click to zoom image"
                        >
                          {item.image ? (
                            <>
                              <img
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <ZoomIn className="w-4 h-4 text-white" />
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-muted-foreground">
                              NO IMG
                            </div>
                          )}
                        </div>

                        {/* Product Meta */}
                        <div className="flex-1 min-w-0 text-xs">
                          <p className="font-medium text-foreground truncate" title={item.name}>
                            {item.name || "Product"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate flex justify-between">
                            <span>ID: <span className="font-mono">{item.id || "N/A"}</span></span>
                            {item.price && <span>{item.price}</span>}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1 text-[10px]">
                            <span className="bg-muted px-1.5 py-0.5">Qty: {item.quantity || 1}</span>
                            {item.selectedGrade && <span className="bg-muted px-1.5 py-0.5">Grade: {item.selectedGrade.name}</span>}
                            {item.selectedSize && <span className="bg-muted px-1.5 py-0.5">Size: {item.selectedSize}</span>}
                            {item.selectedColor && <span className="bg-muted px-1.5 py-0.5">Color: {item.selectedColor}</span>}
                          </div>
                          {item.specifications && (
                            <p className="text-[10px] text-amber-400 mt-1 line-clamp-1 italic">
                              "{item.specifications}"
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Additional Instructions / Specifications */}
                {(inq.specifications || inq.additional_instructions) && (
                  <div className="mt-4 pt-3 border-t border-border/60 text-xs space-y-1.5 bg-muted/20 p-3">
                    {inq.specifications && (
                      <p>
                        <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground font-semibold">
                          Client Specifications:{" "}
                        </span>
                        <span className="text-foreground">{inq.specifications}</span>
                      </p>
                    )}
                    {inq.additional_instructions && (
                      <p>
                        <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground font-semibold">
                          Delivery Instructions / Area:{" "}
                        </span>
                        <span className="text-foreground">{inq.additional_instructions}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox for exact product image inspection */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
          onClick={() => setLightboxImg(null)}
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-5 right-5 text-white p-2 hover:bg-white/10 rounded-full"
            aria-label="Close image preview"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxImg}
            alt="Exact product"
            className="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl border border-zinc-800"
          />
        </div>
      )}

      {/* Bulk Delete Dialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size} selected inquiry record{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected inquiries from the administrative records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Internal Chat Modal */}
      <AdminChatModal inquiry={chatInquiry} open={!!chatInquiry} onClose={() => setChatInquiry(null)} />
    </div>
  );
}
