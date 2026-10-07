import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from "react-router-dom";
import { Ruler, Truck, ChevronLeft, X, ZoomIn, Heart, ShoppingBag, Check, Plus, Minus, MessageCircle, Send, AlertTriangle, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { buildWhatsAppUrl, buildCartInquiryWhatsAppMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import { formatKwachaPrice } from "@/lib/utils";
import { recordProductView, recordCategoryView } from "@/lib/recommendations";
import { useCart } from "@/lib/CartContext";
import { toast } from "@/components/ui/use-toast";
import ScrollReveal from "@/components/site/ScrollReveal";
import ShareBar from "@/components/site/ShareBar";
import BrandedLoader from "@/components/BrandedLoader";
import ProductChat from "@/components/site/ProductChat";
import ProductInteractions from "@/components/site/ProductInteractions";
import HorizontalProductSection from "@/components/site/HorizontalProductSection";
import SizeGuideModal from "@/components/site/SizeGuideModal";
import SizeNotice from "@/components/site/SizeNotice";
import { requiresSizeVerification, sizingStandardFor } from "@/lib/sizePolicy";
import { productPath, parseProductParam } from "@/lib/productUrl";

const STATUS_LABELS = { available: "Available", preorder: "Pre-Order", soldout: "Sold Out" };

export default function ProductDetail() {
  const { id: routeParam } = useParams();
  const navigate = useNavigate();
  const parsedParam = parseProductParam(routeParam);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [metrics, setMetrics] = useState({ view_count: 0, like_count: 0, review_count: 0, average_rating: 0 });
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState([]);

  // Cart & Options State
  // Cart & Options State
  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [specifications, setSpecifications] = useState("");

  const {
    addToCart,
    removeProductVariant,
    isInCart,
    toggleWishlist,
    isInWishlist,
    openInquiryModal,
  } = useCart();

  const loadProduct = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    async function loadProductInner() {
      try {
        if (isSupabaseConfigured && supabase) {
          let query = supabase.from("products").select("*");
          if (parsedParam?.id) {
            query = query.eq("id", parsedParam.id);
          } else if (parsedParam?.tail) {
            query = query
              .gte("id", `${parsedParam.tail}-0000-0000-0000-000000000000`)
              .lte("id", `${parsedParam.tail}-ffff-ffff-ffff-ffffffffffff`);
          } else {
            query = query.eq("id", routeParam);
          }
          const { data: found, error } = await query.limit(2);
          const data = Array.isArray(found) && found.length === 1 ? found[0] : null;
          if (data && !error) {
            setProduct(data);
            recordProductView(data);
            recordCategoryView(data.category);
            
            // Fetch metrics
            const { data: metricsData } = await supabase.from("product_metrics").select("*").eq("product_id", data.id).maybeSingle();
            if (metricsData) setMetrics(metricsData);
            
            setActiveImg(0);
            // Garments that need size verification start with NO size picked: the
            // customer must choose, we never choose for them.
            if (data.sizes?.length && !requiresSizeVerification(data)) setSelectedSize(data.sizes[0]);
            if (data.colors?.length) setSelectedColor(data.colors[0]);
            if (data.grades?.length) setSelectedGrade(data.grades[0]);
            setLoading(false);
            return;
          }
        }
        const bProduct = await base44.entities.Product.get(parsedParam?.id || routeParam);
        setProduct(bProduct);
        if (bProduct) {
          recordProductView(bProduct);
          recordCategoryView(bProduct.category);
          if (bProduct.sizes?.length && !requiresSizeVerification(bProduct)) setSelectedSize(bProduct.sizes[0]);
          if (bProduct.colors?.length) setSelectedColor(bProduct.colors[0]);
          if (bProduct.grades?.length) setSelectedGrade(bProduct.grades[0]);
        }
        setActiveImg(0);
      } catch (err) {
        console.error("Failed to load product details:", err);
        setLoadError(err?.message || "Could not load this product.");
      } finally {
        setLoading(false);
      }
    }
    return loadProductInner();
  }, [routeParam]);

  // Retry after a failed load
  const retryLoad = useCallback(() => {
    loadProduct();
  }, [loadProduct]);

  // Initial load — runs on mount and whenever the product id changes
  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  // Related products: same category (excluding this product) for
  // "You May Also Like" / "More From This Category" recommendations
  useEffect(() => {
    if (!product?.id || !product?.category) return;
    let cancelled = false;
    async function loadRelated() {
      try {
        if (isSupabaseConfigured && supabase) {
          const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("category", product.category)
            .neq("id", product.id)
            .neq("status", "hidden")
            .order("is_popular", { ascending: false })
            .limit(8);
          if (!cancelled && !error && data) setRelatedProducts(data);
        }
      } catch (err) {
        console.warn("Could not load related products:", err);
      }
    }
    loadRelated();
    return () => { cancelled = true; };
  }, [product?.id, product?.category]);

  // Social preview tags (og:*, twitter:*, canonical, JSON-LD) are produced on
  // the SERVER (lib/product-meta.mjs) because link-preview crawlers never run
  // JavaScript. Here we only (1) keep the tab title in sync while browsing
  // inside the app and (2) move old / renamed / bare-id URLs to the canonical
  // one so the address bar, and anything copied from it, is the shareable link.
  useEffect(() => {
    if (!product) return;
    document.title = `${product.name} | Sourced Nexus`;
    const canonical = productPath(product);
    if (window.location.pathname.toLowerCase() !== canonical.toLowerCase()) {
      navigate(canonical + window.location.search, { replace: true });
    }
  }, [product, navigate]);

  if (loadError && !product) {
    return (
      <div className="pt-24 pb-24">
        <div className="mx-auto max-w-md px-5 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-[#C5A059]" aria-hidden="true" />
          <p className="font-display text-2xl mt-4">This product is temporarily unavailable</p>
          <p className="text-sm text-muted-foreground mt-2">Please check your connection and try again.</p>
          <button
            onClick={retryLoad}
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 text-[11px] tracking-wide-2 uppercase bg-[#C5A059] text-black hover:bg-[#b8914f] transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Retry
          </button>
        </div>
      </div>
    );
  }

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
  
  const hasGrades = product.grades?.length > 0;
  const currentPrice = hasGrades && selectedGrade ? selectedGrade.price : product.price;
  const originalPrice = hasGrades && selectedGrade ? selectedGrade.original_price : null;
  const status = hasGrades && selectedGrade ? selectedGrade.stock_status.toLowerCase().replace(/ /g, "_") : (product.status || "available");
  
  const exactSelectedImage = images[activeImg] || (images.length > 0 ? images[0] : null);
  const needsSizeCheck = requiresSizeVerification(product);
  const selectedVariant = { size: selectedSize || null, color: selectedColor || null, gradeName: selectedGrade?.name || null };
  const inCart = isInCart(product.id, selectedVariant);
  const inWishlist = isInWishlist(product.id);

  const calculateDiscount = (price, original) => {
    if (!price || !original) return null;
    const p = parseFloat(price.toString().replace(/[^0-9.]/g, ''));
    const o = parseFloat(original.toString().replace(/[^0-9.]/g, ''));
    if (p && o && o > p) {
      return Math.round(((o - p) / o) * 100);
    }
    return null;
  };
  
  const explicitDiscount = hasGrades && selectedGrade ? selectedGrade.discount_percentage : null;
  const discountPercent = explicitDiscount || calculateDiscount(currentPrice, originalPrice);

  const handleWishlistToggle = () => {
    const isSaved = toggleWishlist(product);
    toast({
      title: isSaved ? "Saved to Wishlist" : "Removed from Wishlist",
      description: isSaved ? `${product.name} saved to your favorites.` : `${product.name} removed from your favorites.`,
    });
  };

  const handleAddToCart = () => {
    if (needsSizeCheck && !selectedSize) {
      toast({
        title: "Select your size first",
        description: "Please choose a size. Use the size guide if you are unsure.",
        variant: "destructive",
      });
      return;
    }
    addToCart(product, {
      quantity,
      selectedSize,
      selectedColor,
      selectedGrade,
      specifications,
      selectedImage: exactSelectedImage,
      price: currentPrice,
      originalPrice,
      discountPercentage: discountPercent,
      openDrawer: true,
    });
    toast({
      title: "Added to Inquiry Cart",
      description: `${quantity}x ${product.name} added to your inquiry list.`,
    });
  };

  const handleRemoveFromCart = () => {
    removeProductVariant(product.id, selectedVariant);
    toast({
      title: "Removed from Cart",
      description: `${product.name} removed from your inquiry cart.`,
    });
  };

  const handleDirectQuote = () => {
    // Open inquiry modal specifically for this item and selected options
    const singleItem = {
      id: product.id,
      name: product.name,
      category: product.category,
      price: currentPrice || "Price on Request",
      image: exactSelectedImage,
      quantity,
      selectedSize,
      selectedColor,
      selectedGrade,
      specifications,
    };
    openInquiryModal([singleItem]);
  };

  const handleDirectWhatsApp = () => {
    const message = buildCartInquiryWhatsAppMessage({
      items: [
        {
          id: product.id,
          name: product.name,
          category: product.category,
          price: currentPrice || "Price on Request",
          image: exactSelectedImage,
          quantity,
          selectedSize,
          selectedColor,
          selectedGrade,
          specifications,
        },
      ],
      inquiryType: status === "preorder" ? "preorder" : "quote_request",
      customerName: "",
      specifications,
    });
    window.open(buildWhatsAppUrl(message), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="pt-20">
      <div className="mx-auto max-w-7xl px-5 md:px-8 py-8">
        <Link to="/catalog" className="inline-flex items-center gap-1 text-[11px] tracking-wide-2 uppercase text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ChevronLeft className="w-4 h-4" /> Back to Catalog
        </Link>

        <div className="grid md:grid-cols-2 gap-8 md:gap-14">
          {/* Gallery */}
          <div className="min-w-0">
            <div className="relative aspect-[3/4] overflow-hidden bg-muted group cursor-zoom-in" onClick={() => images[activeImg] && setLightbox(true)}>
              {images[activeImg] ? (
                <img
                  src={images[activeImg]}
                  alt={product.name}
                  fetchPriority="high"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
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
                    className={`flex-shrink-0 w-20 aspect-[3/4] overflow-hidden border transition-all ${
                      i === activeImg ? "border-[#C5A059] ring-1 ring-[#C5A059]" : "border-border opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0">
            <ScrollReveal>
              <div className="flex items-center justify-between">
                <p className="text-[11px] tracking-luxe uppercase text-muted-foreground">{product.category}</p>
                {/* Wishlist toggle button */}
                <button
                  type="button"
                  onClick={handleWishlistToggle}
                  aria-label={inWishlist ? "Remove from wishlist" : "Save to wishlist"}
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-wide-2 px-3 py-1.5 border border-border hover:border-foreground transition-all"
                >
                  <Heart className={`w-4 h-4 ${inWishlist ? "fill-red-500 text-red-500" : "text-muted-foreground"}`} />
                  <span className="text-[10px]">{inWishlist ? "In Wishlist" : "Save to Wishlist"}</span>
                </button>
              </div>

              <h1 className="font-display text-4xl md:text-5xl leading-tight mt-3">{product.name}</h1>
              
              {/* Metrics display */}
              <div className="flex items-center gap-4 mt-2 text-xs uppercase tracking-wide-2 text-muted-foreground">
                <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" /> {metrics.like_count} Likes</span>
                <span className="flex items-center gap-1.5"><ZoomIn className="w-3.5 h-3.5" /> {metrics.view_count} Views</span>
                {metrics.review_count > 0 && <span>★ {metrics.average_rating} ({metrics.review_count} Reviews)</span>}
              </div>

              <div className="mt-4 flex flex-col gap-1">
                {discountPercent && (
                  <span className="inline-block px-2.5 py-0.5 bg-green-500/10 text-green-600 font-medium text-xs rounded-full w-fit">
                    {String(discountPercent).includes('%') ? discountPercent : `${discountPercent}% OFF`}
                  </span>
                )}
                {originalPrice && (
                  <span className="text-lg text-muted-foreground line-through decoration-muted-foreground/50">{formatKwachaPrice(originalPrice)}</span>
                )}
                <p className="text-3xl font-display text-foreground">{formatKwachaPrice(currentPrice)}</p>
              </div>

              {hasGrades && (
                <div className="mt-6 border-t border-border pt-5">
                  <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground mb-3">Select your preferred grade</p>
                  <div className="space-y-3">
                    {product.grades.map((g, idx) => (
                      <label key={idx} className={`flex items-center gap-3 cursor-pointer p-3 border transition-colors ${selectedGrade?.name === g.name ? 'border-[#C5A059] bg-[#C5A059]/5' : 'border-border hover:border-foreground/30'}`}>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${selectedGrade?.name === g.name ? 'border-[#C5A059]' : 'border-border'}`}>
                          {selectedGrade?.name === g.name && <div className="w-2.5 h-2.5 bg-[#C5A059] rounded-full" />}
                        </div>
                        <div className="flex-1 flex justify-between items-center text-sm">
                          <span className={`${selectedGrade?.name === g.name ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{g.name}</span>
                          <span className="text-foreground">{formatKwachaPrice(g.price)}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 p-3 bg-muted/30 border border-border">
                    <p className="text-sm font-medium">Selected: {selectedGrade?.name}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 mt-5">
                <span className={`text-[10px] tracking-wide-2 uppercase px-3 py-1.5 ${
                  status === "available" || status === "in_stock" ? "bg-foreground text-background" :
                  status === "preorder" || status === "available_on_request" ? "border border-foreground text-foreground" : "bg-muted text-muted-foreground"
                }`}>{STATUS_LABELS[status] || selectedGrade?.stock_status || status}</span>
                <span className="text-[11px] tracking-wide-2 uppercase text-muted-foreground flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> Delivery: {product.delivery_info || "7–14 working days"}
                </span>
              </div>

              {product.description && (
                <div className="mt-8 pt-6 border-t border-border">
                  <p className="text-sm font-light leading-relaxed text-foreground/80 whitespace-pre-line">{product.description}</p>
                </div>
              )}

              {/* Sizes Selection */}
              {product.sizes?.length > 0 && (
                <div className="mt-7">
                  <div className="flex items-center justify-between gap-3 mb-2.5">
                    <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground">
                      Select Size: <span className="text-foreground font-semibold">{selectedSize || "Select"}</span>
                    </p>
                    {(needsSizeCheck || product.size_guide_type) && (
                      <button
                        type="button"
                        onClick={() => setSizeGuideOpen(true)}
                        className="inline-flex items-center gap-1.5 text-[11px] tracking-wide-2 uppercase text-[#C5A059] hover:underline"
                        data-testid="size-guide-button"
                      >
                        <Ruler className="w-3.5 h-3.5" /> Size Guide
                      </button>
                    )}
                  </div>
                  {needsSizeCheck && (
                    <p className="mb-2.5 text-xs text-muted-foreground" data-testid="sizing-standard">
                      Sizing system: <span className="text-foreground">{sizingStandardFor(product)}</span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {product.sizes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedSize(s)}
                        className={`min-w-10 text-center text-xs px-3.5 py-2 transition-all border ${
                          selectedSize === s
                            ? "border-[#C5A059] bg-[#C5A059]/10 text-foreground font-medium"
                            : "border-border text-muted-foreground hover:border-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {needsSizeCheck && <SizeNotice compact className="mt-4" />}
                </div>
              )}

              {/* Colors Selection */}
              {product.colors?.length > 0 && (
                <div className="mt-6">
                  <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground mb-2.5">
                    Select Color: <span className="text-foreground font-semibold">{selectedColor || "Select"}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSelectedColor(c)}
                        className={`text-xs px-3.5 py-2 transition-all border ${
                          selectedColor === c
                            ? "border-[#C5A059] bg-[#C5A059]/10 text-foreground font-medium"
                            : "border-border text-muted-foreground hover:border-foreground"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity Stepper */}
              <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
                <div>
                  <span className="text-[11px] tracking-wide-2 uppercase text-muted-foreground block">
                    Quantity
                  </span>
                  <span className="text-[10px] text-zinc-500">Concierge quota</span>
                </div>
                <div className="flex items-center border border-border bg-background">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-10 text-center text-sm font-mono font-medium">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Action Buttons: Add/Remove Cart, Request Quote, WhatsApp */}
              <div className="mt-8 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Cart Button */}
                  {inCart ? (
                    <button
                      type="button"
                      onClick={handleRemoveFromCart}
                      className="w-full border border-red-500/40 text-red-400 hover:bg-red-500/10 py-3.5 text-[11px] tracking-wide-2 uppercase transition-colors flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" /> Remove from Cart
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className="w-full bg-[#C5A059] hover:bg-[#b08e4d] text-black py-3.5 text-[11px] tracking-wide-2 uppercase font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <ShoppingBag className="w-4 h-4" /> Add to Inquiry Cart
                    </button>
                  )}

                  {/* Direct Send Inquiry / Quote Button */}
                  <button
                    type="button"
                    onClick={handleDirectQuote}
                    className="w-full border border-foreground hover:bg-foreground hover:text-background text-foreground py-3.5 text-[11px] tracking-wide-2 uppercase font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" /> Request a Quote
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDirectWhatsApp}
                  className="w-full bg-[#1f7a4c] hover:bg-[#165c39] text-white py-3.5 text-[11px] tracking-wide-2 uppercase font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" /> Inquire via WhatsApp
                </button>

                {/* New Direct Messaging Chat Button */}
                <button
                  type="button"
                  onClick={() => setIsChatOpen(true)}
                  className="w-full border border-blue-500/50 hover:bg-blue-500/10 text-blue-400 py-3.5 text-[11px] tracking-wide-2 uppercase font-medium transition-colors flex items-center justify-center gap-2 mt-2"
                >
                  <MessageCircle className="w-4 h-4" /> Chat with Us
                </button>

                <p className="text-center text-[10px] tracking-wide-2 uppercase text-muted-foreground mt-2">
                  Official WhatsApp: {WHATSAPP_DISPLAY} • Lusaka Concierge
                </p>
              </div>

              <div className="mt-8">
                <ShareBar product={product} />
              </div>
              
              <ProductInteractions productId={product.id} />
            </ScrollReveal>
          </div>
        </div>
      </div>

      {/* Related Products — category-based recommendations */}
      {relatedProducts.length > 0 && (
        <HorizontalProductSection
          eyebrow="You May Also Like"
          title={`More From ${product.category}`}
          products={relatedProducts}
          viewAllTo={`/catalog?category=${encodeURIComponent(product.category)}`}
        />
      )}

      {/* Lightbox */}
      {lightbox && images[activeImg] && (
        <div className="fixed inset-0 z-50 bg-foreground/90 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setLightbox(false)}>
          <button className="absolute top-5 right-5 text-cream" aria-label="Close"><X className="w-7 h-7" /></button>
          <img src={images[activeImg]} alt={product.name} className="max-h-[90vh] max-w-[90vw] object-contain" />
        </div>
      )}
      
      {/* Product Chat */}
      <ProductChat product={product} open={isChatOpen} onClose={() => setIsChatOpen(false)} />
      {sizeGuideOpen && <SizeGuideModal product={product} onClose={() => setSizeGuideOpen(false)} />}
    </div>
  );
}