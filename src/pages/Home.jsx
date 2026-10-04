import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Camera, Truck, MessageSquare, ShieldCheck, Sparkles, Package } from "lucide-react";
import { buildWhatsAppUrl, photoSourcingMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import ScrollReveal from "@/components/site/ScrollReveal";
import SectionHeading from "@/components/site/SectionHeading";
import PhotoChoiceModal from "@/components/site/PhotoChoiceModal";

const HERO_IMAGES = [
  "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/d51d95ee0_IMG_7842.jpeg",
  "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/c5a56b9e0_IMG_7732.jpeg",
  "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/37571797a_IMG_7604.jpeg",
  "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/cd6535153_IMG_7593.jpeg",
];

const CATEGORIES = [
  { name: "Electronics", img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80" },
  { name: "Watches", img: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&auto=format&fit=crop&q=80" },
  { name: "Dresses", img: "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/d51d95ee0_IMG_7842.jpeg" },
  { name: "Suits", img: "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/cd6535153_IMG_7593.jpeg" },
  { name: "Heels", img: "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/54f2cdec4_IMG_7898.jpeg" },
  { name: "Shoes", img: "https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/45ca4d997_IMG_7913.jpeg" },
];

export default function Home() {
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  return (
    <div>
      {/* HERO */}
      <section className="relative min-h-[100svh] flex items-center pt-20 overflow-hidden">
        <div className="absolute inset-0 grid grid-cols-2 md:grid-cols-4 gap-1 opacity-90">
          {HERO_IMAGES.map((src, i) => (
            <div key={i} className="relative overflow-hidden h-full">
              <img
                src={src}
                alt="Sourced Nexus Luxury Collection"
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "auto"}
                decoding="async"
                className="w-full h-full object-cover animate-slow-zoom"
                style={{ animationDelay: `${i * 1.5}s` }}
              />
              <div className="absolute inset-0 bg-background/30" />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background/80" />

        <div className="relative z-10 mx-auto max-w-7xl px-5 md:px-8 w-full text-center">
          <ScrollReveal delay={0.1}>
            <p className="text-[11px] md:text-xs tracking-luxe uppercase text-foreground/70">SOURCED NEXUS</p>
            <p className="text-[10px] md:text-[11px] tracking-luxe uppercase text-foreground/50 mt-2">LUSAKA • ZAMBIA</p>
          </ScrollReveal>
          <ScrollReveal delay={0.25}>
            <h1 className="font-display text-5xl md:text-7xl lg:text-8xl leading-[0.95] mt-6 max-w-4xl mx-auto">
              Your Style & Tech.<br />Sourced For You.
            </h1>
          </ScrollReveal>
          <ScrollReveal delay={0.4}>
            <p className="mt-6 text-sm md:text-base font-light text-foreground/70 max-w-lg mx-auto">
              Sourced Nexus is your personal sourcing and shopping platform. Browse curated fashion, luxury
              timepieces and electronics, or send us a photo of anything you love and we'll source and deliver it.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.55}>
            <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/catalog" className="group inline-flex items-center justify-center gap-2 bg-foreground text-background px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-foreground/85 transition-colors">
                Start Shopping <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button
                onClick={() => setPhotoModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 border border-foreground/40 px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-foreground hover:text-background transition-colors"
              >
                <Camera className="w-4 h-4" /> Send Us a Photo
              </button>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="border-y border-border bg-background overflow-hidden py-4">
        <div className="flex whitespace-nowrap animate-marquee">
          {[0, 1].map((rep) => (
            <div key={rep} className="flex shrink-0">
              {["CURATED", "CUSTOM", "DELIVERED", "PRE-ORDERS OPEN NOW", "LUSAKA ZAMBIA", "DELIVERY 7–14 WORKING DAYS"].map((t, i) => (
                <span key={i} className="font-display text-2xl md:text-3xl px-8 text-foreground/80 flex items-center gap-8">
                  {t} <span className="text-muted-foreground">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* WHAT YOU'LL FIND */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionHeading
            eyebrow="What We Offer"
            title="Everything you love, sourced with care."
            subtitle="From everyday fashion to luxury pieces — explore ready-to-order items or let us source something special just for you."
          />
          <div className="grid md:grid-cols-3 gap-10 md:gap-16 mt-16">
            {[
              {
                icon: Sparkles,
                title: "Curated Catalogue",
                text: "Browse suits, dresses, watches, shoes, electronics and more — each piece hand-picked by our team, with clear grades and pricing.",
              },
              {
                icon: Package,
                title: "Product Grades",
                text: "Choose First, Second or Third Grade on graded items — each with its own price, so you always know exactly what you're paying for.",
              },
              {
                icon: Camera,
                title: "Custom Sourcing",
                text: "Can't find it in the catalogue? Send a photo or link and we'll source it through our trusted international network.",
              },
            ].map((s, i) => (
              <ScrollReveal key={s.title} delay={i * 0.15} className="text-center">
                <div className="mx-auto w-14 h-14 border border-border flex items-center justify-center mb-6">
                  <s.icon className="w-5 h-5" strokeWidth={1} />
                </div>
                <h3 className="font-display text-2xl mb-2">{s.title}</h3>
                <p className="text-sm font-light text-muted-foreground max-w-xs mx-auto">{s.text}</p>
              </ScrollReveal>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 bg-foreground text-background px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-foreground/85 transition-colors"
            >
              Start Shopping <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionHeading eyebrow="How It Works" title="Send the picture. We'll handle the rest." />
          <div className="grid md:grid-cols-3 gap-10 md:gap-16 mt-16">
            {[
              { icon: Camera, step: "01", title: "Send a Photo", text: "Snap or screenshot the outfit you love and send it to us on WhatsApp — or pick something straight from the catalogue." },
              { icon: MessageSquare, step: "02", title: "We Source It", text: "We find, curate and arrange your item from our trusted network, confirming quality and price with you." },
              { icon: Truck, step: "03", title: "Delivered To You", text: "Receive your piece in Lusaka within 7–14 working days, with updates every step of the way." },
            ].map((s, i) => (
              <ScrollReveal key={s.step} delay={i * 0.15} className="text-center">
                <div className="mx-auto w-14 h-14 border border-border flex items-center justify-center mb-6">
                  <s.icon className="w-5 h-5" strokeWidth={1} />
                </div>
                <p className="text-[10px] tracking-luxe text-muted-foreground mb-2">{s.step}</p>
                <h3 className="font-display text-2xl mb-2">{s.title}</h3>
                <p className="text-sm font-light text-muted-foreground max-w-xs mx-auto">{s.text}</p>
              </ScrollReveal>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              to="/how-it-works"
              className="inline-flex items-center gap-2 border border-border px-6 py-3 text-[11px] tracking-wide-2 uppercase hover:bg-muted transition-colors"
            >
              Explore Full How It Works Guide <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CATEGORIES SHOWCASE */}
      <section className="py-20 md:py-28 bg-secondary/40">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionHeading
            eyebrow="Browse By Category"
            title="What will you find today?"
            subtitle="A glimpse of our collections — the full catalogue is waiting inside."
          />
          <div className="mt-14 grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {CATEGORIES.map((c, i) => (
              <ScrollReveal key={c.name} delay={i * 0.08}>
                <Link to={`/catalog?category=${c.name}`} className="group relative block aspect-[3/4] overflow-hidden">
                  <img src={c.img} alt={c.name} loading="lazy" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-foreground/20 to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 p-4 text-center">
                    <h3 className="font-display text-xl md:text-2xl text-cream">{c.name}</h3>
                    <span className="text-[9px] tracking-wide-2 uppercase text-cream/70 mt-1 inline-block opacity-0 group-hover:opacity-100 transition-opacity">Shop →</span>
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 border border-foreground/40 px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-foreground hover:text-background transition-colors"
            >
              View The Full Catalogue <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* SOURCING & DELIVERY INFO */}
      <section className="py-20 md:py-28 border-t border-border">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionHeading
            eyebrow="Sourcing & Delivery"
            title="Straightforward sourcing, honest delivery."
          />
          <div className="grid md:grid-cols-3 gap-10 mt-14">
            {[
              { icon: ShieldCheck, title: "Quality You Can Trust", text: "Every item is inspected before it ships. Graded products show exactly what each grade includes, at its own price." },
              { icon: Truck, title: "Delivery Across Lusaka", text: "In-stock and pre-order items arrive within 7–14 working days. We keep you updated from sourcing to doorstep." },
              { icon: MessageSquare, title: "Talk To A Real Person", text: "Questions about sizing, grades or delivery? Chat with us on WhatsApp any time and get a personal answer." },
            ].map((s, i) => (
              <ScrollReveal key={s.title} delay={i * 0.12}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 border border-border flex items-center justify-center flex-shrink-0">
                    <s.icon className="w-4 h-4" strokeWidth={1} />
                  </div>
                  <div>
                    <h3 className="font-display text-xl mb-2">{s.title}</h3>
                    <p className="text-sm font-light text-muted-foreground">{s.text}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* PRE-ORDER CTA */}
      <section className="relative py-24 md:py-32 bg-zinc-950 text-zinc-50 overflow-hidden">
        <div className="mx-auto max-w-3xl px-5 md:px-8 text-center">
          <ScrollReveal>
            <p className="text-[11px] tracking-luxe uppercase text-zinc-50/60">Now Taking Pre-Orders</p>
            <h2 className="font-display text-4xl md:text-6xl mt-4 leading-tight">Seen the perfect outfit?<br />Just send us a photo!</h2>
            <p className="mt-6 text-zinc-50/70 font-light max-w-lg mx-auto">
              Can't find it in our catalog? No problem. Send us an image of the outfit you want sourced and we'll handle the rest.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => setPhotoModalOpen(true)}
                className="bg-zinc-50 text-zinc-950 px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-zinc-50/85 transition-colors"
              >
                Send Us a Photo
              </button>
              <a href={buildWhatsAppUrl(photoSourcingMessage())} target="_blank" rel="noopener noreferrer" className="border border-zinc-50/40 px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-zinc-50 hover:text-zinc-950 transition-colors">
                WhatsApp / Call: {WHATSAPP_DISPLAY}
              </a>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Choice Modal for Photo Sourcing */}
      <PhotoChoiceModal open={photoModalOpen} onClose={() => setPhotoModalOpen(false)} />
    </div>
  );
}
