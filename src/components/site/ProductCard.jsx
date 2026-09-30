import { useState } from "react";
import { Link } from "react-router-dom";
import { buildWhatsAppUrl, productInquiryMessage } from "@/lib/whatsapp";

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
  const img = product.images?.[0];
  const status = product.status || "available";

  return (
    <div className="group snap-start">
      <Link to={`/product/${product.id}`} className="block">
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
        </div>
      </Link>
      <div className="mt-4 space-y-1">
        <p className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">{product.category}</p>
        <Link to={`/product/${product.id}`}>
          <h3 className="font-display text-xl leading-snug hover:text-foreground/70 transition-colors">{product.name}</h3>
        </Link>
        <p className="text-sm font-light">{product.price || "Price on request"}</p>
        <div className="flex gap-2 pt-2">
          <Link
            to={`/product/${product.id}`}
            className="flex-1 text-center text-[10px] tracking-wide-2 uppercase border border-foreground/30 py-2.5 hover:bg-foreground hover:text-background transition-colors"
          >
            View Details
          </Link>
          <a
            href={buildWhatsAppUrl(productInquiryMessage(product.name))}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-[10px] tracking-wide-2 uppercase bg-[#1f7a4c] text-white py-2.5 hover:bg-[#165c39] transition-colors"
          >
            Order
          </a>
        </div>
      </div>
    </div>
  );
}