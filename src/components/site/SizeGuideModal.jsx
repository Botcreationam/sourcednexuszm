import { useEffect } from "react";
import { X, Ruler, Info } from "lucide-react";
import { sizeGuideFor, sizingStandardFor } from "@/lib/sizePolicy";

/**
 * Size guide for one product. Shows body measurements for the product's
 * category and names the sizing system the supplier uses. It never converts
 * between US / UK / EU or any other systems, because they are not equivalent.
 */
export default function SizeGuideModal({ product, onClose }) {
  const guide = sizeGuideFor(product);
  const standard = sizingStandardFor(product);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Size guide">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-background border border-border p-5 sm:p-8">
        <button onClick={onClose} className="absolute top-3 right-3 p-2 text-muted-foreground hover:text-foreground" aria-label="Close size guide">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-[#C5A059] mb-1">
          <Ruler className="w-4 h-4" />
          <span className="text-[11px] tracking-wide-2 uppercase">Size guide</span>
        </div>
        <h2 className="font-display text-2xl mb-1">{guide?.title || product?.name || "Size guide"}</h2>

        <div className="mt-3 border border-[#C5A059]/40 bg-[#C5A059]/5 p-3 text-xs leading-relaxed">
          <p>
            <span className="font-semibold">Sizing system for this product:</span> {standard}
          </p>
          {product?.sizes?.length > 0 && (
            <p className="mt-1 text-muted-foreground">Sizes offered: {product.sizes.join(", ")}</p>
          )}
        </div>

        {guide ? (
          <>
            <p className="mt-4 text-sm text-foreground/80">{guide.measure}</p>
            <div className="mt-3 overflow-x-auto border border-border">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="bg-muted/40 text-left">
                    {guide.columns.map((c) => (
                      <th key={c} className="px-3 py-2 text-[11px] tracking-wide-2 uppercase font-medium text-muted-foreground">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guide.rows.map((row) => (
                    <tr key={row[0]} className="border-t border-border">
                      {row.map((cell, i) => (
                        <td key={i} className={`px-3 py-2 ${i === 0 ? "font-medium" : "text-foreground/80"}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{guide.rowsNote}</p>

            <div className="mt-4 flex gap-2 text-xs leading-relaxed text-foreground/80 border border-border p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#C5A059]" />
              <p>{guide.systemsNote}</p>
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            There is no standard measurement table for this product. Please contact Sourced Nexus with your measurements before ordering.
          </p>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Not sure which size to choose? Contact Sourced Nexus before placing your order. The size you select is the exact size we order for you.
        </p>
      </div>
    </div>
  );
}
