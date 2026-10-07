import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, Package, Loader2, ShoppingBag, Minus, Plus, AlertCircle, Ruler, ImageOff } from "lucide-react";
import { fetchBundle, UNAVAILABLE_TEXT } from "@/lib/bundles";
import { formatMoney } from "@/lib/cartPricing";
import { useCart } from "@/lib/CartContext";
import { toast } from "@/components/ui/use-toast";
import SizeGuideModal from "@/components/site/SizeGuideModal";
import SizeNotice from "@/components/site/SizeNotice";
import { productPath } from "@/lib/productUrl";

export default function BundleDetail() {
  const { id } = useParams();
  const { addBundleToCart } = useCart();
  const [state, setState] = useState({ loading: true, bundle: null });
  const [sizes, setSizes] = useState({}); // productId -> size chosen by the customer
  const [quantity, setQuantity] = useState(1);
  const [guideFor, setGuideFor] = useState(null);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, bundle: null });
    fetchBundle(id).then((bundle) => !cancelled && setState({ loading: false, bundle }));
    return () => { cancelled = true; };
  }, [id]);

  const bundle = state.bundle;
  const sizedComponents = useMemo(() => (bundle?.components || []).filter((c) => c.requiresSize), [bundle]);
  const missing = sizedComponents.filter((c) => !sizes[c.productId]);

  if (state.loading) return <div className="pt-32 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!bundle || !bundle.isActive) {
    return (
      <div className="pt-32 pb-16 mx-auto max-w-xl px-5 text-center">
        <p className="font-display text-2xl">Bundle not found</p>
        <p className="text-sm text-muted-foreground mt-2">This bundle is no longer available.</p>
        <Link to="/bundles" className="inline-block mt-6 text-[11px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">View all bundles</Link>
      </div>
    );
  }

  const handleAdd = () => {
    if (!bundle.purchasable) return;
    if (missing.length > 0) {
      toast({
        title: "Select your sizes first",
        description: `Please choose a size for: ${missing.map((m) => m.name).join(", ")}.`,
        variant: "destructive",
      });
      return;
    }
    addBundleToCart(
      {
        id: bundle.id,
        name: bundle.name,
        image: bundle.image,
        bundlePrice: bundle.bundlePrice,
        components: bundle.components.map((c) => ({
          productId: c.productId, name: c.name, quantity: c.quantity, unitPrice: c.unitPrice, image: c.image,
          category: c.category, sizes: c.sizes, requiresSize: c.requiresSize, sizingStandard: c.sizingStandard,
        })),
      },
      { quantity, selections: sizedComponents.map((c) => ({ productId: c.productId, size: sizes[c.productId] })) },
    );
    toast({ title: "Bundle added to cart", description: `${quantity} × ${bundle.name}` });
  };

  const images = bundle.images;
  return (
    <div className="pt-24 pb-16 mx-auto max-w-7xl px-5 md:px-8">
      <Link to="/bundles" className="inline-flex items-center gap-1 text-[11px] tracking-wide-2 uppercase text-muted-foreground hover:text-foreground mb-6">
        <ChevronLeft className="w-4 h-4" /> All bundles
      </Link>

      <div className="grid md:grid-cols-2 gap-8 md:gap-12">
        <div className="min-w-0">
          <div className="aspect-[4/3] bg-muted overflow-hidden">
            {images[activeImg] ? <img src={images[activeImg]} alt={bundle.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><ImageOff className="w-6 h-6" /></div>}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {images.map((src, i) => (
                <button key={src + i} onClick={() => setActiveImg(i)} className={`w-16 h-16 shrink-0 border ${i === activeImg ? "border-[#C5A059]" : "border-border"}`}>
                  <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] tracking-wide-2 uppercase text-[#C5A059]"><Package className="w-4 h-4" /> Bundle</p>
          <h1 className="font-display text-3xl mt-2">{bundle.name}</h1>
          <div className="mt-4 flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-3xl" data-testid="bundle-price">{formatMoney(bundle.bundlePrice)}</span>
            {bundle.savings > 0 && (
              <>
                <span className="text-sm text-muted-foreground line-through">{formatMoney(bundle.separateTotal)}</span>
                <span className="text-[11px] tracking-wide-2 uppercase bg-[#C5A059] text-black px-2 py-1 font-semibold">
                  Save {formatMoney(bundle.savings)} ({bundle.savingsPercent}%)
                </span>
              </>
            )}
          </div>
          {bundle.availabilityNote && <p className="mt-2 text-xs text-muted-foreground">{bundle.availabilityNote}</p>}
          {bundle.description && <p className="mt-5 text-sm font-light leading-relaxed text-foreground/80 whitespace-pre-line">{bundle.description}</p>}

          <h2 className="mt-8 text-[11px] tracking-wide-2 uppercase text-muted-foreground border-b border-border pb-2">What is included</h2>
          <ul className="divide-y divide-border" data-testid="bundle-components">
            {bundle.components.map((c) => (
              <li key={c.productId + (c.gradeName || "")} className="py-3">
                <div className="flex gap-3">
                  <div className="w-14 h-16 bg-muted shrink-0 overflow-hidden">
                    {c.image && <img src={c.image} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to={productPath({ id: c.productId, name: c.name })} className="text-sm font-medium hover:text-[#C5A059] line-clamp-2">{c.name}</Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.quantity} × {c.unitPrice != null ? formatMoney(c.unitPrice) : "Price on request"}{c.gradeName ? ` · ${c.gradeName}` : ""}
                    </p>
                    {!c.available && (
                      <p className="mt-1 text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {c.name} {UNAVAILABLE_TEXT[c.unavailableReason] || "is unavailable"}</p>
                    )}
                  </div>
                </div>
                {c.requiresSize && c.available && (
                  <div className="mt-2 ml-[68px]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground">
                        Size: <span className="text-foreground font-semibold">{sizes[c.productId] || "Select"}</span>
                        <span className="normal-case tracking-normal ml-2">({c.sizingStandard})</span>
                      </p>
                      <button type="button" onClick={() => setGuideFor(c)} className="inline-flex items-center gap-1 text-[11px] tracking-wide-2 uppercase text-[#C5A059] hover:underline">
                        <Ruler className="w-3.5 h-3.5" /> Size Guide
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.sizes.map((s) => (
                        <button key={s} type="button" onClick={() => setSizes((p) => ({ ...p, [c.productId]: s }))}
                          className={`min-w-10 text-xs px-3 py-1.5 border ${sizes[c.productId] === s ? "border-[#C5A059] bg-[#C5A059]/10 font-medium" : "border-border text-muted-foreground hover:border-foreground"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {sizedComponents.length > 0 && <SizeNotice compact className="mt-5" />}

          <div className="mt-6 flex items-center gap-4">
            <div className="flex items-center border border-border">
              <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="w-10 h-11 flex items-center justify-center" aria-label="Decrease quantity"><Minus className="w-4 h-4" /></button>
              <span className="w-10 text-center text-sm" data-testid="bundle-qty">{quantity}</span>
              <button type="button" onClick={() => setQuantity((q) => Math.min(20, q + 1))} className="w-10 h-11 flex items-center justify-center" aria-label="Increase quantity"><Plus className="w-4 h-4" /></button>
            </div>
            <button
              onClick={handleAdd}
              disabled={!bundle.purchasable}
              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 text-[12px] tracking-wide-2 uppercase bg-[#C5A059] text-black hover:bg-[#b8914f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="add-bundle"
            >
              <ShoppingBag className="w-4 h-4" /> {bundle.purchasable ? "Add Bundle to Cart" : "Currently unavailable"}
            </button>
          </div>
          {!bundle.purchasable && bundle.blockedBy && (
            <p className="mt-3 text-xs text-muted-foreground">
              This bundle cannot be bought right now because {bundle.blockedBy.name} {UNAVAILABLE_TEXT[bundle.blockedBy.unavailableReason] || "is unavailable"}.
            </p>
          )}
        </div>
      </div>
      {guideFor && <SizeGuideModal product={guideFor.product} onClose={() => setGuideFor(null)} />}
    </div>
  );
}
