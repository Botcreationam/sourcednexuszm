import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "./ProductCard";
import ScrollReveal from "./ScrollReveal";

export default function HorizontalProductSection({ title, eyebrow, products, viewAllTo }) {
  const scroller = useRef(null);

  const scroll = (dir) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.8), behavior: "smooth" });
  };

  if (!products || products.length === 0) return null;

  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <ScrollReveal className="flex items-end justify-between mb-8">
          <div>
            {eyebrow && <span className="text-[11px] tracking-luxe uppercase text-muted-foreground">{eyebrow}</span>}
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl mt-1">{title}</h2>
          </div>
          {viewAllTo && (
            <a href={viewAllTo} className="hidden md:block text-[11px] tracking-wide-2 uppercase border-b border-foreground pb-0.5 hover:opacity-60 transition-opacity">
              View All
            </a>
          )}
        </ScrollReveal>
      </div>

      <div className="relative group">
        <button
          onClick={() => scroll(-1)}
          className="hidden md:flex absolute left-4 top-[42%] z-10 w-11 h-11 -translate-y-1/2 items-center justify-center bg-background/80 border border-border rounded-full backdrop-blur hover:bg-foreground hover:text-background transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => scroll(1)}
          className="hidden md:flex absolute right-4 top-[42%] z-10 w-11 h-11 -translate-y-1/2 items-center justify-center bg-background/80 border border-border rounded-full backdrop-blur hover:bg-foreground hover:text-background transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div
          ref={scroller}
          className="flex gap-5 md:gap-6 overflow-x-auto no-scrollbar snap-x snap-mandatory px-5 md:px-8 pb-2 scroll-pl-5 md:scroll-pl-8"
        >
          {products.map((p) => (
            <div key={p.id} className="flex-shrink-0 w-[78vw] sm:w-[300px] snap-start">
              <ProductCard product={p} />
            </div>
          ))}
          <div className="flex-shrink-0 w-2" />
        </div>
      </div>
    </section>
  );
}