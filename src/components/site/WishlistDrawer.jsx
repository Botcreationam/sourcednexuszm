import { Link } from "react-router-dom";
import { X, Heart, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/CartContext";
import { formatKwachaPrice } from "@/lib/utils";

export default function WishlistDrawer() {
  const {
    wishlist,
    wishlistCount,
    isWishlistOpen,
    closeWishlist,
    removeFromWishlist,
    clearWishlist,
    addToCart,
    openCart,
  } = useCart();

  if (!isWishlistOpen) return null;

  const handleMoveToCart = (product) => {
    addToCart(product, { quantity: 1, openDrawer: false });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300"
        onClick={closeWishlist}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md bg-zinc-950 border-l border-zinc-800 text-foreground flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
            <div className="flex items-center gap-2.5">
              <Heart className="w-5 h-5 text-red-500 fill-red-500" />
              <div>
                <h2 className="font-display text-lg tracking-wide uppercase">Saved / Wishlist</h2>
                <p className="text-[10px] tracking-wide-2 text-zinc-400 uppercase">
                  {wishlistCount} {wishlistCount === 1 ? "Product" : "Products"} Saved
                </p>
              </div>
            </div>
            <button
              onClick={closeWishlist}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
              aria-label="Close wishlist drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {wishlist.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                  <Heart className="w-8 h-8 stroke-[1.2]" />
                </div>
                <div>
                  <p className="font-display text-xl text-white">Your Wishlist is Empty</p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-[260px]">
                    Tap the heart icon on any piece to save your favorite luxury items for later.
                  </p>
                </div>
                <button
                  onClick={closeWishlist}
                  className="mt-2 inline-flex items-center gap-2 text-[11px] tracking-wide-2 uppercase border border-[#C5A059] text-[#C5A059] px-5 py-2.5 hover:bg-[#C5A059] hover:text-black transition-colors"
                >
                  Browse Collection <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {wishlist.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 border border-zinc-800/90 bg-zinc-900/40 flex gap-3.5 items-start group"
                  >
                    <div className="w-20 h-24 bg-zinc-900 border border-zinc-800/80 overflow-hidden flex-shrink-0">
                      {item.image || item.images?.[0] ? (
                        <img
                          src={item.image || item.images?.[0]}
                          alt={item.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] text-zinc-600 tracking-wide uppercase">
                          Sourced Nexus
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/product/${item.id}`}
                            onClick={closeWishlist}
                            className="font-display text-sm text-white hover:text-[#C5A059] transition-colors line-clamp-1"
                          >
                            {item.name}
                          </Link>
                          <button
                            onClick={() => removeFromWishlist(item.id)}
                            className="text-zinc-500 hover:text-red-400 p-0.5 transition-colors"
                            title="Remove from Wishlist"
                            aria-label={`Remove ${item.name} from wishlist`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <p className="text-[10px] tracking-wide-2 uppercase text-zinc-400 mt-0.5">
                          {item.category}
                        </p>
                        <p className="text-xs font-light text-zinc-300 mt-1">
                          {formatKwachaPrice(item.price)}
                        </p>
                      </div>

                      <div className="pt-2 mt-2 border-t border-zinc-850 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => handleMoveToCart(item)}
                          className="inline-flex items-center gap-1.5 text-[10px] tracking-wide-2 uppercase bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 transition-colors"
                        >
                          <ShoppingBag className="w-3 h-3 text-[#C5A059]" />
                          Add to Cart
                        </button>

                        <Link
                          to={`/product/${item.id}`}
                          onClick={closeWishlist}
                          className="text-[10px] tracking-wide-2 uppercase text-zinc-400 hover:text-white"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={() => {
                      // Add all to cart
                      wishlist.forEach((p) => addToCart(p, { quantity: 1, openDrawer: false }));
                      closeWishlist();
                      openCart();
                    }}
                    className="text-[10px] tracking-wide-2 uppercase text-[#C5A059] hover:underline"
                  >
                    Add All to Cart →
                  </button>
                  <button
                    onClick={clearWishlist}
                    className="text-[10px] tracking-wide-2 uppercase text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
