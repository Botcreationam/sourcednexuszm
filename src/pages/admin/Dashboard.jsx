import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tags, ClipboardList, Package, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function Dashboard() {
  const [products, setProducts] = useState([]);
  const [preorders, setPreorders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        if (isSupabaseConfigured && supabase) {
          const [p, po, c] = await Promise.all([
            supabase.from("products").select("*").order("created_at", { ascending: false }).limit(200),
            supabase.from("preorders").select("*").limit(200),
            supabase.from("categories").select("*").limit(100),
          ]);
          setProducts(p.data || []);
          setPreorders(po.data || []);
          setCategories(c.data || []);
          return;
        }

        const [p, po, c] = await Promise.all([
          base44.entities.Product.list("-created_date", 200),
          base44.entities.Preorder.list("-created_date", 200),
          base44.entities.Category.list("-created_date", 50),
        ]);
        setProducts(p || []);
        setPreorders(po || []);
        setCategories(c || []);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const byCategory = {};
  products.forEach((p) => { byCategory[p.category] = (byCategory[p.category] || 0) + 1; });
  const newPreorders = preorders.filter((p) => p.status === "new").length;
  const recent = products.slice(0, 5);

  const stats = [
    { label: "Total Products", value: products.length, icon: Package, to: "/admin/products" },
    { label: "Categories", value: categories.length, icon: Tags, to: "/admin/categories" },
    { label: "Pre-Orders", value: preorders.length, icon: ClipboardList, to: "/admin/preorders" },
    { label: "New Requests", value: newPreorders, icon: Clock, to: "/admin/preorders" },
  ];

  if (loading) return <div className="p-10 text-center text-muted-foreground text-sm tracking-wide-2 uppercase">Loading dashboard…</div>;

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <h1 className="font-display text-4xl md:text-5xl">Dashboard</h1>
      <p className="text-sm text-muted-foreground mt-2">Welcome back. Here's your catalog at a glance.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="border border-border p-5 hover:border-foreground transition-colors group">
            <div className="flex items-center justify-between">
              <s.icon className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.5} />
            </div>
            <p className="font-display text-4xl mt-4">{s.value}</p>
            <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-10">
        <div className="border border-border p-6">
          <h2 className="font-display text-2xl mb-4">Products by Category</h2>
          {Object.keys(byCategory).length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byCategory).map(([cat, count]) => {
                const pct = products.length ? (count / products.length) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1"><span>{cat}</span><span className="text-muted-foreground">{count}</span></div>
                    <div className="h-1.5 bg-muted"><div className="h-full bg-foreground" style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border border-border p-6">
          <h2 className="font-display text-2xl mb-4">Recent Uploads</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {recent.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <div className="w-12 h-14 bg-muted overflow-hidden flex-shrink-0">
                    {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{p.name}</p>
                    <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground">{p.category} • {p.price}</p>
                  </div>
                  <Link to="/admin/products" className="text-[10px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Edit</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}