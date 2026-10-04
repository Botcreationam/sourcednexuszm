import React, { useState } from "react";
import { Link } from "react-router-dom";
import { 
  Camera, MessageSquare, Truck, ShieldCheck, CheckCircle2, 
  Smartphone, Watch, Shirt, Crown, ArrowRight 
} from "lucide-react";
import { buildWhatsAppUrl, photoSourcingMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import ScrollReveal from "@/components/site/ScrollReveal";
import SectionHeading from "@/components/site/SectionHeading";
import PhotoChoiceModal from "@/components/site/PhotoChoiceModal";

const STEPS = [
  {
    step: "01",
    icon: Camera,
    title: "Send a Photo or Link",
    desc: "Saw a dress on Instagram? A phone on Apple's website? A luxury watch on Farfetch? Send us a screenshot, photo, or link via WhatsApp or our Pre-Order form.",
  },
  {
    step: "02",
    icon: MessageSquare,
    title: "Instant All-Inclusive Quote",
    desc: "Our sourcing network in Dubai, the UK, USA, and South Africa verifies availability and provides a transparent quote in ZMW or USD including customs and clearance.",
  },
  {
    step: "03",
    icon: ShieldCheck,
    title: "Authentication & Sourcing",
    desc: "Once confirmed, we procure the item directly from authorized brand boutiques. Every piece undergoes rigorous quality control and authenticity checks.",
  },
  {
    step: "04",
    icon: Truck,
    title: "Delivered to Lusaka",
    desc: "Your piece is shipped via prioritized express air cargo and delivered in Lusaka within 7–14 working days. Doorstep delivery or central pickup available.",
  },
];

const CATEGORIES_SOURCED = [
  {
    icon: Smartphone,
    title: "Electronics & Tech",
    items: "iPhones, MacBooks, iPads, PlayStation 5 Pro, Sony headphones, smart home & pro audio.",
  },
  {
    icon: Watch,
    title: "Watches & Timepieces",
    items: "Rolex, Omega, Tag Heuer, Tissot, Apple Watch Ultra 2, luxury chronographs.",
  },
  {
    icon: Shirt,
    title: "Suits & Evening Wear",
    items: "Tailored two & three-piece suits, formal blazers, tuxedo sets, silk ties.",
  },
  {
    icon: Crown,
    title: "Dresses & Haute Couture",
    items: "Evening gowns, cocktail dresses, statement satin wrap dresses, runway looks.",
  },
];

const FAQS = [
  {
    q: "What types of products can Sourced Nexus source?",
    a: "We source virtually any premium product available internationally, from luxury dresses and bespoke suits to flagship electronics (smartphones, laptops, gaming consoles), Swiss watches, designer sneakers, handbags, and niche perfumes.",
  },
  {
    q: "How long does delivery take to Lusaka?",
    a: "Standard delivery takes between 7 to 14 working days from order confirmation. We handle international air freight, customs documentation, and clearance.",
  },
  {
    q: "Are the products authentic and original?",
    a: "Yes, 100%. We source strictly from authorized flagship brand stores, official retailers, and certified luxury distributors in Dubai, the UK, USA, and South Africa.",
  },
  {
    q: "How do payments work in Zambia?",
    a: "We accept local bank transfers, Mobile Money (Airtel Money & MTN MoMo), and USD cash. An upfront deposit secures your order, with the balance cleared upon arrival.",
  },
  {
    q: "What if the item I want is sold out elsewhere?",
    a: "Our private personal shoppers have direct relationships with international boutiques and private client stylists, giving us access to limited-edition and sold-out items.",
  },
];

export default function HowItWorks() {
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  return (
    <div className="pt-20">
      {/* Hero */}
      <section className="py-20 md:py-28 border-b border-border bg-gradient-to-b from-background via-background/90 to-background/50">
        <div className="mx-auto max-w-4xl px-5 md:px-8 text-center">
          <ScrollReveal>
            <p className="text-[11px] md:text-xs tracking-luxe uppercase text-foreground/70">
              Personal Sourcing Service
            </p>
            <h1 className="font-display text-4xl md:text-6xl lg:text-7xl mt-4 leading-tight">
              How Sourced Nexus Works
            </h1>
            <p className="mt-6 text-sm md:text-base font-light text-muted-foreground max-w-xl mx-auto">
              From high-end fashion and statement footwear to flagship electronics and luxury timepieces: if it exists anywhere in the world, we bring it to Lusaka.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setPhotoModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 bg-foreground text-background px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-foreground/85 transition-colors"
              >
                <Camera className="w-4 h-4" /> Send Us What You Want
              </button>
              <Link
                to="/pre-order"
                className="inline-flex items-center justify-center gap-2 border border-foreground/30 px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-foreground hover:text-background transition-colors"
              >
                Submit Pre-Order Online <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* 4-Step Sourcing Workflow */}
      <section id="steps" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionHeading
            eyebrow="The Process"
            title="Sourced in 4 Simple Steps"
            subtitle="No complicated international shipping or customs hassles. We handle everything from store to door."
          />

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10 mt-16">
            {STEPS.map((s, i) => (
              <ScrollReveal key={s.step} delay={i * 0.12} className="relative p-6 border border-border/80 bg-card flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 border border-border flex items-center justify-center text-foreground">
                      <s.icon className="w-5 h-5" strokeWidth={1.5} />
                    </div>
                    <span className="font-display text-2xl text-muted-foreground/40 font-light">
                      {s.step}
                    </span>
                  </div>
                  <h3 className="font-display text-xl mb-3">{s.title}</h3>
                  <p className="text-xs md:text-sm font-light text-muted-foreground leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* What We Source */}
      <section className="py-20 md:py-28 bg-secondary/30 border-y border-border">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionHeading
            eyebrow="Coverage"
            title="What We Source"
            subtitle="We don't just source dresses. Our service covers the full spectrum of international luxury and consumer tech."
          />

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-14">
            {CATEGORIES_SOURCED.map((cat, i) => (
              <ScrollReveal key={cat.title} delay={i * 0.1} className="p-6 bg-background border border-border">
                <cat.icon className="w-6 h-6 text-[#C5A059] mb-4" strokeWidth={1.5} />
                <h3 className="font-display text-lg mb-2">{cat.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed font-light">
                  {cat.items}
                </p>
              </ScrollReveal>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 text-xs tracking-wide-2 uppercase border-b border-foreground pb-1 hover:text-foreground/70"
            >
              Browse Current Curated Catalog →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-5 md:px-8">
          <SectionHeading
            eyebrow="Questions & Answers"
            title="Frequently Asked Questions"
          />

          <div className="mt-14 space-y-4">
            {FAQS.map((faq, i) => (
              <ScrollReveal key={i} delay={i * 0.08} className="p-6 border border-border bg-card">
                <h3 className="font-display text-lg text-foreground mb-2 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#C5A059] shrink-0 mt-0.5" />
                  {faq.q}
                </h3>
                <p className="text-sm font-light text-muted-foreground pl-8 leading-relaxed">
                  {faq.a}
                </p>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-foreground text-background">
        <div className="mx-auto max-w-3xl px-5 md:px-8 text-center">
          <ScrollReveal>
            <h2 className="font-display text-3xl md:text-5xl">Ready to source your next piece?</h2>
            <p className="mt-4 text-background/70 font-light text-sm md:text-base max-w-lg mx-auto">
              Send us a photo or link directly on WhatsApp or submit a request online.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setPhotoModalOpen(true)}
                className="bg-background text-foreground px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:opacity-90 transition-opacity"
              >
                Send Us a Photo
              </button>
              <a
                href={buildWhatsAppUrl(photoSourcingMessage())}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#1f7a4c] text-white px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-[#165c39] transition-colors"
              >
                WhatsApp: {WHATSAPP_DISPLAY}
              </a>
              <Link
                to="/catalog"
                className="border border-background/40 text-background px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-background hover:text-foreground transition-colors"
              >
                Explore Catalog
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <PhotoChoiceModal open={photoModalOpen} onClose={() => setPhotoModalOpen(false)} />
    </div>
  );
}
