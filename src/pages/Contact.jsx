import { useState } from "react";
import { MessageCircle, Phone, MapPin, Camera } from "lucide-react";
import { buildWhatsAppUrl, generalInquiryMessage, photoSourcingMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import ScrollReveal from "@/components/site/ScrollReveal";
import PhotoChoiceModal from "@/components/site/PhotoChoiceModal";

export default function Contact() {
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  return (
    <div className="pt-20">
      <section className="py-16 md:py-20 border-b border-border">
        <div className="mx-auto max-w-3xl px-5 md:px-8 text-center">
          <ScrollReveal>
            <p className="text-[11px] tracking-luxe uppercase text-muted-foreground">Get In Touch</p>
            <h1 className="font-display text-5xl md:text-6xl mt-3">Contact Sourced Nexus</h1>
            <p className="mt-4 text-sm font-light text-muted-foreground max-w-md mx-auto">
              Questions, custom requests or pre-orders — we're one message away.
            </p>
          </ScrollReveal>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-5 md:px-8 grid md:grid-cols-3 gap-5">
          <ScrollReveal delay={0}>
            <a href={buildWhatsAppUrl(generalInquiryMessage())} target="_blank" rel="noopener noreferrer" className="block border border-border p-8 text-center hover:border-foreground transition-colors h-full">
              <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5">
                <MessageCircle className="w-5 h-5" strokeWidth={1} />
              </div>
              <h3 className="font-display text-2xl">WhatsApp</h3>
              <p className="text-sm font-light text-muted-foreground mt-1">{WHATSAPP_DISPLAY}</p>
              <span className="mt-5 inline-block text-[10px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Chat Now</span>
            </a>
          </ScrollReveal>

          <ScrollReveal delay={0.12}>
            <a href={`tel:+260573575734`} className="block border border-border p-8 text-center hover:border-foreground transition-colors h-full">
              <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5">
                <Phone className="w-5 h-5" strokeWidth={1} />
              </div>
              <h3 className="font-display text-2xl">Call Us</h3>
              <p className="text-sm font-light text-muted-foreground mt-1">{WHATSAPP_DISPLAY}</p>
              <span className="mt-5 inline-block text-[10px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Call Now</span>
            </a>
          </ScrollReveal>

          <ScrollReveal delay={0.24}>
            <button
              onClick={() => setPhotoModalOpen(true)}
              className="w-full block border border-border p-8 text-center hover:border-foreground transition-colors h-full text-left"
            >
              <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5">
                <Camera className="w-5 h-5" strokeWidth={1} />
              </div>
              <h3 className="font-display text-2xl text-center">Send a Photo</h3>
              <p className="text-sm font-light text-muted-foreground mt-1 text-center">Sourcing on request</p>
              <div className="text-center">
                <span className="mt-5 inline-block text-[10px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Send Photo</span>
              </div>
            </button>
          </ScrollReveal>
        </div>

        <div className="mx-auto max-w-3xl px-5 md:px-8 mt-16">
          <ScrollReveal className="flex items-center justify-center gap-2 text-[11px] tracking-wide-2 uppercase text-muted-foreground">
            <MapPin className="w-4 h-4" /> Lusaka, Zambia
          </ScrollReveal>
        </div>
      </section>

      <PhotoChoiceModal open={photoModalOpen} onClose={() => setPhotoModalOpen(false)} />
    </div>
  );
}