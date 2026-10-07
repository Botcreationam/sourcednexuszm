import { AlertTriangle } from "lucide-react";
import { SIZE_NOTICE_TITLE, SIZE_NOTICE_PARAGRAPHS } from "@/lib/sizePolicy";

/** The mandatory SIZE SELECTION & ORDERING NOTICE, word for word. */
export default function SizeNotice({ compact = false, className = "" }) {
  return (
    <div className={`border border-[#C5A059]/50 bg-[#C5A059]/5 ${compact ? "p-3" : "p-4"} ${className}`} data-testid="size-notice" role="note">
      <p className="flex items-center gap-2 text-[11px] tracking-wide-2 uppercase font-semibold">
        <AlertTriangle className="w-4 h-4 text-[#C5A059] shrink-0" />
        {SIZE_NOTICE_TITLE}
      </p>
      <div className={`mt-2 space-y-2 leading-relaxed text-foreground/85 ${compact ? "text-[11px]" : "text-xs"}`}>
        {SIZE_NOTICE_PARAGRAPHS.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </div>
  );
}
