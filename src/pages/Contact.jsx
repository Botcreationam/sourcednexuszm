import { MessageCircle, Phone, MapPin, Camera } from "lucide-react";
import { buildWhatsAppUrl, generalInquiryMessage, photoSourcingMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import ScrollReveal from "@/components/site/ScrollReveal";

export default function Contact() {
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
          {[
            { icon: MessageCircle, title: "WhatsApp", value: WHATSAPP_DISPLAY, href: buildWhatsAppUrl(generalInquiryMessage()), cta: "Chat Now" },
            { icon: Phone, title: "Call Us", value: WHATSAPP_DISPLAY, href: `tel:+260573575734`, cta: "Call Now" },
            { icon: Camera, title: "Send a Photo", value: "Sourcing on request", href: buildWhatsAppUrl(photoSourcingMessage()), cta: "Send Photo" },
          ].map((c, i) => (
            <ScrollReveal key={c.title} delay={i * 0.12}>
              <a href={c.href} target="_blank" rel="noopener noreferrer" className="block border border-border p-8 text-center hover:border-foreground transition-colors h-full">
                <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5">
                  <c.icon className="w-5 h-5" strokeWidth={1} />
                </div>
                <h3 className="font-display text-2xl">{c.title}</h3>
                <p className="text-sm font-light text-muted-foreground mt-1">{c.value}</p>
                <span className="mt-5 inline-block text-[10px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">{c.cta}</span>
              </a>
            </ScrollReveal>
          ))}
        </div>

        <div className="mx-auto max-w-3xl px-5 md:px-8 mt-16">
          <ScrollReveal className="flex items-center justify-center gap-2 text-[11px] tracking-wide-2 uppercase text-muted-foreground">
            <MapPin className="w-4 h-4" /> Lusaka, Zambia
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}