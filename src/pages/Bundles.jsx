import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, Loader2, ImageOff, AlertCircle } from "lucide-react";
import { fetchActiveBundles } from "@/lib/bundles";
import { formatMoney } from "@/lib/cartPricing";

export default function Bundles() {
  const [state, setState] = useState({ loading: true, bundles: [] });

  useEffect(() => {
    let cancelled = false;
    fetchActiveBundles().then((bundles) => !cancelled && setState({ loading: false, bundles }));
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="pt-24 pb-16 mx-auto max-w-7xl px-5 md:px-8">
      <div className="mb-8">
        <p className="flex items-center gap-2 text-[11px] tracking-wide-2 uppercase text-[#C5A059]">
          <Package className="w-4 h-4" /> Bundles
        </p>
        <h1 className="font-display text-3xl md:text-4xl mt-2">Save more when you buy together</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Curated sets of our products at one bundle price. Every item in a bundle must be available for the bundle to be purchasable.
        </p>
      </div>

      {state.loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : state.bundles.length === 0 ? (
        <div className="border border-border p-12 text-center text-sm text-muted-foreground">
          No bundles are available right now. Please check back soon.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="bundle-grid">
          {state.bundles.map((b) => (
            <Link key={b.id} to={`/bundles/${b.id}`} className="group border border-border hover:border-foreground transition-colors flex flex-col">
              <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                {b.image ? (
                  <img src={b.image} alt={b.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageOff className="w-6 h-6" /></div>
                )}
                {b.savings > 0 && (
                  <span className="absolute top-3 left-3 bg-[#C5A059] text-black text-[10px] tracking-wide-2 uppercase font-semibold px-2 py-1">
                    Save {formatMoney(b.savings)}
                  </span>
                )}
                {!b.purchasable && (
                  <span className="absolute top-3 right-3 bg-background/90 border border-border text-[10px] tracking-wide-2 uppercase px-2 py-1">
                    Unavailable
                  </span>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h2 className="font-display text-lg leading-snug">{b.name}</h2>
                <p className="text-xs text-muted-foreground mt-1">{b.components.length} product{b.components.length === 1 ? "" : "s"} included</p>
                <div className="mt-auto pt-4 flex items-baseline gap-2">
                  <span className="font-display text-xl">{formatMoney(b.bundlePrice)}</span>
                  {b.savings > 0 && <span className="text-xs text-muted-foreground line-through">{formatMoney(b.separateTotal)}</span>}
                </div>
                {!b.purchasable && b.blockedBy && (
                  <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    {b.blockedBy.name} is currently unavailable
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
