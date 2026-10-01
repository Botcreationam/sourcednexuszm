import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isSupabaseConfigured, getSupabaseProducts } from "@/lib/supabase";
import { recordSearchQuery } from "@/lib/recommendations";
import ProductCard from "@/components/site/ProductCard";
import ScrollReveal from "@/components/site/ScrollReveal";
import BrandedLoader from "@/components/BrandedLoader";


const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name", label: "A–Z" },
];

export default function Catalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");

  const category = params.get("category") || "All";
  const sort = params.get("sort") || "newest";

  useEffect(() => {
    if (!search.trim()) return;
    const timer = setTimeout(() => {
      recordSearchQuery(search.trim());
    }, 600);
    return () => clearTimeout(timer);
  }, [search]);

  const [categories, setCategories] = useState(["All"]);

  useEffect(() => {
    async function loadData() {
      try {
        if (isSupabaseConfigured) {
          const [sp, sc] = await Promise.all([
            getSupabaseProducts(),
            supabase.from("categories").select("name").order("display_order", { ascending: true })
          ]);
          
          if (sp && sp.length > 0) {
            setProducts(sp);
          } else {
            // Fallback to base44 if Supabase has no products yet
            const bProducts = await base44.entities.Product.list("-created_date", 200);
            setProducts(bProducts || []);
          }
          
          if (sc.data && sc.data.length > 0) {
            setCategories(["All", ...sc.data.map(c => c.name)]);
          }
          setLoading(false);
          return;
        }
        
        const bProducts = await base44.entities.Product.list("-created_date", 200);
        setProducts(bProducts || []);
      } catch (err) {
        console.error("Failed to load catalog data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const setCategory = (c) => {
    const next = new URLSearchParams(params);
    if (c === "All") next.delete("category");
    else next.set("category", c);
    setParams(next);
  };
  const setSort = (s) => {
    const next = new URLSearchParams(params);
    next.set("sort", s);
    setParams(next);
  };

  const filtered = useMemo(() => {
    let list = [...products];
    if (category !== "All") {
      const target = category.toLowerCase().trim();
      list = list.filter((p) => {
        const cat = (p.category || "").toLowerCase().trim();
        return cat === target;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
    }
    const priceNum = (p) => {
      const m = String(p.price ?? "").replace(/[^0-9.]/g, "");
      return m ? parseFloat(m) : 0;
    };
    if (sort === "price-asc") list.sort((a, b) => priceNum(a) - priceNum(b));
    else if (sort === "price-desc") list.sort((a, b) => priceNum(b) - priceNum(a));
    else if (sort === "name") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }, [products, category, sort, search]);

  return (
    <div className="pt-20">
      {/* Header */}
      <section className="border-b border-border py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-8 text-center">
          <ScrollReveal>
            <p className="text-[11px] tracking-luxe uppercase text-muted-foreground">The Collection</p>
            <h1 className="font-display text-5xl md:text-6xl mt-3">Shop The Catalog</h1>
            <p className="mt-4 text-sm font-light text-muted-foreground max-w-md mx-auto">
              Curated pieces, sourced on request. Delivery across Lusaka in 7–14 working days.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Controls */}
      <div className="sticky top-16 md:top-20 z-30 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="mx-auto max-w-7xl px-5 md:px-8 py-4 flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`text-[11px] tracking-wide-2 uppercase px-4 py-2 whitespace-nowrap transition-colors ${
                  category === c ? "bg-foreground text-background" : "border border-border hover:border-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products"
                className="w-full md:w-56 pl-9 pr-3 py-2 text-sm bg-transparent border border-border focus:border-foreground outline-none"
              />
            </div>
            <div className="relative">
              <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="appearance-none pl-9 pr-8 py-2 text-sm bg-transparent border border-border focus:border-foreground outline-none cursor-pointer"
              >
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          {loading ? (
            <BrandedLoader fullScreen={false} text="Loading Catalog..." />
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-display text-3xl">No products found</p>
              <p className="text-sm text-muted-foreground mt-2">Try a different category or search term.</p>
            </div>
          ) : (
            <>
              <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground mb-8">{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 md:gap-6">
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}