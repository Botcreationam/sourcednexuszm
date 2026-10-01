import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Camera, Truck, MessageSquare, SlidersHorizontal, Compass } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isSupabaseConfigured, getSupabaseProducts } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { rankProductsForYou, getStoredInterests } from "@/lib/recommendations";
import { buildWhatsAppUrl, photoSourcingMessage, WHATSAPP_DISPLAY } from "@/lib/whatsapp";
import ScrollReveal from "@/components/site/ScrollReveal";
import HorizontalProductSection from "@/components/site/HorizontalProductSection";
import SectionHeading from "@/components/site/SectionHeading";
import BrandedLoader from "@/components/BrandedLoader";
import PhotoChoiceModal from "@/components/site/PhotoChoiceModal";
import OnboardingModal from "@/components/site/OnboardingModal";
import PreferencesModal from "@/components/site/PreferencesModal";

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
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [interestsModalOpen, setInterestsModalOpen] = useState(false);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [recRefreshKey, setRecRefreshKey] = useState(0);

  useEffect(() => {
    async function loadProducts() {
      try {
        if (isSupabaseConfigured) {
          const sp = await getSupabaseProducts();
          if (sp && sp.length > 0) {
            setProducts(sp);
            setLoading(false);
            return;
          }
        }
        const bProducts = await base44.entities.Product.list("-created_date", 100);
        setProducts(bProducts || []);
      } catch (err) {
        console.error("Failed to load products on home:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  // Listen for user preference updates or resets
  useEffect(() => {
    const handleUpdate = () => setRecRefreshKey((k) => k + 1);
    window.addEventListener("sn:interests_updated", handleUpdate);
    window.addEventListener("sn:likes_updated", handleUpdate);
    window.addEventListener("sn:activity_updated", handleUpdate);
    window.addEventListener("sn:personalization_reset", handleUpdate);
    return () => {
      window.removeEventListener("sn:interests_updated", handleUpdate);
      window.removeEventListener("sn:likes_updated", handleUpdate);
      window.removeEventListener("sn:activity_updated", handleUpdate);
      window.removeEventListener("sn:personalization_reset", handleUpdate);
    };
  }, []);

  // Compute TikTok-style FYP personalized ranking and discovery sets
  const { forYouSection, discoverySection, hasPersonalization } = useMemo(() => {
    const currentInterests = user?.user_metadata?.interests || getStoredInterests();
    return rankProductsForYou(products, { interests: currentInterests });
  }, [products, user, recRefreshKey]);

  const newArrivals = products.filter((p) => p.is_new_arrival).slice(0, 12);
  const popular = products.filter((p) => p.is_popular).slice(0, 12);
  const byCategory = (cat) => products.filter((p) => p.category === cat).slice(0, 12);


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
              See the perfect outfit, gadget, or luxury timepiece? Send us a photo or link and we'll handle the rest.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={0.55}>
            <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/catalog" className="group inline-flex items-center justify-center gap-2 bg-foreground text-background px-8 py-4 text-[11px] tracking-wide-2 uppercase hover:bg-foreground/85 transition-colors">
                Browse Catalog <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionHeading eyebrow="How It Works" title="Send the picture. We'll handle the rest." />
          <div className="grid md:grid-cols-3 gap-10 md:gap-16 mt-16">
            {[
              { icon: Camera, step: "01", title: "Send a Photo", text: "Snap or screenshot the outfit you love and send it to us on WhatsApp." },
              { icon: MessageSquare, step: "02", title: "We Source It", text: "We find, curate and arrange your item from our trusted network." },
              { icon: Truck, step: "03", title: "Delivered To You", text: "Receive your piece in Lusaka within 7–14 working days." },
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
            eyebrow="Categories"
            title="Shop By Category"
            subtitle="From cutting-edge electronics and luxury watches to couture fashion and footwear."
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mt-14">
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
        </div>
      </section>

      {/* HORIZONTAL PRODUCT SECTIONS */}
      {loading ? (
        <BrandedLoader fullScreen={false} text="Curating Collection..." />
      ) : (
        <>
          {/* TIKTOK FYP-STYLE PERSONALIZED FEED */}
          {forYouSection.length > 0 && (
            <HorizontalProductSection
              eyebrow={hasPersonalization ? "Personalized For You" : "Recommended Feed"}
              title="Curated For You"
              products={forYouSection}
              viewAllTo="/catalog"
              action={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInterestsModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-[10px] tracking-wide-2 uppercase border border-foreground/30 px-3 py-1.5 hover:bg-foreground hover:text-background transition-colors"
                  >
                    <span>Tune Interests</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferencesModalOpen(true)}
                    aria-label="Personalization & Privacy Preferences"
                    className="p-1.5 border border-foreground/30 hover:bg-foreground hover:text-background transition-colors"
                    title="Privacy & Personalization Settings"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
              }
            />
          )}

          {/* DISCOVERY MECHANISM: OUTSIDE YOUR BUBBLE */}
          {discoverySection.length > 0 && (
            <div className="bg-muted/15 border-y border-border/50">
              <HorizontalProductSection
                eyebrow="Discovery Horizon"
                title="Explore Outside Your Bubble"
                products={discoverySection}
                viewAllTo="/catalog"
                action={
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] tracking-wide-2 uppercase text-muted-foreground">
                    <Compass className="w-3.5 h-3.5 text-primary" /> Serendipity picks
                  </span>
                }
              />
            </div>
          )}

          {newArrivals.length > 0 && (
            <HorizontalProductSection eyebrow="Just In" title="New Arrivals" products={newArrivals} viewAllTo="/catalog" />
          )}
          {popular.length > 0 && (
            <HorizontalProductSection eyebrow="Loved By You" title="Popular Picks" products={popular} viewAllTo="/catalog" />
          )}
          {byCategory("Electronics").length > 0 && (
            <HorizontalProductSection eyebrow="Technology" title="Electronics & Gadgets" products={byCategory("Electronics")} viewAllTo="/catalog?category=Electronics" />
          )}
          {byCategory("Watches").length > 0 && (
            <HorizontalProductSection eyebrow="Horology" title="Luxury Watches" products={byCategory("Watches")} viewAllTo="/catalog?category=Watches" />
          )}
          {byCategory("Dresses").length > 0 && (
            <HorizontalProductSection eyebrow="Collection" title="Dresses" products={byCategory("Dresses")} viewAllTo="/catalog?category=Dresses" />
          )}
          {byCategory("Suits").length > 0 && (
            <HorizontalProductSection eyebrow="Collection" title="Suits" products={byCategory("Suits")} viewAllTo="/catalog?category=Suits" />
          )}
          {byCategory("Shoes").length > 0 && (
            <HorizontalProductSection eyebrow="Collection" title="Shoes" products={byCategory("Shoes")} viewAllTo="/catalog?category=Shoes" />
          )}
          {byCategory("Heels").length > 0 && (
            <HorizontalProductSection eyebrow="Collection" title="Heels" products={byCategory("Heels")} viewAllTo="/catalog?category=Heels" />
          )}
        </>
      )}

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

      {/* Shopping Interests Onboarding & Customization Modal */}
      <OnboardingModal
        open={interestsModalOpen}
        onClose={() => setInterestsModalOpen(false)}
        isEditMode={true}
      />

      {/* Privacy and Personalization Preferences Modal */}
      <PreferencesModal
        open={preferencesModalOpen}
        onClose={() => setPreferencesModalOpen(false)}
        onOpenInterests={() => setInterestsModalOpen(true)}
      />
    </div>
  );
}