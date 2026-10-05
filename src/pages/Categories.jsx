import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ScrollReveal from "@/components/site/ScrollReveal";
import SectionHeading from "@/components/site/SectionHeading";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import BrandedLoader from "@/components/BrandedLoader";


export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchCats = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from("categories").select("*").order("display_order", { ascending: true });
        if (error) throw error;
        if (data && data.length > 0) {
          setCategories(data);
          return;
        }
      }
      const data = await base44.entities.Category.list("-created_date", 50);
      setCategories(data || []);
    } catch (err) {
      console.error("Categories fetch error:", err);
      setLoadError(err?.message || "Could not load categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCats();
  }, [fetchCats]);

  // Only real data from the database is shown — never a hardcoded list.
  const list = categories.map((c) => ({ name: c.name, img: c.image }));

  return (
    <div className="pt-20">
      <section className="py-16 md:py-20 border-b border-border">
        <div className="mx-auto max-w-3xl px-5 md:px-8 text-center">
          <SectionHeading eyebrow="Browse" title="Categories" subtitle="Explore our curated collections, sourced on request." />
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          {loading ? (
            <BrandedLoader fullScreen={false} text="Loading Categories..." />
          ) : loadError ? (
            <div className="text-center py-20 border border-border">
              <AlertTriangle className="w-8 h-8 mx-auto text-[#C5A059]" aria-hidden="true" />
              <p className="font-display text-2xl mt-4">Categories are temporarily unavailable</p>
              <p className="text-sm text-muted-foreground mt-2">Please check your connection and try again.</p>
              <button
                onClick={() => fetchCats()}
                className="mt-6 inline-flex items-center gap-2 px-6 py-3 text-[11px] tracking-wide-2 uppercase bg-[#C5A059] text-black hover:bg-[#b8914f] transition-colors"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" /> Retry
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-display text-2xl">No categories yet</p>
              <p className="text-sm text-muted-foreground mt-2">New collections are on the way. Check back soon.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {list.map((c, i) => (
                <ScrollReveal key={c.name} delay={i * 0.08}>
                  <Link to={`/catalog?category=${encodeURIComponent(c.name)}`} className="group relative block aspect-[3/4] overflow-hidden">
                    <img src={c.img} alt={c.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />
                    <div className="absolute bottom-0 inset-x-0 p-5 text-center">
                      <h3 className="font-display text-2xl md:text-3xl text-cream">{c.name}</h3>
                      <span className="text-[10px] tracking-wide-2 uppercase text-cream/70 mt-1 inline-block opacity-0 group-hover:opacity-100 transition-opacity">Shop Now →</span>
                    </div>
                  </Link>
                </ScrollReveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}