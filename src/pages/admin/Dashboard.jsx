import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Package, Clock, MessageSquareQuote, Users, Activity, Eye, ArrowUpRight, BarChart, TrendingUp, History } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { base44 } from "@/api/base44Client";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function Dashboard() {
  const [products, setProducts] = useState([]);
  const [preorders, setPreorders] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        if (isSupabaseConfigured && supabase) {
          const [p, po, inq, an] = await Promise.all([
            supabase.from("products").select("*").order("created_at", { ascending: false }).limit(200),
            supabase.from("preorders").select("*").limit(200),
            supabase.from("customer_inquiries").select("*").limit(200).catch(() => ({ data: [] })),
            supabase.rpc("get_dashboard_analytics").catch(() => ({ data: null }))
          ]);
          setProducts(p.data || []);
          setPreorders(po.data || []);
          setInquiries(inq?.data || []);
          setAnalytics(an?.data || null);
          return;
        }

        const [p, po] = await Promise.all([
          base44.entities.Product.list("-created_date", 200),
          base44.entities.Preorder.list("-created_date", 200),
        ]);
        setProducts(p || []);
        setPreorders(po || []);
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
  const pendingInquiries = inquiries.filter((i) => i.status === "Pending").length;
  const recent = products.slice(0, 5);

  const stats = [
    { label: "Total Visits", value: analytics?.total_visits || 0, icon: Users, to: "#" },
    { label: "Unique Visitors", value: analytics?.unique_visitors || 0, icon: Activity, to: "#" },
    { label: "Product Views", value: analytics?.product_views || 0, icon: Eye, to: "#" },
    { label: "Returning Visitors", value: analytics?.returning_visitors || 0, icon: ArrowUpRight, to: "#" },
    { label: "Pending Quotes", value: pendingInquiries, icon: Clock, to: "/secure/nexuspanel-trust/inquiries" },
    { label: "Total Products", value: products.length, icon: Package, to: "/secure/nexuspanel-trust/products" },
    { label: "Pre-Orders", value: preorders.length, icon: ClipboardList, to: "/secure/nexuspanel-trust/preorders" },
    { label: "Inquiries", value: inquiries.length, icon: MessageSquareQuote, to: "/secure/nexuspanel-trust/inquiries" }
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
                  <Link to="/secure/nexuspanel-trust/products" className="text-[10px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Edit</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {analytics?.most_viewed_products?.length > 0 && (
          <div className="border border-border p-6 lg:col-span-2">
            <h2 className="font-display text-2xl mb-4 flex items-center gap-2"><BarChart className="w-5 h-5"/> Most Viewed Products</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {analytics.most_viewed_products.map(p => (
                <div key={p.id} className="border border-border p-4 hover:border-foreground transition-colors">
                  <div className="aspect-square bg-muted mb-3 overflow-hidden">
                    {p.images?.[0] && <img src={p.images[0]} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <p className="text-sm truncate font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide-2">{p.view_count} views</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Traffic Trends Chart */}
        {analytics?.daily_visits?.length > 0 && (
          <div className="border border-border p-6 lg:col-span-2">
            <h2 className="font-display text-2xl mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5"/> Traffic Trends (Last 30 Days)</h2>
            <div className="h-[300px] w-full mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.daily_visits.map(d => ({ ...d, date: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C5A059" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#C5A059" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '0px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="visits" stroke="#C5A059" strokeWidth={2} fillOpacity={1} fill="url(#colorVisits)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent Visitor Activity */}
        {analytics?.recent_activity?.length > 0 && (
          <div className="border border-border p-6 lg:col-span-2">
            <h2 className="font-display text-2xl mb-4 flex items-center gap-2"><History className="w-5 h-5"/> Customer Browsing Activity</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-xs uppercase tracking-wide-2 text-muted-foreground font-normal">Time</th>
                    <th className="pb-3 text-xs uppercase tracking-wide-2 text-muted-foreground font-normal">Visitor ID</th>
                    <th className="pb-3 text-xs uppercase tracking-wide-2 text-muted-foreground font-normal">Page Path</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recent_activity.map((act, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="py-3 text-sm">{new Date(act.created_at).toLocaleString()}</td>
                      <td className="py-3 font-mono text-xs">{act.visitor_id.substring(0, 8)}...</td>
                      <td className="py-3 text-sm">{act.page_path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}