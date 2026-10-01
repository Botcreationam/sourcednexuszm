import React from "react";
import { Link } from "react-router-dom";
import { Shield, Lock, ArrowLeft } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-20 px-5 md:px-8">
      <div className="max-w-4xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide-2 text-muted-foreground hover:text-foreground transition-colors mb-10"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Storefront
        </Link>

        {/* Header */}
        <header className="border-b border-border pb-8 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-foreground text-xs uppercase tracking-wide-2 mb-4">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>Data Privacy Notice • Version 2026-v1.0</span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tight leading-tight">
            Privacy Policy & Data Protection
          </h1>
          <p className="text-sm font-light text-muted-foreground mt-4 leading-relaxed max-w-2xl">
            How Sourced Nexus collects, processes, protects, and respects your personal information in compliance with the Data Protection Act of the Republic of Zambia.
          </p>
          <p className="text-xs text-muted-foreground/80 mt-2">
            Effective Date: 1 October 2026 • Lusaka, Republic of Zambia
          </p>
        </header>

        {/* Legal Context Alert */}
        <div className="p-4 md:p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-200/90 text-xs font-light leading-relaxed mb-12 flex items-start gap-3">
          <Lock className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-medium text-emerald-300 uppercase tracking-wide-2 block mb-1">
              Commitment to Zambian Data Protection Standards
            </strong>
            This Privacy Policy sets out how Sourced Nexus complies with the <em>Data Protection Act No. 3 of 2021</em> of Zambia. We process personal data lawfully, fairly, and transparently, ensuring that data is collected for specified, explicit, and legitimate sourcing purposes only.
          </div>
        </div>

        {/* Content */}
        <div className="space-y-12 text-sm font-light leading-relaxed text-foreground/90">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              1. Data Controller Identity
            </h2>
            <p>
              The Data Controller responsible for your personal data is <strong>Sourced Nexus</strong>, operating in Lusaka, Zambia. For data protection inquiries or to exercise statutory privacy rights, contact our Data Protection Officer at <code>sourcednexus@gmail.com</code> or via our Lusaka business office.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              2. Personal Data We Collect
            </h2>
            <p>We collect information you provide directly and data generated during your interaction with our service:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Identity & Account Data:</strong> Full name, email address, password hash (cryptographically hashed, never stored in plain text), and Google profile credentials if authenticating with Google OAuth.
              </li>
              <li>
                <strong>Contact & Delivery Data:</strong> Phone number, WhatsApp mobile number, physical delivery address or collection point in Lusaka or across Zambia.
              </li>
              <li>
                <strong>Sourcing Request Data:</strong> Outfit reference photos, apparel measurements, size preferences, color choices, and product inquiry notes submitted via our pre-order module or WhatsApp concierge.
              </li>
              <li>
                <strong>Shopping Interests & Preferences:</strong> Product categories selected during onboarding (e.g., Electronics, Watches, Dresses, Suits, Footwear), saved items, and personalized feed signals.
              </li>
              <li>
                <strong>Technical & Usage Data:</strong> Device identifiers, browser type, IP address, and anonymized interaction timestamps to safeguard platform security and prevent unauthorized access.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              3. Purpose & Legal Basis for Processing Personal Data
            </h2>
            <p>In accordance with Section 12 of the Zambian Data Protection Act, we process your information based on:</p>
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-lg border border-border bg-card/60">
                <h3 className="font-medium text-foreground text-xs uppercase tracking-wide-2 mb-1">Contractual Necessity</h3>
                <p className="text-xs text-muted-foreground">To register your account, procure requested items, manage payments in Zambian Kwacha, and deliver orders to your address.</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/60">
                <h3 className="font-medium text-foreground text-xs uppercase tracking-wide-2 mb-1">Explicit Consent</h3>
                <p className="text-xs text-muted-foreground">For optional marketing communications, new drops, and onboarding category personalization (which can be withdrawn at any time).</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/60">
                <h3 className="font-medium text-foreground text-xs uppercase tracking-wide-2 mb-1">Legitimate Interests</h3>
                <p className="text-xs text-muted-foreground">To prevent fraudulent transactions, protect account security, and enhance customer experience through lightweight feed curation.</p>
              </div>
              <div className="p-4 rounded-lg border border-border bg-card/60">
                <h3 className="font-medium text-foreground text-xs uppercase tracking-wide-2 mb-1">Statutory Compliance</h3>
                <p className="text-xs text-muted-foreground">To adhere to applicable tax laws, customs declarations under the Zambia Revenue Authority (ZRA), and anti-money laundering provisions.</p>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              4. Personalized Recommendations Algorithm Transparency
            </h2>
            <p>
              Sourced Nexus implements a lightweight, client-respecting recommendation algorithm inspired by modern feed architectures (such as TikTok's For You feed).
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Signals Used:</strong> Categories chosen during onboarding, recently viewed products, search terms, and items you like/save.
              </li>
              <li>
                <strong>Discovery Mechanism:</strong> To avoid filter bubbles and echo chambers, our algorithm periodically surfaces serendipitous products outside your primary categories.
              </li>
              <li>
                <strong>Privacy & User Control:</strong> You have full control. You can update your category preferences, toggle off algorithmic personalization, or completely reset your browsing history at any time via the <em>Preferences</em> modal on the homepage or account menu.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              5. Third-Party Service Providers & Infrastructure
            </h2>
            <p>
              We partner with industry-leading cloud and infrastructure services under strict confidentiality and security protocols:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Supabase:</strong> Provides enterprise-grade PostgreSQL database hosting, Row Level Security (RLS) enforcement, user authentication, and secure encrypted media storage.
              </li>
              <li>
                <strong>Google OAuth:</strong> Allows seamless, passwordless login using your Google account without exposing your Google credentials to our servers.
              </li>
              <li>
                <strong>WhatsApp Concierge:</strong> Used for direct order coordination and photo sourcing consultations via end-to-end encrypted messaging.
              </li>
            </ul>
            <p>We do not sell, rent, or monetize your personal data to external advertisers.</p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              6. Data Storage, Security & Retention
            </h2>
            <p>
              We enforce administrative, technical, and physical safeguards in accordance with international OWASP security standards:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Transport Security:</strong> All web traffic and API exchanges are protected with modern TLS/HTTPS encryption.
              </li>
              <li>
                <strong>Private Media Storage:</strong> Customer outfit photos submitted via pre-order forms are held in private, non-public storage accessible only by the authenticated user and authorized administrators.
              </li>
              <li>
                <strong>Retention Period:</strong> Account data is retained for the active lifecycle of your account. Transaction and customs records are retained for the statutory period required by Zambian commercial tax law.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              7. Your Rights Under the Zambian Data Protection Act
            </h2>
            <p>
              As a data subject in the Republic of Zambia, you hold specific statutory rights under Part VII of the Data Protection Act:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Right to be Informed:</strong> To know what personal data is processed and why.</li>
              <li><strong>Right of Access:</strong> To request a copy of the personal information we hold about you.</li>
              <li><strong>Right to Rectification:</strong> To correct inaccurate, outdated, or incomplete details.</li>
              <li><strong>Right to Erasure ("Right to be Forgotten"):</strong> To request account deletion where data is no longer necessary for statutory fulfillment.</li>
              <li><strong>Right to Object & Restrict:</strong> To opt out of marketing communications or algorithmic profiling.</li>
              <li><strong>Right to Data Portability:</strong> To receive your data in a structured, machine-readable format.</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              8. Account Suspension, Deletion & Consent Withdrawal
            </h2>
            <p>
              You may withdraw your consent for marketing communications or personalized feed recommendations at any time without affecting your essential ability to place orders. To request total account deletion, email <code>sourcednexus@gmail.com</code> or reach our concierge.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              9. Contact & Data Protection Inquiries
            </h2>
            <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1 text-xs">
              <p><strong>Data Controller:</strong> Sourced Nexus Concierge</p>
              <p><strong>Location:</strong> Lusaka, Republic of Zambia</p>
              <p><strong>Privacy Enquiries:</strong> sourcednexus@gmail.com</p>
              <p><strong>Official Concierge:</strong> +260 76 9625345</p>
            </div>
          </section>
        </div>

        {/* Footer navigation */}
        <div className="mt-14 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground underline">
            Read our Terms & Conditions →
          </Link>
          <Link to="/catalog" className="hover:text-foreground">
            Explore Curated Catalog
          </Link>
        </div>
      </div>
    </div>
  );
}