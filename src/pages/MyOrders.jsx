import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { authedFetch, formatMoney } from "@/lib/cartPricing";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  ReceiptText,
  Package,
  CheckCircle2,
  Clock,
  XCircle,
  Mail,
  RefreshCw,
  X,
  ShoppingBag,
} from "lucide-react";

// "My Orders": the signed-in customer's own orders and receipts.
// Everything is fetched from /api/shop/*, which filters by the verified user
// on the server. A receipt shows the numbers frozen at purchase time.

const PAYMENT_LABELS = {
  paid: "Paid",
  pending: "Awaiting payment",
  confirmation_pending: "Confirming",
  failed: "Failed",
  cancelled: "Cancelled",
};

function StatusBadge({ status }) {
  const paid = status === "paid";
  const bad = status === "failed" || status === "cancelled";
  const Icon = paid ? CheckCircle2 : bad ? XCircle : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 border text-[10px] tracking-wide-2 uppercase ${
        paid ? "border-[#C5A059]/60 text-[#C5A059]" : "border-border text-muted-foreground"
      }`}
    >
      <Icon className="w-3 h-3" />
      {PAYMENT_LABELS[status] || status}
    </span>
  );
}

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

function ReceiptModal({ orderNumber, onClose }) {
  const { toast } = useToast();
  const [state, setState] = useState({ loading: true, receipt: null, error: null });
  const [resending, setResending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authedFetch(`/api/shop/receipt?order=${encodeURIComponent(orderNumber)}`).then(({ ok, payload }) => {
      if (cancelled) return;
      if (ok && payload.receipt) setState({ loading: false, receipt: payload.receipt, error: null });
      else setState({ loading: false, receipt: null, error: payload?.error || "Receipt not found." });
    });
    return () => { cancelled = true; };
  }, [orderNumber]);

  const resend = async () => {
    setResending(true);
    const { ok, status, payload } = await authedFetch("/api/shop/receipt/resend", {
      method: "POST",
      body: JSON.stringify({ orderNumber }),
    });
    setResending(false);
    if (ok && payload.emailed) {
      setState((s) => ({ ...s, receipt: { ...s.receipt, emailStatus: "sent" } }));
      toast({ title: "Receipt sent", description: "Check your inbox." });
    } else if (status === 429) {
      toast({ title: "Already sent", description: payload.error });
    } else {
      toast({
        title: "Could not send the email right now",
        description: "Your receipt is saved here, and we will keep trying.",
        variant: "destructive",
      });
    }
  };

  const r = state.receipt;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Payment receipt">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-background border border-border p-6 sm:p-8">
        <button onClick={onClose} className="absolute top-3 right-3 p-2 text-muted-foreground hover:text-foreground" aria-label="Close receipt">
          <X className="w-5 h-5" />
        </button>

        {state.loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : state.error ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{state.error}</p>
        ) : (
          <>
            <p className="text-[10px] tracking-wide-2 uppercase text-[#C5A059]">Payment receipt</p>
            <h2 className="font-display text-2xl mt-1">Order #{r.orderNumber}</h2>

            <dl className="mt-5 text-sm divide-y divide-border border-y border-border">
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-muted-foreground">Receipt</dt><dd className="font-medium">{r.receiptNumber}</dd></div>
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-muted-foreground">Date</dt><dd>{fmtDate(r.paidAt)}</dd></div>
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status="paid" /></dd></div>
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-muted-foreground">Method</dt><dd>{r.paymentMethod}</dd></div>
              <div className="flex justify-between gap-4 py-2.5"><dt className="text-muted-foreground">Reference</dt><dd className="font-medium break-all text-right">{r.paymentReference}</dd></div>
            </dl>

            <table className="w-full mt-5 text-sm">
              <thead>
                <tr className="text-[10px] tracking-wide-2 uppercase text-muted-foreground text-left">
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 font-medium text-right">Qty</th>
                  <th className="py-2 font-medium text-right">Unit</th>
                  <th className="py-2 font-medium text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((i, idx) => (
                  <tr key={idx} className="border-t border-border/60 align-top">
                    <td className="py-2.5 pr-2">
                      {i.name}
                      {(i.grade || i.size || i.color) && (
                        <span className="block text-[11px] text-muted-foreground">
                          {[i.grade, i.size && `Size ${i.size}`, i.color].filter(Boolean).join(" • ")}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">{i.quantity}</td>
                    <td className="py-2.5 text-right whitespace-nowrap">{formatMoney(i.unit_price)}</td>
                    <td className="py-2.5 text-right whitespace-nowrap font-medium">{formatMoney(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 pt-4 border-t-2 border-foreground flex items-baseline justify-between">
              <span className="text-[11px] tracking-wide-2 uppercase text-muted-foreground">Total paid</span>
              <span className="font-display text-3xl">{formatMoney(r.total)}</span>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {r.emailStatus === "sent" ? `Emailed to ${r.customerEmail}` : "Email not delivered yet"}
              </p>
              <button
                onClick={resend}
                disabled={resending}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] tracking-wide-2 uppercase border border-foreground hover:bg-foreground hover:text-background disabled:opacity-50 transition-colors"
              >
                {resending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                {r.emailStatus === "sent" ? "Email it again" : "Send to my email"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function MyOrders() {
  const { user, isLoadingAuth } = useAuth();
  const [state, setState] = useState({ loading: true, orders: [], error: null });
  const [openReceipt, setOpenReceipt] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { ok, payload } = await authedFetch("/api/shop/orders");
    if (ok && payload.success) setState({ loading: false, orders: payload.orders, error: null });
    else setState({ loading: false, orders: [], error: payload?.error || "Could not load your orders." });
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (isLoadingAuth) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (!user) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent("/account/orders")}`} replace />;
  }

  // Unpaid attempts are not "orders" to the customer; show paid first, then
  // anything still in progress so a pending payment is never invisible.
  const paid = state.orders.filter((o) => o.paymentStatus === "paid");
  const other = state.orders.filter((o) => o.paymentStatus !== "paid");

  return (
    <div className="pt-24 md:pt-32 pb-bottomnav xl:pb-12 px-4 md:px-8 max-w-4xl mx-auto min-h-[calc(100vh-100px)]">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl md:text-4xl">My Orders</h1>
        <button onClick={load} className="p-2 border border-border hover:border-foreground transition-colors" aria-label="Refresh orders">
          <RefreshCw className={`w-4 h-4 ${state.loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {state.loading && state.orders.length === 0 ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : state.error ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{state.error}</p>
      ) : state.orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-12 border border-border text-center">
          <Package className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You have no orders yet.</p>
          <Link to="/catalog" className="inline-flex items-center gap-2 text-[11px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">
            <ShoppingBag className="w-3.5 h-3.5" /> Start shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {[...paid, ...other].map((o) => (
            <article key={o.orderNumber} className="border border-border p-4 sm:p-5" data-testid="order-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Order #{o.orderNumber}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(o.paidAt || o.createdAt)}</p>
                </div>
                <StatusBadge status={o.paymentStatus} />
              </div>

              <ul className="mt-3 text-sm space-y-1">
                {o.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      {i.name}
                      {i.grade ? <span className="text-muted-foreground"> • {i.grade}</span> : null}
                      <span className="text-muted-foreground"> × {i.quantity}</span>
                    </span>
                    <span className="whitespace-nowrap text-muted-foreground">{formatMoney(i.lineTotal)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <p className="font-display text-xl">{formatMoney(o.total)}</p>
                {o.paymentStatus === "paid" && o.hasReceipt ? (
                  <button
                    onClick={() => setOpenReceipt(o.orderNumber)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-[11px] tracking-wide-2 uppercase bg-[#C5A059] text-black hover:bg-[#b8914f] transition-colors"
                  >
                    <ReceiptText className="w-4 h-4" /> View Receipt
                  </button>
                ) : o.paymentStatus === "paid" ? (
                  <span className="text-xs text-muted-foreground">Receipt is being prepared</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {openReceipt && <ReceiptModal orderNumber={openReceipt} onClose={() => setOpenReceipt(null)} />}
    </div>
  );
}
