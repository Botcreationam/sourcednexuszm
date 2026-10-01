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
            <p className="mt-5 text-base font-light text-cream/70 max-w-xs italic font-display">
              Your Style & Tech. Sourced For You.
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
              <li><Link to="/terms" className="hover:text-cream transition-colors">Terms & Conditions</Link></li>
              <li><Link to="/privacy" className="hover:text-cream transition-colors">Privacy Policy</Link></li>
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
            <p className="text-sm font-light text-cream/80">WhatsApp / Call (Lusaka)</p>
            <a href={buildWhatsAppUrl(generalInquiryMessage())} target="_blank" rel="noopener noreferrer" className="font-display text-2xl hover:text-cream transition-colors block mt-1">
              {WHATSAPP_DISPLAY}
            </a>
            <div className="mt-3">
              <p className="text-[10px] tracking-luxe uppercase text-cream/50">Email Inquiries</p>
              <a href="mailto:sourcednexus@gmail.com" className="text-sm font-light text-cream hover:underline transition-all block mt-0.5">
                sourcednexus@gmail.com
              </a>
            </div>
            <div className="flex gap-4 mt-5">
              <a href="#" aria-label="Instagram" className="w-9 h-9 border border-cream/30 flex items-center justify-center hover:bg-cream hover:text-foreground transition-colors"><Instagram className="w-4 h-4" /></a>
              <a href="#" aria-label="Facebook" className="w-9 h-9 border border-cream/30 flex items-center justify-center hover:bg-cream hover:text-foreground transition-colors"><Facebook className="w-4 h-4" /></a>
              <a href="mailto:sourcednexus@gmail.com" aria-label="Email sourcednexus@gmail.com" className="w-9 h-9 border border-cream/30 flex items-center justify-center hover:bg-cream hover:text-foreground transition-colors"><Mail className="w-4 h-4" /></a>
            </div>
            <p className="text-[10px] tracking-wide-2 uppercase text-cream/60 mt-4">
              Currency: Zambian Kwacha (K / ZMW)
            </p>
          </div>
        </div>

        <div className="mt-14 pt-6 border-t border-cream/15 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] tracking-wide-2 uppercase text-cream/40">
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/terms" className="hover:text-cream transition-colors">Terms & Conditions</Link>
            <span>•</span>
            <Link to="/privacy" className="hover:text-cream transition-colors">Privacy Policy</Link>
            <span>•</span>
            <Link to="/refund-policy" className="hover:text-cream transition-colors">Refund Policy</Link>
          </div>
          <p>© {new Date().getFullYear()} Sourced Nexus. Lusaka, Zambia. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}