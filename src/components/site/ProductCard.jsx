import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart, Plus, Check } from "lucide-react";
import { buildWhatsAppUrl, productInquiryMessage } from "@/lib/whatsapp";
import { formatKwachaPrice } from "@/lib/utils";
import { recordProductView } from "@/lib/recommendations";
import { useCart } from "@/lib/CartContext";
import { toast } from "@/components/ui/use-toast";

const STATUS_STYLES = {
  available: "bg-foreground text-background",
  preorder: "border border-foreground text-foreground",
  soldout: "bg-muted text-muted-foreground",
};

const STATUS_LABELS = {
  available: "Available",
  preorder: "Pre-Order",
  soldout: "Sold Out",
};

export default function ProductCard({ product }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const { addToCart, removeFromCart, isInCart, toggleWishlist, isInWishlist } = useCart();

  const img = product.images?.[0];
  const status = product.status || "available";
  const inCart = isInCart(product.id);
  const inWishlist = isInWishlist(product.id);

  const handleWishlistToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isSaved = toggleWishlist(product);
    toast({
      title: isSaved ? "Saved to Wishlist" : "Removed from Wishlist",
      description: isSaved
        ? `${product.name} has been added to your favorites.`
        : `${product.name} was removed from your favorites.`,
    });
  };

  const handleCartToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inCart) {
      removeFromCart(product.id);
      toast({
        title: "Removed from Cart",
        description: `${product.name} removed from your inquiry selections.`,
      });
    } else {
      addToCart(product, {
        quantity: 1,
        selectedImage: img,
        openDrawer: true,
      });
      toast({
        title: "Added to Inquiry Cart",
        description: `${product.name} is ready for quote request.`,
      });
    }
  };

  const handleCardClick = () => {
    recordProductView(product);
  };

  // Lowest available grade price for graded products ("From K...")
  const lowestGradePrice = (product.grades || [])
    .map((g) => parseFloat(String(g.price ?? "").replace(/[^0-9.]/g, "")))
    .filter((n) => !Number.isNaN(n) && n > 0)
    .sort((a, b) => a - b)[0] || product.price;

  return (
    <div className="group snap-start relative h-full flex flex-col justify-between">
      <div>
        <Link to={`/product/${product.id}`} onClick={handleCardClick} className="block">
          <div className="relative aspect-[3/4] overflow-hidden bg-zinc-900">
            {/* Skeleton while loading */}
            {img && !imageLoaded && (
              <div className="absolute inset-0 bg-zinc-800/60 animate-pulse flex items-center justify-center">
                <span className="text-[9px] tracking-luxe text-zinc-500 uppercase">SN</span>
              </div>
            )}
            {img ? (
              <img
                src={img}
                alt={product.name}
                loading="lazy"
                decoding="async"
                onLoad={() => setImageLoaded(true)}
                className={`w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-105 ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs tracking-wide-2">SOURCED NEXUS</div>
            )}
            <span className={`absolute top-3 left-3 text-[9px] tracking-wide-2 uppercase px-2.5 py-1 z-10 ${STATUS_STYLES[status]}`}>
              {STATUS_LABELS[status]}
            </span>

            {/* Quick Wishlist / Favorites Button */}
            <button
              type="button"
              onClick={handleWishlistToggle}
              title={inWishlist ? "Remove from Wishlist" : "Save to Wishlist"}
              aria-label={inWishlist ? "Remove from Wishlist" : "Save to Wishlist"}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm border border-border/60 flex items-center justify-center text-foreground hover:bg-background transition-all hover:scale-110"
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  inWishlist ? "fill-red-500 text-red-500" : "text-foreground/70"
                }`}
              />
            </button>
          </div>
        </Link>
        <div className="mt-3.5 space-y-1">
          <p className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">{product.category}</p>
          <Link to={`/product/${product.id}`} onClick={handleCardClick} className="block">
            <h3
              className="font-display text-xl leading-snug hover:text-foreground/70 transition-colors line-clamp-2 min-h-[3.25rem] flex items-start"
              title={product.name}
            >
              {product.name}
            </h3>
          </Link>
        </div>
      </div>

      {/* Price + quick add */}
      <div className="flex items-center justify-between gap-3 pt-3 mt-auto">
        <Link to={`/product/${product.id}`} onClick={handleCardClick} className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {product.grades?.length
              ? <>From {formatKwachaPrice(lowestGradePrice)}</>
              : formatKwachaPrice(product.price)}
          </p>
        </Link>
        <button
          type="button"
          onClick={handleCartToggle}
          title={inCart ? "Remove from Cart" : "Add to Cart"}
          aria-label={inCart ? "Remove from Cart" : "Add to Cart"}
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
            inCart
              ? "bg-[#C5A059] text-black hover:bg-[#b08e4d]"
              : "bg-foreground text-background hover:opacity-85"
          }`}
        >
          {inCart ? <Check className="w-4 h-4 stroke-[2.5]" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}