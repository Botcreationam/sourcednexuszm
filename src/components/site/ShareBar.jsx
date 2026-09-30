import { useState } from "react";
import { Link2, Check, Facebook, Twitter, Share2 } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

export default function ShareBar({ product }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.href : "";
  const text = `Check out "${product.name}" at Sourced Nexus`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const waUrl = buildWhatsAppUrl(`${text}\n${url}`);
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  const btn =
    "flex items-center justify-center gap-2 border border-border py-3 text-[10px] tracking-wide-2 uppercase hover:bg-foreground hover:text-background transition-colors";

  return (
    <div>
      <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground mb-3">Share this item</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className={btn}>
          <Share2 className="w-3.5 h-3.5" /> WhatsApp
        </a>
        <a href={fbUrl} target="_blank" rel="noopener noreferrer" className={btn}>
          <Facebook className="w-3.5 h-3.5" /> Facebook
        </a>
        <a href={xUrl} target="_blank" rel="noopener noreferrer" className={btn}>
          <Twitter className="w-3.5 h-3.5" /> X
        </a>
        <button onClick={copy} className={btn}>
          {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Link2 className="w-3.5 h-3.5" /> Copy</>}
        </button>
      </div>
    </div>
  );
}