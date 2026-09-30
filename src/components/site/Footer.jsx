import { Link } from "react-router-dom";
import { Instagram, Facebook, Mail } from "lucide-react";
import { WHATSAPP_DISPLAY, buildWhatsAppUrl, generalInquiryMessage } from "@/lib/whatsapp";

export default function Footer() {
  return (
    <footer className="bg-foreground text-cream">
      <div className="mx-auto max-w-7xl px-5 md:px-8 py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-1">
            <h3 className="font-display text-2xl tracking-wide-2">SOURCED NEXUS</h3>
            <p className="text-[10px] tracking-luxe text-cream/60 mt-1">LUSAKA • ZAMBIA</p>
            <p className="mt-5 text-sm font-light text-cream/70 max-w-xs italic font-display text-lg">
              Your Style. Sourced For You.
            </p>
          </div>

          <div>
            <h4 className="text-[11px] tracking-luxe uppercase text-cream/50 mb-4">Quick Links</h4>
            <ul className="space-y-2.5 text-sm font-light text-cream/80">
              <li><Link to="/" className="hover:text-cream transition-colors">Home</Link></li>
              <li><Link to="/catalog" className="hover:text-cream transition-colors">Catalog</Link></li>
              <li><Link to="/categories" className="hover:text-cream transition-colors">Categories</Link></li>
              <li><Link to="/how-it-works" className="hover:text-cream transition-colors">How It Works</Link></li>
              <li><Link to="/pre-order" className="hover:text-cream transition-colors">Pre-Order</Link></li>
              <li><Link to="/contact" className="hover:text-cream transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] tracking-luxe uppercase text-cream/50 mb-4">Categories</h4>
            <ul className="space-y-2.5 text-sm font-light text-cream/80">
              <li><Link to="/catalog?category=Electronics" className="hover:text-cream transition-colors">Electronics & Tech</Link></li>
              <li><Link to="/catalog?category=Watches" className="hover:text-cream transition-colors">Luxury Watches</Link></li>
              <li><Link to="/catalog?category=Dresses" className="hover:text-cream transition-colors">Dresses</Link></li>
              <li><Link to="/catalog?category=Suits" className="hover:text-cream transition-colors">Suits</Link></li>
              <li><Link to="/catalog?category=Shoes" className="hover:text-cream transition-colors">Shoes & Sneakers</Link></li>
              <li><Link to="/catalog?category=Heels" className="hover:text-cream transition-colors">Heels</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] tracking-luxe uppercase text-cream/50 mb-4">Contact</h4>
            <p className="text-sm font-light text-cream/80">WhatsApp / Call</p>
            <a href={buildWhatsAppUrl(generalInquiryMessage())} target="_blank" rel="noopener noreferrer" className="font-display text-2xl hover:text-cream transition-colors block mt-1">
              {WHATSAPP_DISPLAY}
            </a>
            <div className="flex gap-4 mt-6">
              <a href="#" aria-label="Instagram" className="w-9 h-9 border border-cream/30 flex items-center justify-center hover:bg-cream hover:text-foreground transition-colors"><Instagram className="w-4 h-4" /></a>
              <a href="#" aria-label="Facebook" className="w-9 h-9 border border-cream/30 flex items-center justify-center hover:bg-cream hover:text-foreground transition-colors"><Facebook className="w-4 h-4" /></a>
              <a href="#" aria-label="Email" className="w-9 h-9 border border-cream/30 flex items-center justify-center hover:bg-cream hover:text-foreground transition-colors"><Mail className="w-4 h-4" /></a>
            </div>
          </div>
        </div>

        <div className="mt-14 pt-6 border-t border-cream/15 flex flex-col md:flex-row justify-between gap-3 text-[10px] tracking-wide-2 uppercase text-cream/40">
          <p>Curated • Custom • Delivered</p>
          <p>© {new Date().getFullYear()} Sourced Nexus. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}