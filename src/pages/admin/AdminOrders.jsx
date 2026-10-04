import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { formatKwachaPrice } from "@/lib/utils";
import {
  ClipboardList,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
} from "lucide-react";

const PAYMENT_STATUS_STYLES = {
  paid: "text-[#C5A059] border-[#C5A059]",
  pending: "text-muted-foreground border-border",
  confirmation_pending: "text-muted-foreground border-border",
  failed: "text-destructive border-destructive/40",
  cancelled: "text-muted-foreground border-border",
};

const PAYMENT_STATUS_LABELS = {
  paid: "Paid",
  pending: "Pending",
  confirmation_pending: "Confirming",
  failed: "Failed",
  cancelled: "Cancelled",
};

const ORDER_STATUS_LABELS = {
  pending: "Awaiting Payment",
  processing: "Processing",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function AdminOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const fetchOrders = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    try {
      const [ordersRes, itemsRes, paymentsRes] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("order_items").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(500),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      setOrders(ordersRes.data || []);
      setOrderItems(itemsRes.data || []);
      setPayments(paymentsRes.data || []);
    } catch (err) {
      console.error("Failed to load orders:", err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const itemsByOrder = {};
  for (const item of orderItems) {
    (itemsByOrder[item.order_id] ||= []).push(item);
  }

  // Latest payment attempt per order (the authoritative one is any 'paid',
  // otherwise the most recent)
  const paymentByOrder = {};
  for (const p of payments) {
    const existing = paymentByOrder[p.order_id];
    if (!existing || (p.status === "paid" && existing.status !== "paid")) {
      paymentByOrder[p.order_id] = p;
    }
  }

  const filtered = query.trim()
    ? orders.filter((o) => {
        const q = query.trim().toLowerCase();
        const pay = paymentByOrder[o.id];
        return (
          o.order_number?.toLowerCase().includes(q) ||
          o.customer_email?.toLowerCase().includes(q) ||
          pay?.reference?.toLowerCase().includes(q) ||
          (itemsByOrder[o.id] || []).some((i) => i.product_name?.toLowerCase().includes(q))
        );
      })
    : orders;

  const paidCount = orders.filter((o) => o.payment_status === "paid").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl">Orders</h1>
          <p className="text-xs tracking-wide-2 uppercase text-muted-foreground mt-1">
            {orders.length} total • {paidCount} paid
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Order, customer, reference..."
              className="w-56 md:w-72 bg-transparent border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-foreground transition-colors"
            />
          </div>
          <button
            onClick={fetchOrders}
            className="p-2 border border-border hover:border-foreground transition-colors"
            aria-label="Refresh orders"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && orders.length === 0 ? (
        <div className="flex items-center gap-3 text-muted-foreground p-8 border border-border">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm tracking-wide-2 uppercase text-xs">Loading orders...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-12 border border-border text-center">
          <ClipboardList className="w-8 h-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No orders yet. Orders appear here when customers pay online.</p>
        </div>
      ) : (
        <div className="border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                <th className="px-4 py-3 text-[10px] tracking-wide-2 uppercase text-muted-foreground font-medium">Order</th>
                <th className="px-4 py-3 text-[10px] tracking-wide-2 uppercase text-muted-foreground font-medium">Customer</th>
                <th className="px-4 py-3 text-[10px] tracking-wide-2 uppercase text-muted-foreground font-medium">Products</th>
                <th className="px-4 py-3 text-[10px] tracking-wide-2 uppercase text-muted-foreground font-medium text-right">Total</th>
                <th className="px-4 py-3 text-[10px] tracking-wide-2 uppercase text-muted-foreground font-medium">Payment</th>
                <th className="px-4 py-3 text-[10px] tracking-wide-2 uppercase text-muted-foreground font-medium">Reference</th>
                <th className="px-4 py-3 text-[10px] tracking-wide-2 uppercase text-muted-foreground font-medium">Status</th>
                <th className="px-4 py-3 text-[10px] tracking-wide-2 uppercase text-muted-foreground font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const pay = paymentByOrder[order.id];
                const items = itemsByOrder[order.id] || [];
                const isPaid = order.payment_status === "paid";
                return (
                  <tr
                    key={order.id}
                    className={`border-b border-border/50 last:border-b-0 ${isPaid ? "bg-[#C5A059]/[0.04]" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{order.order_number}</td>
                    <td className="px-4 py-3">
                      <p className="whitespace-nowrap">{order.customer_email}</p>
                      {order.customer_phone && (
                        <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      {items.map((item, i) => (
                        <p key={i} className="text-xs leading-relaxed">
                          <span className="font-medium">{item.product_name}</span>
                          {item.grade_name ? <span className="text-[#C5A059]"> • {item.grade_name}</span> : null}
                          <span className="text-muted-foreground"> × {item.quantity}</span>
                        </p>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                      {formatKwachaPrice(order.subtotal)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {pay ? (
                        <span className="text-[10px] tracking-wide-2 uppercase">
                          {pay.provider} • {pay.payment_method || "—"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {pay ? pay.reference : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 border text-[10px] tracking-wide-2 uppercase ${
                          PAYMENT_STATUS_STYLES[order.payment_status] || PAYMENT_STATUS_STYLES.pending
                        }`}
                      >
                        {isPaid ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : order.payment_status === "failed" ? (
                          <XCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status}
                      </span>
                      <p className="text-[10px] tracking-wide-2 uppercase text-muted-foreground mt-1">
                        {ORDER_STATUS_LABELS[order.status] || order.status}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {isPaid && pay?.completed_at
                        ? new Date(pay.completed_at).toLocaleDateString()
                        : new Date(order.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
