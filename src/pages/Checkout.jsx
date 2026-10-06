import { useState, useEffect, useCallback, useMemo } from "react";
import { Navigate, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useCart } from "@/lib/CartContext";
import { formatKwachaPrice } from "@/lib/utils";
import { priceCart, priceLine, formatMoney, toServerLines, authedFetch, fetchServerQuote } from "@/lib/cartPricing";
import {
  ShoppingBag,
  CreditCard,
  Lock,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  ArrowLeft,
  Info,
  Mail,
  ReceiptText,
  RefreshCw,
} from "lucide-react";

// Online payments via Payza (Airtel Money, MTN, Zamtel). The backend keys are
// configured and the signed webhook is verified end-to-end.
const PAYMENTS_ENABLED = true;

// Payment result states for the UI
const UI_STATE = {
  FORM: "form",
  PAYING: "paying",
  VERIFYING: "verifying",
  SUCCESS: "success",
  FAILED: "failed",
  PENDING: "pending",
  CLOSED: "closed",
};

export default function Checkout() {
  const { user, isAuthenticated } = useAuth();
  const { cart, removeFromCart, updateCartItemPrice } = useCart();
  const navigate = useNavigate();

  const [uiState, setUiState] = useState(UI_STATE.FORM);
  const [error, setError] = useState(null);
  const [orderInfo, setOrderInfo] = useState(null); // { orderNumber, reference }
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (user?.email && !email) setEmail(user.email);
  }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returning from Payza's hosted checkout: ?payza=return|cancelled&ref=...
  useEffect(() => {
    const flow = searchParams.get("payza");
    const ref = searchParams.get("ref");
    if (!flow || !ref) return;
    // While payments are disabled, just clean stale return parameters and
    // show the standard checkout instead of touching payment endpoints.
    if (!PAYMENTS_ENABLED) {
      setSearchParams({}, { replace: true });
      return;
    }
    let orderNumber = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem("sn_payza_ref") || "null");
      if (saved?.reference === ref) orderNumber = saved.orderNumber;
    } catch {
      /* ignore malformed storage */
    }
    // Clean the URL so a refresh does not re-enter the flow
    setSearchParams({}, { replace: true });
    if (/^[A-Za-z0-9._-]{6,100}$/.test(ref)) {
      setOrderInfo((prev) => prev || { orderNumber, reference: ref });
      if (flow === "cancelled") {
        // Customer backed out of the hosted checkout: cancel the attempt so a
        // retry gets a fresh reference. The cart is untouched.
        postJson("/api/payments/payza/cancel", { reference: ref }).catch(() => {});
        setUiState(UI_STATE.CLOSED);
      } else {
        verifyPayment(ref);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ONE calculation shared with the cart drawer (src/lib/cartPricing.js):
  //   line = unit price x quantity, total = sum of payable lines.
  // Items without one confirmed numeric price (price on request, ranges,
  // bundles like "K600 for 6") stay in the inquiry flow and are never guessed.
  const pricing = useMemo(() => priceCart(cart), [cart]);
  const payableItems = pricing.payableLines.map((l) => l.item);
  const inquiryOnlyItems = pricing.inquiryLines.map((l) => l.item);
  const rangeItems = inquiryOnlyItems.filter((item) => /\d\s*[-–]\s*[Kk]?\s*\d/.test(String(item.price || "")));
  const requestOnlyItems = inquiryOnlyItems.filter((item) => !rangeItems.includes(item));
  const getItemSubtotal = (item) => priceLine(item).subtotal ?? 0;
  const isConfirmedNumeric = (price) => priceLine({ price, quantity: 1 }).payable;
  const displayTotal = pricing.total;

  // The SERVER's own quote for the same lines. The amount actually charged is
  // always computed on the server from the live catalog; this just lets the
  // customer see that figure BEFORE paying and stops a surprise.
  const [quote, setQuote] = useState({ state: "idle", total: null, lines: [] });
  const quoteKey = JSON.stringify(toServerLines(pricing.payableLines));
  useEffect(() => {
    if (!isAuthenticated || pricing.payableLines.length === 0) {
      setQuote({ state: "idle", total: null, lines: [] });
      return undefined;
    }
    let cancelled = false;
    setQuote((q) => ({ ...q, state: "loading" }));
    fetchServerQuote(pricing.payableLines).then((r) => {
      if (cancelled) return;
      if (!r.ok) setQuote({ state: "error", total: null, lines: [], error: r.error });
      else setQuote({ state: "ready", total: r.total, lines: r.lines });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, isAuthenticated]);

  // Server and screen disagree (a price changed since the item was added)
  const priceChanged = quote.state === "ready" && Math.abs(quote.total - displayTotal) > 0.009;
  // A line the server can no longer sell online (removed, hidden, grade gone)
  const unavailableLines = quote.state === "ready" ? quote.lines.filter((l) => !l.payable) : [];
  const serverUnitPrice = (item) => {
    if (quote.state !== "ready") return null;
    const key = `${item.id}|${item.selectedSize || ""}|${item.selectedColor || ""}|${item.gradeName || item.selectedGrade?.name || ""}`;
    const l = quote.lines.find((x) => `${x.productId}|${x.size || ""}|${x.color || ""}|${x.gradeName || ""}` === key);
    return l && l.payable ? l.unitPrice : null;
  };
  const confirmedTotal = quote.state === "ready" ? quote.total : displayTotal;

  // Accept the new prices: update the cart's stored prices to the server's
  const acceptNewPrices = () => {
    for (const item of payableItems) {
      const p = serverUnitPrice(item);
      if (p != null && p !== priceLine(item).unitPrice) updateCartItemPrice(item.itemKey, p);
    }
  };

  const postJson = (path, body) => authedFetch(path, { method: "POST", body: JSON.stringify(body) });

  const handlePayWithPayza = async () => {
    setError(null);
    if (payableItems.length === 0) {
      setError("None of the items in your cart can be paid for online. Please use the inquiry flow for price-on-request items.");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address for your payment receipt.");
      return;
    }
    if (quote.state !== "ready") {
      setError("We are still confirming your prices. Please try again in a moment.");
      return;
    }
    if (unavailableLines.length > 0) {
      setError("One or more items can no longer be paid for online. Please remove them from your cart and try again.");
      return;
    }
    if (priceChanged) {
      setError("The price of one or more items has changed. Please review your order before continuing to payment.");
      return;
    }
    setUiState(UI_STATE.PAYING);
    try {
      // The server computes the real amount from the products table and
      // starts a hosted-checkout payment at Payza. The cart only sends line
      // identity (product, grade, size, color, quantity) — never a price.
      const { ok, payload } = await postJson("/api/payments/payza/create-order", {
        items: payableItems.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          size: item.selectedSize || null,
          color: item.selectedColor || null,
          gradeName: item.gradeName || item.selectedGrade?.name || null,
        })),
        customer: { email, phone, firstName, lastName },
      });
      if (!ok) {
        setError(payload?.error || "Could not start the payment. Please try again.");
        setUiState(UI_STATE.FORM);
        return;
      }

      setOrderInfo({ orderNumber: payload.orderNumber, reference: payload.reference, amount: payload.amount });
      // Keep the reference for the post-redirect return trip
      try {
        sessionStorage.setItem("sn_payza_ref", JSON.stringify({ reference: payload.reference, orderNumber: payload.orderNumber }));
      } catch {
        /* storage unavailable; the return URL still carries the reference */
      }

      // Redirect the customer to Payza's hosted checkout (Airtel Money,
      // MTN, Zamtel). Payza sends them back to /checkout when done.
      window.location.assign(payload.paymentUrl);
    } catch (err) {
      setError(err?.message || "The payment page could not be opened. Please try again.");
      setUiState(UI_STATE.FORM);
    }
  };

    const verifyPayment = useCallback(
    async (reference) => {
      setUiState(UI_STATE.VERIFYING);
      setError(null);
      try {
        const { ok, payload } = await postJson("/api/payments/payza/verify", { reference });
        if (!ok) {
          setError(payload?.error || "We could not confirm your payment. Please try verifying again.");
          setUiState(UI_STATE.FAILED);
          return;
        }
        if (payload.paymentStatus === "paid") {
          // Everything on the success page comes from the server's confirmed
          // order, never from the live cart (which may change afterwards).
          setOrderInfo((prev) => ({
            ...(prev || {}),
            orderNumber: payload.orderNumber || prev?.orderNumber,
            reference: reference,
            amount: payload.amountPaid,
            currency: payload.currency || "ZMW",
            receipt: payload.receipt || null,
          }));
          setUiState(UI_STATE.SUCCESS);
        } else if (payload.paymentStatus === "confirmation_pending") {
          setUiState(UI_STATE.PENDING);
        } else if (payload.paymentStatus === "failed") {
          setError("The payment did not go through. You can retry below.");
          setUiState(UI_STATE.FAILED);
        } else {
          setUiState(UI_STATE.PENDING);
        }
      } catch {
        setError("Network error while confirming your payment. Please check the status below.");
        setUiState(UI_STATE.PENDING);
      }
    },
    [] // postJson defined in component scope; stable enough for this page
  );

  // Remove only the successfully purchased lines from the local cart
  useEffect(() => {
    if (uiState === UI_STATE.SUCCESS && payableItems.length > 0) {
      payableItems.forEach((item) => {
        if (item.itemKey) removeFromCart(item.itemKey);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // ---------------------------------------------------------------------------
  // Status panels
  // ---------------------------------------------------------------------------
  const StatusPanel = ({ icon, title, message, children }) => (
    <div className="max-w-xl mx-auto text-center py-12 px-6 border border-border bg-card">
      <div className="mx-auto w-16 h-16 rounded-full border border-border flex items-center justify-center mb-5">{icon}</div>
      <h2 className="font-display text-2xl tracking-wide uppercase mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground mb-6">{message}</p>
      {children}
    </div>
  );

  if (cart.length === 0 && uiState !== UI_STATE.SUCCESS) {
    return (
      <div className="pt-24 md:pt-32 pb-bottomnav xl:pb-8 px-4 md:px-8 max-w-5xl mx-auto min-h-[calc(100vh-100px)]">
        <h1 className="font-display text-3xl md:text-4xl mb-6">Checkout</h1>
        <StatusPanel
          icon={<ShoppingBag className="w-7 h-7 stroke-[1.2] text-muted-foreground" />}
          title="Your cart is empty"
          message="Add products to your cart to check out."
        >
          <Link to="/catalog" className="inline-flex items-center gap-2 text-[11px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">
            Continue Shopping
          </Link>
        </StatusPanel>
      </div>
    );
  }

  return (
    <div className="pt-24 md:pt-32 pb-bottomnav xl:pb-8 px-4 md:px-8 max-w-6xl mx-auto min-h-[calc(100vh-100px)]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl md:text-4xl">Checkout</h1>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-[11px] tracking-wide-2 uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {uiState === UI_STATE.SUCCESS && (
        <div className="max-w-xl mx-auto text-center py-10 px-6 border border-border bg-card" data-testid="payment-success">
          <div className="mx-auto w-16 h-16 rounded-full border border-[#C5A059]/60 flex items-center justify-center mb-5">
            <CheckCircle2 className="w-8 h-8 text-[#C5A059]" />
          </div>
          <h2 className="font-display text-2xl tracking-wide uppercase mb-1">Payment Successful</h2>
          <p className="text-sm text-muted-foreground mb-6">Thank you for your purchase.</p>

          <dl className="text-left text-sm border-t border-border divide-y divide-border mb-6">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Order #</dt>
              <dd className="font-medium">{orderInfo?.orderNumber || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Amount paid</dt>
              <dd className="font-display text-lg">{orderInfo?.amount != null ? formatMoney(orderInfo.amount) : "-"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Payment reference</dt>
              <dd className="font-medium break-all text-right">{orderInfo?.reference || "-"}</dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted-foreground">Receipt</dt>
              <dd className="text-right">
                {/* Only claim the email went out if the server says it did. */}
                {orderInfo?.receipt?.emailStatus === "sent" ? (
                  <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#C5A059]" /> Sent to {orderInfo.receipt.email}</span>
                ) : orderInfo?.receipt ? (
                  <span className="text-muted-foreground">Email on its way. Your receipt is saved in My Orders.</span>
                ) : (
                  <span className="text-muted-foreground">Being prepared. It will appear in My Orders.</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/account/orders" className="inline-flex items-center gap-2 px-6 py-3 text-[11px] tracking-wide-2 uppercase bg-[#C5A059] text-black hover:bg-[#b8914f] transition-colors">
              <ReceiptText className="w-4 h-4" /> View Order
            </Link>
            <Link to="/catalog" className="inline-flex items-center gap-2 px-6 py-3 text-[11px] tracking-wide-2 uppercase border border-foreground hover:bg-foreground hover:text-background transition-colors">
              Continue Shopping
            </Link>
          </div>
        </div>
      )}

      {(uiState === UI_STATE.PENDING || uiState === UI_STATE.FAILED || uiState === UI_STATE.CLOSED) && (
        <StatusPanel
          icon={
            uiState === UI_STATE.PENDING ? (
              <Clock className="w-8 h-8 text-muted-foreground" />
            ) : (
              <XCircle className="w-8 h-8 text-muted-foreground" />
            )
          }
          title={
            uiState === UI_STATE.PENDING
              ? "Awaiting Confirmation"
              : uiState === UI_STATE.FAILED
              ? "Payment Failed"
              : "Payment Cancelled"
          }
          message={
            uiState === UI_STATE.PENDING
              ? "Your payment is being confirmed by the provider. You can check its status below at any time. No receipt is sent until the payment is confirmed."
              : uiState === UI_STATE.FAILED
              ? error || "The payment did not go through and you have not been charged for this order. You can safely retry below."
              : "You cancelled the payment before completing it. Your cart is untouched."
          }
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {(uiState === UI_STATE.PENDING || uiState === UI_STATE.FAILED || uiState === UI_STATE.CLOSED) && orderInfo?.reference && (
              <button
                onClick={() => verifyPayment(orderInfo.reference)}
                className="inline-flex items-center gap-2 px-6 py-3 text-[11px] tracking-wide-2 uppercase border border-foreground hover:bg-foreground hover:text-background transition-colors"
              >
                <Clock className="w-4 h-4" /> Check Payment Status
              </button>
            )}
            {(uiState === UI_STATE.FAILED || uiState === UI_STATE.CLOSED) && (
              <button
                onClick={() => setUiState(UI_STATE.FORM)}
                className="inline-flex items-center gap-2 px-6 py-3 text-[11px] tracking-wide-2 uppercase bg-[#C5A059] text-black hover:bg-[#b8914f] transition-colors"
              >
                <CreditCard className="w-4 h-4" /> Retry Payment
              </button>
            )}
          </div>
        </StatusPanel>
      )}

      {uiState === UI_STATE.FORM && (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Order summary */}
          <section>
            <h2 className="font-display text-lg tracking-wide uppercase mb-4 border-b border-border pb-2">Order Summary</h2>
            <div className="space-y-4">
              {cart.map((item) => (
                <div key={item.itemKey || item.id} className="flex gap-4 border border-border p-3">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-16 h-20 object-cover flex-shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-16 h-20 bg-muted flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                    <p className="text-[10px] tracking-wide-2 uppercase text-muted-foreground mt-0.5">
                      {item.category} {item.gradeName ? `• ${item.gradeName}` : ""}
                      {item.selectedSize ? ` • Size ${item.selectedSize}` : ""}
                      {item.selectedColor ? ` • ${item.selectedColor}` : ""}
                    </p>
                    <p className="text-sm mt-1" data-testid="summary-line">
                      {isConfirmedNumeric(item.price) ? (
                        <>
                          {formatMoney(priceLine(item).unitPrice)} × {priceLine(item).quantity}
                          <span className="text-muted-foreground"> = </span>
                          <span className="font-medium">{formatMoney(getItemSubtotal(item))}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{formatKwachaPrice(item.price)} × {item.quantity}</span>
                      )}
                    </p>
                    {isConfirmedNumeric(item.price) && serverUnitPrice(item) != null && serverUnitPrice(item) !== priceLine(item).unitPrice && (
                      <p className="text-[11px] mt-1 text-[#C5A059]">
                        Price is now {formatMoney(serverUnitPrice(item))} each
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {inquiryOnlyItems.length > 0 && (
              <div className="mt-4 border border-border bg-muted/30 p-3 flex gap-3 items-start">
                <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  {rangeItems.length > 0 && (
                    <>
                      {rangeItems.length} item{rangeItems.length > 1 ? "s" : ""} with a price range
                      {requestOnlyItems.length > 0 ? " and " : " "}
                    </>
                  )}
                  {requestOnlyItems.length > 0 && (
                    <>
                      {requestOnlyItems.length} item{requestOnlyItems.length > 1 ? "s" : ""} priced on request
                    </>
                  )}
                  {" "}will stay in your cart for the inquiry flow and {inquiryOnlyItems.length > 1 ? "are" : "is"} not
                  included in the order total below.
                </p>
              </div>
            )}
            {priceChanged && (
              <div className="mt-4 border border-[#C5A059]/60 bg-[#C5A059]/10 p-3 flex gap-3 items-start" role="alert">
                <AlertCircle className="w-4 h-4 text-[#C5A059] flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p>The price of one or more items has changed. Please review your order before continuing to payment.</p>
                  <button onClick={acceptNewPrices} className="mt-2 inline-flex items-center gap-1.5 text-[11px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">
                    <RefreshCw className="w-3 h-3" /> Update to current prices ({formatMoney(quote.total)})
                  </button>
                </div>
              </div>
            )}
            {unavailableLines.length > 0 && (
              <div className="mt-4 border border-border bg-muted/30 p-3 flex gap-3 items-start" role="alert">
                <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  {unavailableLines.length} item{unavailableLines.length > 1 ? "s" : ""} in your cart can no longer be paid for online.
                  Remove {unavailableLines.length > 1 ? "them" : "it"} to continue.
                </p>
              </div>
            )}
            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <span className="text-[11px] tracking-wide-2 uppercase text-muted-foreground">
                Order Total ({pricing.units} {pricing.units === 1 ? "item" : "items"})
              </span>
              <span className="font-display text-2xl" data-testid="checkout-total">{formatMoney(confirmedTotal)}</span>
            </div>
            <p className="mt-1 text-[10px] tracking-wide-2 uppercase text-muted-foreground flex items-center gap-1.5">
              {quote.state === "loading" && (<><Loader2 className="w-3 h-3 animate-spin" /> Confirming prices</>)}
              {quote.state === "ready" && !priceChanged && "Prices confirmed. This is the amount you will pay."}
              {quote.state === "error" && "Could not confirm prices right now."}
            </p>
            {inquiryOnlyItems.length > 0 && (
              <p className="mt-2 text-[10px] tracking-wide-2 uppercase text-muted-foreground">
                Final amount is confirmed once the price-on-request items above are settled
              </p>
            )}
          </section>

          {/* Customer + payment */}
          <section>
            <h2 className="font-display text-lg tracking-wide uppercase mb-4 border-b border-border pb-2">Your Details</h2>
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <label className="block sm:col-span-2">
                <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Email *</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full bg-transparent border border-border px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors"
                  placeholder="you@email.com"
                  required
                />
              </label>
              <label className="block">
                <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Phone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full bg-transparent border border-border px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors"
                  placeholder="097X XXX XXX"
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">First name</span>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1 w-full bg-transparent border border-border px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">Last name</span>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1 w-full bg-transparent border border-border px-3 py-2.5 text-sm outline-none focus:border-foreground transition-colors"
                  />
                </label>
              </div>
            </div>

            {error && (
              <div className="mb-4 border border-border bg-muted/30 p-3 flex gap-3 items-start text-sm">
                <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-muted-foreground">{error}</p>
              </div>
            )}

            {PAYMENTS_ENABLED ? (
              <>
                <button
                  onClick={handlePayWithPayza}
                  disabled={payableItems.length === 0 || quote.state !== "ready" || priceChanged || unavailableLines.length > 0}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 text-[12px] tracking-wide-2 uppercase bg-[#C5A059] text-black hover:bg-[#b8914f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <CreditCard className="w-4 h-4" /> Pay {formatMoney(confirmedTotal)} with Payza
                </button>
                <p className="mt-3 flex items-center gap-2 text-[10px] tracking-wide-2 uppercase text-muted-foreground">
                  <Lock className="w-3.5 h-3.5" /> Airtel Money, MTN & Zamtel • Secured by Payza
                </p>
              </>
            ) : (
              <div className="border border-border bg-muted/30 p-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full border border-border flex items-center justify-center mb-4">
                  <Clock className="w-5 h-5 text-[#C5A059]" aria-hidden="true" />
                </div>
                <p className="font-display text-lg tracking-wide uppercase">Payment Method Coming Soon</p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Online payments are being finalized and will be available shortly. Your cart is saved
                  exactly as it is. In the meantime, items can still be reserved through an inquiry or
                  arranged directly over WhatsApp.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {(uiState === UI_STATE.PAYING || uiState === UI_STATE.VERIFYING) && (
        <div className="max-w-xl mx-auto text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#C5A059] mb-4" />
          <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground">
            {uiState === UI_STATE.PAYING ? "Opening secure payment window..." : "Confirming your payment..."}
          </p>
        </div>
      )}
    </div>
  );
}
