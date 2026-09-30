import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ScrollReveal from "@/components/site/ScrollReveal";
import SectionHeading from "@/components/site/SectionHeading";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import BrandedLoader from "@/components/BrandedLoader";

const DEFAULTS = [
  { name: "Electronics", img: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80" },
  { name: "Watches", img: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80" },
  { name: "Dresses", img: "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/d51d95ee0_IMG_7842.jpeg" },
  { name: "Suits", img: "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/cd6535153_IMG_7593.jpeg" },
  { name: "Shoes", img: "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/45ca4d997_IMG_7913.jpeg" },
  { name: "Heels", img: "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/54f2cdec4_IMG_7898.jpeg" },
  { name: "Bags & Accessories", img: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=80" },
  { name: "Perfumes", img: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80" },
];

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        if (isSupabaseConfigured) {
          const { data, error } = await supabase.from("categories").select("*").order("display_order", { ascending: true });
          if (!error && data && data.length > 0) {
            setCategories(data);
            return;
          }
        }
        const data = await base44.entities.Category.list("-created_date", 50);
        setCategories(data);
      } catch (err) {
        console.error("Categories fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCats();
  }, []);

  const list = categories.length > 0 ? categories.map((c) => ({ name: c.name, img: c.image })) : DEFAULTS;

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