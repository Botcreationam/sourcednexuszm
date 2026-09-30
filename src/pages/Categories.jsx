import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import ScrollReveal from "@/components/site/ScrollReveal";
import SectionHeading from "@/components/site/SectionHeading";

const DEFAULTS = [
  { name: "Dresses", img: "https://images.unsplash.com/photo-1539109383622-4d8b9e576027?auto=format&fit=crop&w=800&q=80" },
  { name: "Suits", img: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80" },
  { name: "Heels", img: "https://images.unsplash.com/photo-1543163521-1bf539c1dd198?auto=format&fit=crop&w=800&q=80" },
  { name: "Shoes", img: "https://images.unsplash.com/photo-1549298916-b57d783b0bf6?auto=format&fit=crop&w=800&q=80" },
];

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Category.list("-created_date", 50)
      .then(setCategories)
      .finally(() => setLoading(false));
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
            <p className="text-center text-muted-foreground text-sm tracking-wide-2 uppercase">Loading…</p>
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