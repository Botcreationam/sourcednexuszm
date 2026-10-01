import { useEffect, useState } from "react";
import { MessageSquare, Star, Trash2, Check, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/use-toast";

export default function AdminModeration() {
  const [activeTab, setActiveTab] = useState("pending");
  const [reviews, setReviews] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [revRes, comRes] = await Promise.all([
      supabase.from("product_reviews").select("*, products(name)").order("created_at", { ascending: false }),
      supabase.from("product_comments").select("*, products(name)").order("created_at", { ascending: false })
    ]);
    
    if (revRes.data) setReviews(revRes.data);
    if (comRes.data) setComments(comRes.data);
    setLoading(false);
  };

  const updateStatus = async (table, id, status) => {
    try {
      await supabase.from(table).update({ status }).eq("id", id);
      toast({ title: `Status updated to ${status}` });
      fetchData();
    } catch (err) {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const deleteItem = async (table, id) => {
    try {
      await supabase.from(table).delete().eq("id", id);
      toast({ title: "Item deleted" });
      fetchData();
    } catch (err) {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="p-10 text-center text-muted-foreground">Loading Moderation Dashboard...</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-10">
      <div>
        <h1 className="font-display text-4xl mb-2">Moderation Dashboard</h1>
        <p className="text-sm text-muted-foreground">Manage product reviews and user comments.</p>
      </div>

      <div className="flex gap-4 border-b border-border pb-3">
        {["pending", "approved", "rejected"].map(tab => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            className={`text-xs uppercase tracking-wide-2 px-3.5 py-1.5 transition-colors ${activeTab === tab ? "bg-foreground text-background font-medium" : "text-muted-foreground hover:bg-muted"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Reviews */}
        <div>
          <h2 className="font-display text-2xl flex items-center gap-2 mb-4 border-b border-border pb-2">
            <Star className="w-5 h-5 text-[#C5A059]" /> Product Reviews
          </h2>
          <div className="space-y-4">
            {reviews.filter(r => r.status === activeTab).map(r => (
              <div key={r.id} className="border border-border p-4 bg-card/50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-xs text-[#C5A059] mb-1">{r.products?.name}</p>
                    <div className="flex items-center gap-1 text-xs">
                      {[1,2,3,4,5].map(i => <Star key={i} className={`w-3 h-3 ${i <= r.rating ? "fill-[#C5A059] text-[#C5A059]" : "text-zinc-600"}`} />)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[9px] uppercase tracking-wide-2 px-2 py-0.5 ${r.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : r.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {r.status}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                {r.title && <h4 className="text-sm font-semibold text-white mb-1">{r.title}</h4>}
                <p className="text-sm text-foreground mb-3">{r.review_text}</p>
                {r.experience_details && (
                  <p className="text-xs text-zinc-500 italic bg-muted/50 p-2 mb-3">Experience: {r.experience_details}</p>
                )}
                <div className="flex gap-2">
                  {r.status !== 'approved' && (
                    <button onClick={() => updateStatus("product_reviews", r.id, "approved")} className="text-[10px] tracking-wide-2 uppercase bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1.5 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Approve
                    </button>
                  )}
                  {r.status !== 'rejected' && (
                    <button onClick={() => updateStatus("product_reviews", r.id, "rejected")} className="text-[10px] tracking-wide-2 uppercase bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-1.5 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Reject
                    </button>
                  )}
                  <button onClick={() => deleteItem("product_reviews", r.id)} className="text-[10px] tracking-wide-2 uppercase border border-border hover:bg-muted text-muted-foreground px-3 py-1.5 flex items-center gap-1 ml-auto">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
            {reviews.filter(r => r.status === activeTab).length === 0 && <p className="text-sm text-muted-foreground">No {activeTab} reviews found.</p>}
          </div>
        </div>

        {/* Comments */}
        <div>
          <h2 className="font-display text-2xl flex items-center gap-2 mb-4 border-b border-border pb-2">
            <MessageSquare className="w-5 h-5 text-foreground" /> User Comments
          </h2>
          <div className="space-y-4">
            {comments.filter(c => c.status === activeTab).map(c => (
              <div key={c.id} className="border border-border p-4 bg-card/50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-xs text-[#C5A059] mb-1">{c.products?.name}</p>
                    <p className="text-xs font-medium text-foreground">{c.user_name || "Anonymous"}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[9px] uppercase tracking-wide-2 px-2 py-0.5 ${c.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : c.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {c.status}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-1">{new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground mb-4">{c.content}</p>
                <div className="flex gap-2">
                  {c.status !== 'approved' && (
                    <button onClick={() => updateStatus("product_comments", c.id, "approved")} className="text-[10px] tracking-wide-2 uppercase bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1.5 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Approve
                    </button>
                  )}
                  {c.status !== 'rejected' && (
                    <button onClick={() => updateStatus("product_comments", c.id, "rejected")} className="text-[10px] tracking-wide-2 uppercase bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-1.5 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Reject
                    </button>
                  )}
                  <button onClick={() => deleteItem("product_comments", c.id)} className="text-[10px] tracking-wide-2 uppercase border border-border hover:bg-muted text-muted-foreground px-3 py-1.5 flex items-center gap-1 ml-auto">
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
            {comments.filter(c => c.status === activeTab).length === 0 && <p className="text-sm text-muted-foreground">No {activeTab} comments found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
