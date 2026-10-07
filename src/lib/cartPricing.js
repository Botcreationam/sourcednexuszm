// ============================================================================
// Cart pricing for the screen (cart drawer + checkout). ONE place for the math.
//
//   line subtotal = unit price x quantity
//   order total   = sum of line subtotals (payable lines only)
//
// The browser calculates a DISPLAY total instantly so quantity changes feel
// immediate. The server then returns its own authoritative quote
// (/api/shop/quote, same parser as the real charge). If the two ever differ,
// the server's figure wins and the customer is told before paying.
// Nothing here is ever sent to the server as a price.
// ============================================================================
import { supabase } from "@/lib/supabase";

/** Same rule as the server's parsePriceText: one clear number, nothing guessed. */
export function parseUnitPrice(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const cleaned = String(value).trim().replace(/[KkZMWDd$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : null;
}

export function safeQuantity(q) {
  const n = Math.floor(Number(q));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 1;
}

/** Display-side line: { unitPrice|null, quantity, subtotal|null, payable } */
export function priceLine(item) {
  const unitPrice = parseUnitPrice(item?.price);
  const quantity = safeQuantity(item?.quantity);
  return {
    unitPrice,
    quantity,
    payable: unitPrice != null,
    subtotal: unitPrice != null ? Math.round(unitPrice * quantity * 100) / 100 : null,
  };
}

/** Totals for a whole cart. Payable lines only; the rest stay inquiry-only. */
export function priceCart(cart) {
  const lines = (cart || []).map((item) => ({ item, ...priceLine(item) }));
  const payable = lines.filter((l) => l.payable);
  const total = Math.round(payable.reduce((s, l) => s + l.subtotal, 0) * 100) / 100;
  return {
    lines,
    payableLines: payable,
    inquiryLines: lines.filter((l) => !l.payable),
    total,
    units: payable.reduce((s, l) => s + l.quantity, 0),
  };
}

/** "K1,400" / "K99.50". Always ZMW. */
export function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "K0";
  const cents = Math.abs(n - Math.round(n)) > 0.004;
  return `K${n.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Only identity goes to the server: never a price.
 * `sizeVerified` is the customer's explicit checkbox confirmation at checkout.
 * It is sent so the server can record it, but the SERVER decides whether a
 * product needs it and rejects the order if it is missing.
 */
export function toServerLines(lines, { sizeVerified = false } = {}) {
  return lines.map(({ item, quantity }) => {
    if (item.isBundle) {
      return {
        bundleId: item.bundleId || item.id,
        quantity,
        componentSelections: (item.bundleComponents || []).map((c) => ({
          productId: c.productId,
          size: c.size || null,
          sizeVerified,
        })),
      };
    }
    return {
      productId: item.id,
      quantity,
      size: item.selectedSize || null,
      color: item.selectedColor || null,
      gradeName: item.gradeName || item.selectedGrade?.name || null,
      sizeVerified,
    };
  });
}

export async function authedFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, payload };
}

/** Ask the server for the authoritative quote of these payable lines. */
export async function fetchServerQuote(payableLines) {
  if (!payableLines.length) return { ok: true, total: 0, lines: [] };
  const { ok, payload } = await authedFetch("/api/shop/quote", {
    method: "POST",
    body: JSON.stringify({ items: toServerLines(payableLines) }),
  });
  if (!ok || !payload?.success) return { ok: false, error: payload?.error || "Could not confirm prices." };
  return { ok: true, total: Number(payload.total), lines: payload.lines };
}
