import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { buildWhatsAppUrl, generalInquiryMessage } from "@/lib/whatsapp";

export default function WhatsAppFloat() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 320);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      href={buildWhatsAppUrl(generalInquiryMessage())}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Sourced Nexus on WhatsApp"
      className={`fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px))] lg:bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#1f7a4c] px-4 py-3 text-white shadow-lg shadow-black/20 transition-all duration-500 hover:bg-[#165c39] hover:scale-105 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0 pointer-events-none"
      }`}
    >
      <MessageCircle className="w-5 h-5" />
      <span className="hidden sm:inline text-xs tracking-wide-2 uppercase">WhatsApp</span>
    </a>
  );
}