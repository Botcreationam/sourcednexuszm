import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Truck, ChevronLeft, X, ZoomIn } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { buildWhatsAppUrl, productInquiryMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import ScrollReveal from "@/components/site/ScrollReveal";
import ShareBar from "@/components/site/ShareBar";
import BrandedLoader from "@/components/BrandedLoader";

const STATUS_LABELS = { available: "Available", preorder: "Pre-Order", soldout: "Sold Out" };

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    setLoading(true);
    base44.entities.Product.get(id)
      .then((p) => { setProduct(p); setActiveImg(0); })
      .finally(() => setLoading(false));
  }, [id]);

  // Dynamically update social preview meta tags for this product
  useEffect(() => {
    if (!product) return;
    const setMeta = (attr, key, content) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    const img = product.images?.[0];
    const desc = product.description || `Curated ${product.category} — ${product.price || "Price on request"}. Sourced Nexus, Lusaka.`;
    document.title = `${product.name} — Sourced Nexus`;
    setMeta("property", "og:title", product.name);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", window.location.href);
    if (img) setMeta("property", "og:image", img);
    setMeta("name", "twitter:title", product.name);
    setMeta("name", "twitter:description", desc);
    if (img) setMeta("name", "twitter:image", img);
  }, [product]);

  if (loading) {
    return <BrandedLoader fullScreen={false} text="Loading Product Details..." />;
  }
  if (!product) {
    return (
      <div className="pt-32 text-center">
        <h1 className="font-display text-4xl">Product not found</h1>
        <Link to="/catalog" className="mt-6 inline-block text-[11px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Back to Catalog</Link>
      </div>
    );
  }

  const images = product.images?.length ? product.images : [];
  const status = product.status || "available";

  return (
    <div className="pt-20">
      <div className="mx-auto max-w-7xl px-5 md:px-8 py-8">
        <Link to="/catalog" className="inline-flex items-center gap-1 text-[11px] tracking-wide-2 uppercase text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ChevronLeft className="w-4 h-4" /> Back to Catalog
        </Link>

        <div className="grid md:grid-cols-2 gap-8 md:gap-14">
          {/* Gallery */}
          <div>
            <div className="relative aspect-[3/4] overflow-hidden bg-muted group cursor-zoom-in" onClick={() => images[activeImg] && setLightbox(true)}>
              {images[activeImg] ? (
                <img
                  src={images[activeImg]}
                  alt={product.name}
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs tracking-wide-2">NO IMAGE</div>
              )}
              {images[activeImg] && (
                <div className="absolute top-3 right-3 w-9 h-9 bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn className="w-4 h-4" />
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`flex-shrink-0 w-20 aspect-[3/4] overflow-hidden border ${i === activeImg ? "border-foreground" : "border-border"}`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            <ScrollReveal>
              <p className="text-[11px] tracking-luxe uppercase text-muted-foreground">{product.category}</p>
              <h1 className="font-display text-4xl md:text-5xl mt-3 leading-tight">{product.name}</h1>
              <p className="text-2xl font-display mt-4">{product.price || "Price on request"}</p>

              <div className="flex items-center gap-3 mt-5">
                <span className={`text-[10px] tracking-wide-2 uppercase px-3 py-1.5 ${
                  status === "available" ? "bg-foreground text-background" :
                  status === "preorder" ? "border border-foreground text-foreground" : "bg-muted text-muted-foreground"
                }`}>{STATUS_LABELS[status]}</span>
                <span className="text-[11px] tracking-wide-2 uppercase text-muted-foreground flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> Delivery: {product.delivery_info || "7–14 working days"}
                </span>
              </div>

              {product.description && (
                <div className="mt-8 pt-8 border-t border-border">
                  <p className="text-sm font-light leading-relaxed text-foreground/80 whitespace-pre-line">{product.description}</p>
                </div>
              )}

              {product.sizes?.length > 0 && (
                <div className="mt-8">
                  <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground mb-3">Available Sizes</p>
                  <div className="flex flex-wrap gap-2">
                    {product.sizes.map((s) => (
                      <span key={s} className="min-w-10 text-center text-xs border border-border px-3 py-2">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {product.colors?.length > 0 && (
                <div className="mt-6">
                  <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground mb-3">Available Colors</p>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((c) => (
                      <span key={c} className="text-xs border border-border px-3 py-2">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-10 pt-8 border-t border-border">
                <a
                  href={buildWhatsAppUrl(productInquiryMessage(product.name))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center bg-[#1f7a4c] text-white py-4 text-[11px] tracking-wide-2 uppercase hover:bg-[#165c39] transition-colors"
                >
                  Order on WhatsApp
                </a>
                <p className="text-center text-[11px] tracking-wide-2 uppercase text-muted-foreground mt-4">
                  WhatsApp / Call: {WHATSAPP_DISPLAY}
                </p>
              </div>

              <div className="mt-8">
                <ShareBar product={product} />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && images[activeImg] && (
        <div className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setLightbox(false)}>
          <button className="absolute top-5 right-5 text-cream" aria-label="Close"><X className="w-7 h-7" /></button>
          <img src={images[activeImg]} alt={product.name} className="max-h-[90vh] max-w-[90vw] object-contain" />
        </div>
      )}
    </div>
  );
}