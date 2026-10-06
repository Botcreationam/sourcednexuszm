import { useState } from "react";
import { Link2, Check, Facebook, Twitter, Share2 } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { productShareUrl } from "@/lib/productUrl";

export default function ShareBar({ product }) {
  const [copied, setCopied] = useState(false);
  // Always the clean canonical product link (no query string, no #fragment, no
  // old uuid form), so every platform previews exactly this product.
  const url = typeof window !== "undefined" ? productShareUrl(product) : "";
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
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  const btn =
    "flex items-center justify-center gap-1.5 border border-border py-2.5 px-2 text-[10px] tracking-wide-2 uppercase hover:bg-foreground hover:text-background transition-colors";

  return (
    <div>
      <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground mb-3">Share this piece</p>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className={btn} title="Share on WhatsApp">
          <Share2 className="w-3.5 h-3.5" /> WhatsApp
        </a>
        <a href={fbUrl} target="_blank" rel="noopener noreferrer" className={btn} title="Share on Facebook">
          <Facebook className="w-3.5 h-3.5" /> Facebook
        </a>
        <a href={xUrl} target="_blank" rel="noopener noreferrer" className={btn} title="Share on X">
          <Twitter className="w-3.5 h-3.5" /> X
        </a>
        <a href={tgUrl} target="_blank" rel="noopener noreferrer" className={btn} title="Share on Telegram">
          Telegram
        </a>
        <a href={liUrl} target="_blank" rel="noopener noreferrer" className={btn} title="Share on LinkedIn">
          LinkedIn
        </a>
        <button onClick={copy} className={btn} title="Copy link">
          {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Link2 className="w-3.5 h-3.5" /> Copy</>}
        </button>
      </div>
    </div>
  );
}