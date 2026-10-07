// Size + bundle details under an order line. Used by My Orders, the receipt
// modal and the success page so they always read the same.
// Accepts both camelCase (orders API) and snake_case (receipt snapshot) keys.
const get = (o, camel, snake) => o?.[camel] ?? o?.[snake];

export function sizeLines(x) {
  if (!x?.size) return [];
  const std = get(x, "sizingStandard", "sizing_standard");
  const ver = get(x, "sizeVerified", "size_verified");
  return [`Size: ${x.size}`, std ? `Sizing standard: ${std}` : null, ver ? "Size verification: Confirmed" : null].filter(Boolean);
}

export default function OrderLineDetails({ item, className = "" }) {
  const isBundle = get(item, "isBundle", "is_bundle");
  const lines = isBundle ? [] : sizeLines(item);
  const components = isBundle ? item.components || [] : [];
  if (lines.length === 0 && components.length === 0) return null;
  return (
    <span className={`block text-[11px] text-muted-foreground ${className}`} data-testid="order-line-details">
      {lines.map((l) => (<span key={l} className="block">{l}</span>))}
      {components.length > 0 && (
        <span className="block mt-1 pl-2 border-l-2 border-[#C5A059]/60">
          <span className="block uppercase tracking-wide text-[10px]">Bundle includes</span>
          {components.map((c, i) => (
            <span key={i} className="block">
              {c.quantity} × {c.name}
              {sizeLines(c).length > 0 && <span> ({sizeLines(c).join(" | ")})</span>}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
