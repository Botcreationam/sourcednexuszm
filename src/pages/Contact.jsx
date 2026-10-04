import { useState } from "react";
import { MessageCircle, Phone, MapPin, Camera, Mail } from "lucide-react";
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
              Questions, custom requests or pre-orders: we're one message away.
            </p>
          </ScrollReveal>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-5 md:px-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <ScrollReveal delay={0}>
            <a href={buildWhatsAppUrl(generalInquiryMessage())} target="_blank" rel="noopener noreferrer" className="border border-border p-7 text-center hover:border-foreground transition-colors h-full flex flex-col justify-between">
              <div>
                <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5">
                  <MessageCircle className="w-5 h-5" strokeWidth={1} />
                </div>
                <h3 className="font-display text-2xl">WhatsApp</h3>
                <p className="text-sm font-light text-muted-foreground mt-1">{WHATSAPP_DISPLAY}</p>
              </div>
              <span className="mt-5 inline-block text-[10px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Chat Now</span>
            </a>
          </ScrollReveal>

          <ScrollReveal delay={0.08}>
            <a href={`tel:+260573575734`} className="border border-border p-7 text-center hover:border-foreground transition-colors h-full flex flex-col justify-between">
              <div>
                <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5">
                  <Phone className="w-5 h-5" strokeWidth={1} />
                </div>
                <h3 className="font-display text-2xl">Call Us</h3>
                <p className="text-sm font-light text-muted-foreground mt-1">{WHATSAPP_DISPLAY}</p>
              </div>
              <span className="mt-5 inline-block text-[10px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Call Now</span>
            </a>
          </ScrollReveal>

          <ScrollReveal delay={0.16}>
            <a href="mailto:sourcednexus@gmail.com" className="border border-border p-7 text-center hover:border-foreground transition-colors h-full flex flex-col justify-between">
              <div>
                <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5">
                  <Mail className="w-5 h-5" strokeWidth={1} />
                </div>
                <h3 className="font-display text-2xl">Email</h3>
                <p className="text-xs font-light text-muted-foreground mt-1 truncate" title="sourcednexus@gmail.com">
                  sourcednexus@gmail.com
                </p>
              </div>
              <span className="mt-5 inline-block text-[10px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Email Us</span>
            </a>
          </ScrollReveal>

          <ScrollReveal delay={0.24}>
            <button
              onClick={() => setPhotoModalOpen(true)}
              className="w-full border border-border p-7 text-center hover:border-foreground transition-colors h-full flex flex-col justify-between"
            >
              <div>
                <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5">
                  <Camera className="w-5 h-5" strokeWidth={1} />
                </div>
                <h3 className="font-display text-2xl text-center">Send a Photo</h3>
                <p className="text-sm font-light text-muted-foreground mt-1 text-center">Sourcing on request</p>
              </div>
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