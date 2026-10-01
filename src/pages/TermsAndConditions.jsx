import React from "react";
import { Link } from "react-router-dom";
import { Shield, FileText, AlertTriangle, ArrowLeft, Scale, CheckCircle2 } from "lucide-react";
import ScrollReveal from "@/components/site/ScrollReveal";

export default function TermsAndConditions() {
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
            <Scale className="w-3.5 h-3.5 text-primary" />
            <span>Legal Agreement • Version 2026-v1.0</span>
          </div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tight leading-tight">
            Terms & Conditions of Service
          </h1>
          <p className="text-sm font-light text-muted-foreground mt-4 leading-relaxed max-w-2xl">
            Governing the use of Sourced Nexus personal luxury sourcing, catalog pre-orders, and digital storefront services in Lusaka, Republic of Zambia.
          </p>
          <p className="text-xs text-muted-foreground/80 mt-2">
            Last Updated & Effective: 1 October 2026 • Governed under the Laws of the Republic of Zambia
          </p>
        </header>

        {/* Statutory Flag & Notice */}
        <div className="p-4 md:p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-200/90 text-xs font-light leading-relaxed mb-12 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <strong className="font-medium text-amber-300 uppercase tracking-wide-2 block mb-1">
              Statutory Context & Review Notice
            </strong>
            These Terms & Conditions are drafted with reference to the <em>Electronic Communications and Transactions Act No. 4 of 2021</em>, the <em>Competition and Consumer Protection Act No. 24 of 2010</em>, and the <em>Data Protection Act No. 3 of 2021</em> of Zambia. Nothing in these terms is intended to exclude or limit statutory rights that cannot be lawfully excluded under applicable Zambian consumer protection law.
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-12 text-sm font-light leading-relaxed text-foreground/90">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              1. Platform Overview & Sourcing Service Model
            </h2>
            <p>
              <strong>Sourced Nexus</strong> operates a specialized procurement, luxury curation, and concierge delivery service headquartered in Lusaka, Zambia. We enable clients to browse curated products (electronics, timepieces, couture dresses, tailored suits, footwear, and accessories) or submit private sourcing requests by uploading photographs or specifications.
            </p>
            <p>
              By accessing our website, creating an account, or requesting product quotes via our portal or official WhatsApp concierge, you confirm that you have attained the legal age of majority in Zambia (18 years) or have obtained parental/guardian consent, and agree to be bound by these Terms.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              2. Account Registration, Security & Credential Protection
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Accuracy:</strong> You agree to provide true, accurate, and current information during registration and keep your account details updated.
              </li>
              <li>
                <strong>Confidentiality:</strong> You are responsible for safeguarding your login password and any authentication tokens. Any activity conducted under your authenticated account is presumed to be authorized by you.
              </li>
              <li>
                <strong>Third-Party Authentication:</strong> When authenticating via Google OAuth, you authorize Sourced Nexus to receive your verified email and name to establish your account without creating duplicate authentication systems.
              </li>
              <li>
                <strong>Unauthorized Access:</strong> You must promptly notify Sourced Nexus if you suspect unauthorized access or credential compromise.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              3. Pricing, Currency in Zambian Kwacha (ZMW / K) & Quotes
            </h2>
            <p>
              All prices displayed on the storefront, quotes issued via pre-order channels, and delivery invoices are denominated in <strong>Zambian Kwacha (ZMW or K)</strong> unless expressly stipulated otherwise in writing.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>"Price on Request":</strong> Given the bespoke nature of international sourcing and fluctuating logistics costs, items designated as "Price on Request" require an individual quotation calculated at current import and exchange parity.
              </li>
              <li>
                <strong>Price Adjustments:</strong> While we endeavor to maintain price stability, quotes remain valid for 48 hours unless otherwise noted. Sourced Nexus reserves the right to correct pricing errors resulting from technical miscalculations before order confirmation.
              </li>
              <li>
                <strong>Taxes & Duties:</strong> Quoted final order prices for pre-orders generally encompass procurement, international freight, and Zambian clearing arrangements unless stated as a custom bonded consignment.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              4. Orders, Payments, Pre-Order Sourcing & Cancellations
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Pre-Order Commitment:</strong> Customized and on-demand items sourced internationally require payment confirmation (or an agreed deposit) before procurement commences from our international supplier network.
              </li>
              <li>
                <strong>Payment Channels:</strong> We accept verified electronic payments, mobile money (Airtel Money, MTN MoMo, Zamtel Kwacha), and direct bank transfers into our designated Zambian merchant accounts. Cash on delivery is only available on selected in-stock Lusaka items with prior authorization.
              </li>
              <li>
                <strong>Order Cancellations:</strong> Because on-demand items are procured and shipped specifically to your request, cancellation requests must be submitted within 24 hours of order placement. Once international dispatch has occurred, cancellations may be subject to restocking or international return freight deductions.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              5. Delivery & Collection Arrangements Across Zambia
            </h2>
            <p>
              Standard sourcing delivery times range between <strong>7 to 14 working days</strong> from procurement confirmation, subject to international air cargo schedules, customs clearance, and local logistics in Lusaka.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Lusaka Deliveries:</strong> Doorstep courier delivery or scheduled collection at our Lusaka pickup hub.
              </li>
              <li>
                <strong>Copperbelt & Inter-Provincial Deliveries:</strong> Dispatched via trusted regional transport networks (e.g. registered courier or express parcel service) to Ndola, Kitwe, Livingstone, Solwezi, and other major hubs across Zambia.
              </li>
              <li>
                <strong>Inspection on Delivery:</strong> Customers are required to inspect the exterior condition and specifications of the delivered item upon handover.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              6. Refunds, Returns & Consumer Protection
            </h2>
            <p>
              Under the <em>Competition and Consumer Protection Act No. 24 of 2010</em>, you are entitled to products of merchantable quality that correspond to agreed descriptions.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Damaged or Incorrect Items:</strong> If a delivered item is defective, damaged in transit, or materially differs from the verified quotation, you must report it within 48 hours of receipt for repair, replacement, or refund.
              </li>
              <li>
                <strong>Sizing & Fit:</strong> Customers submitting custom sizing measurements or apparel orders are advised to consult our size guides. Sizing exchanges depend on replacement availability.
              </li>
              <li>
                <strong>Electronics & Devices:</strong> Manufacturer warranties on flagship electronics (Apple, Sony, etc.) apply as provided by authorized distribution chains.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              7. Prohibited & Illegal Goods Under Zambian Law
            </h2>
            <p>
              Sourced Nexus strictly adheres to the Laws of Zambia, including Zambia Revenue Authority (ZRA) customs regulations and the Zambian Penal Code. The following items are strictly prohibited:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Counterfeit currencies, illegal narcotics, or controlled substances without statutory authorization.</li>
              <li>Firearms, military ordnance, ammunition, or offensive weapons.</li>
              <li>Pornographic, seditious, or offensive media prohibited under Zambian censorship statutes.</li>
              <li>Endangered flora/fauna products prohibited by the Zambia Wildlife Authority (DNPW).</li>
              <li>Stolen property or items infringing third-party intellectual property rights.</li>
            </ul>
            <p>
              Any attempt to submit sourcing pre-orders for prohibited items will result in immediate account termination, transaction forfeiture, and formal reporting to law enforcement authorities.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              8. User-Submitted Media & Intellectual Property
            </h2>
            <p>
              When uploading reference photos or outfit screenshots for private pre-order sourcing:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>You confirm that you possess the right to share the image for sourcing and quotation purposes.</li>
              <li>Sourced Nexus stores customer reference photos securely in isolated private storage, and uses them solely to locate matching products from suppliers.</li>
              <li>All trademarks, monogram logos, and proprietary branding appearing on this website belong to Sourced Nexus or their respective lawful owners.</li>
            </ul>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              9. Fraud Prevention, Platform Misuse & Account Termination
            </h2>
            <p>
              We maintain strict zero-tolerance policies against fraudulent chargebacks, stolen mobile money numbers, phishing attempts, automated scraping, or denial-of-service disruptions. We reserve the right to suspend or permanently delete accounts that violate these terms or compromise platform integrity.
            </p>
          </section>

          {/* Section 10 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              10. Limitation of Liability & Force Majeure
            </h2>
            <p>
              While we take every reasonable measure to ensure timely sourcing and delivery, Sourced Nexus shall not be held liable for delays arising from events beyond our reasonable control (Force Majeure), including international customs clearance hold-ups, aviation cargo disruptions, severe weather, or regional port congestion.
            </p>
          </section>

          {/* Section 11 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              11. Governing Law & Dispute Resolution
            </h2>
            <p>
              These Terms & Conditions are governed by and construed in accordance with the substantive laws of the <strong>Republic of Zambia</strong>. Any disputes arising out of or in connection with these Terms shall first be submitted to mutual amicable consultation. If unresolved, disputes shall be subject to the competent jurisdiction of the Subordinate Court or High Court for Zambia sitting in Lusaka.
            </p>
          </section>

          {/* Section 12 */}
          <section className="space-y-3">
            <h2 className="font-display text-2xl text-foreground tracking-tight border-b border-border pb-2">
              12. Contact & Legal Enquiries
            </h2>
            <p>
              For legal notices, contract enquiries, or questions regarding these terms:
            </p>
            <div className="p-4 rounded-xl border border-border bg-card/60 space-y-1 text-xs">
              <p><strong>Legal & Compliance Department:</strong> Sourced Nexus Concierge</p>
              <p><strong>Address:</strong> Lusaka, Republic of Zambia</p>
              <p><strong>Email:</strong> sourcednexus@gmail.com</p>
              <p><strong>WhatsApp / Concierge:</strong> +260 76 9625345</p>
            </div>
          </section>
        </div>

        {/* Footer navigation */}
        <div className="mt-14 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:text-foreground underline">
            Read our Zambian Privacy Policy →
          </Link>
          <Link to="/catalog" className="hover:text-foreground">
            Explore Curated Catalog
          </Link>
        </div>
      </div>
    </div>
  );
}