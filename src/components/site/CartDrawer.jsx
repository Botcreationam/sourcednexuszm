import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, ShieldCheck, CreditCard, Loader2 } from "lucide-react";
import { useCart } from "@/lib/CartContext";
import { formatKwachaPrice } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { priceCart, priceLine, formatMoney } from "@/lib/cartPricing";
import { productPath } from "@/lib/productUrl";

export default function CartDrawer() {
  const {
    cart,
    cartCount,
    isCartOpen,
    closeCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    openInquiryModal,
  } = useCart();

  const navigate = useNavigate();
  const { toast } = useToast();
  const [isClearing, setIsClearing] = useState(false);

  // Only report success once the underlying persistent clear is confirmed —
  // never show "Cart cleared" for an operation that silently failed.
  const handleClearCart = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      const result = await clearCart();
      if (result?.success) {
        toast({ title: "Cart cleared", description: "All items have been removed from your cart." });
      } else {
        toast({
          title: "Unable to clear your cart",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsClearing(false);
    }
  };

  if (!isCartOpen) return null;

  // One calculation: line = price x quantity, total = sum of payable lines.
  const pricing = priceCart(cart);

  const handleStartInquiry = () => {
    closeCart();
    openInquiryModal(cart);
  };

  const handleGoToCheckout = () => {
    closeCart();
    navigate("/checkout");
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300"
        onClick={closeCart}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md bg-zinc-950 border-l border-zinc-800 text-foreground flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
          {/* Drawer Header */}
          <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5 text-[#C5A059]" />
              <div>
                <h2 className="font-display text-lg tracking-wide uppercase">Your Cart</h2>
                <p className="text-[10px] tracking-wide-2 text-zinc-400 uppercase">
                  {cartCount} {cartCount === 1 ? "Item" : "Items"} Selected
                </p>
              </div>
            </div>
            <button
              onClick={closeCart}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
              aria-label="Close cart drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                  <ShoppingBag className="w-8 h-8 stroke-[1.2]" />
                </div>
                <div>
                  <p className="font-display text-xl text-white">Your Cart is Empty</p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-[260px]">
                    Browse our curated collections and add pieces to request personalized quotes or pre-orders.
                  </p>
                </div>
                <button
                  onClick={closeCart}
                  className="mt-2 inline-flex items-center gap-2 text-[11px] tracking-wide-2 uppercase border border-[#C5A059] text-[#C5A059] px-5 py-2.5 hover:bg-[#C5A059] hover:text-black transition-colors"
                >
                  Explore Collection <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map((item) => (
                  <div
                    key={item.itemKey || item.id}
                    className="p-3.5 border border-zinc-800/90 bg-zinc-900/40 relative group flex gap-3.5 items-start"
                  >
                    {/* Exact Product Image */}
                    <div className="w-20 h-24 bg-zinc-900 border border-zinc-800/80 overflow-hidden flex-shrink-0 relative">
                      {item.image ? (
                        <img
                          src={item.image}
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

                    {/* Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={item.isBundle ? `/bundles/${item.bundleId || item.id}` : productPath({ id: item.id, name: item.name })}
                            onClick={closeCart}
                            className="font-display text-sm text-white hover:text-[#C5A059] transition-colors line-clamp-1"
                          >
                            {item.name}
                          </Link>
                          <button
                            onClick={() => removeFromCart(item.itemKey)}
                            className="text-zinc-500 hover:text-red-400 p-0.5 transition-colors"
                            title="Remove from Cart"
                            aria-label={`Remove ${item.name} from cart`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <p className="text-[10px] tracking-wide-2 uppercase text-zinc-400 mt-0.5">
                          {item.isBundle ? "Bundle" : item.category}
                        </p>

                        {item.isBundle && (item.bundleComponents || []).length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 text-[10px] text-zinc-400" data-testid="drawer-bundle-contents">
                            {item.bundleComponents.map((c) => (
                              <li key={c.productId} className="truncate">
                                {c.quantity} × {c.name}{c.size ? ` · ${c.size}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {item.selectedSize && (
                            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 bg-zinc-800/90 border border-zinc-700/60 text-zinc-300">
                              Size: {item.selectedSize}
                            </span>
                          )}
                          {item.selectedColor && (
                            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 bg-zinc-800/90 border border-zinc-700/60 text-zinc-300">
                              Color: {item.selectedColor}
                            </span>
                          )}
                          {item.gradeName && (
                            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 bg-[#C5A059]/15 border border-[#C5A059]/50 text-[#C5A059]">
                              Grade: {item.gradeName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quantity stepper & Pricing indicator */}
                      <div className="flex items-center justify-between pt-2 mt-2 border-t border-zinc-850">
                        <div className="flex items-center border border-zinc-800 bg-zinc-900">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.itemKey, item.quantity - 1)}
                            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-7 text-center text-xs font-mono font-medium text-white">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.itemKey, item.quantity + 1)}
                            className="w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="flex flex-col items-end gap-0.5 text-xs font-light text-zinc-300">
                          {(() => {
                            const line = priceLine(item);
                            return line.payable ? (
                              <>
                                {(item.gradeDiscount || item.gradeOriginalPrice) ? (
                                  <span className="flex items-center gap-1.5">
                                    {item.gradeDiscount ? (
                                      <span className="text-[9px] uppercase font-semibold bg-red-500/15 text-red-400 border border-red-500/40 px-1 py-0.5">
                                        {String(item.gradeDiscount).includes("%") ? item.gradeDiscount : `${item.gradeDiscount}% OFF`}
                                      </span>
                                    ) : null}
                                    {item.gradeOriginalPrice ? (
                                      <span className="line-through decoration-zinc-600 text-zinc-500 text-[10px]">
                                        {formatKwachaPrice(item.gradeOriginalPrice)}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : null}
                                <span className="text-[10px] text-zinc-500">
                                  {formatMoney(line.unitPrice)} × {line.quantity}
                                </span>
                                <span className="text-sm font-medium text-white" data-testid="line-subtotal">
                                  {formatMoney(line.subtotal)}
                                </span>
                              </>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                                {formatKwachaPrice(item.price)}
                              </span>
                            );
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleClearCart}
                    disabled={isClearing}
                    className="inline-flex items-center gap-1.5 text-[10px] tracking-wide-2 uppercase text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    {isClearing && <Loader2 className="w-3 h-3 animate-spin" />}
                    Clear All Items
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          {cart.length > 0 && (
            <div className="p-6 border-t border-zinc-800 bg-zinc-900/60 space-y-3.5">
              {pricing.payableLines.length > 0 ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 uppercase tracking-wide-2">
                      Order Total ({pricing.units} {pricing.units === 1 ? "item" : "items"})
                    </span>
                    <span className="font-display text-xl text-white" data-testid="order-total">
                      {formatMoney(pricing.total)}
                    </span>
                  </div>
                  {pricing.inquiryLines.length > 0 && (
                    <p className="text-[10px] text-zinc-500 leading-normal">
                      {pricing.inquiryLines.length} item{pricing.inquiryLines.length > 1 ? "s are" : " is"} priced on request
                      and not included in this total. Send an inquiry for {pricing.inquiryLines.length > 1 ? "those" : "that one"}.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 uppercase tracking-wide-2">Pricing</span>
                  <span className="font-medium text-[#C5A059] uppercase tracking-wide-2">Price on Request</span>
                </div>
              )}

              <p className="text-[10px] text-zinc-500 leading-normal">
                Pay online for items with a confirmed price, or send an inquiry to receive a confirmed Lusaka delivery quote and timeline.
              </p>

              <button
                onClick={handleStartInquiry}
                className="w-full bg-[#C5A059] hover:bg-[#b08e4d] text-black py-3.5 px-4 text-xs tracking-wide-2 uppercase font-medium transition-colors flex items-center justify-center gap-2"
              >
                <span>Request a Quote / Send Inquiry</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Online payments via Payza (only for confirmed-price items) */}
              {pricing.payableLines.length > 0 && (
                <button
                  onClick={handleGoToCheckout}
                  className="w-full border border-[#C5A059]/60 hover:border-[#C5A059] text-foreground py-3.5 px-4 text-xs tracking-wide-2 uppercase font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4 text-[#C5A059]" />
                  <span>Checkout {formatMoney(pricing.total)}</span>
                </button>
              )}

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Exact selected product images and IDs are preserved</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
