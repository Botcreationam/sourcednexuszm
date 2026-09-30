import { Link } from 'react-router-dom';

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 md:px-16 lg:px-32 py-20">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-body text-muted-foreground hover:text-foreground transition-colors mb-10">
          ← Back to Home
        </Link>

        <h1 className="font-heading text-4xl font-normal mb-4 tracking-tight">Refund Policy</h1>

        <p className="text-sm text-muted-foreground mb-10 italic">A legal disclaimer</p>

        <p className="font-body font-light text-base leading-relaxed mb-10">
          The explanations and information provided on this page are only general and high-level explanations and information on how to write your own document of a Refund Policy. You should not rely on this article as legal advice or as recommendations regarding what you should actually do, because we cannot know in advance what are the specific refund policies that you wish to establish between your business and your customers. We recommend that you seek legal advice to help you understand and to assist you in the creation of your own Refund Policy.
        </p>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">Refund Policy - the basics</h2>
        <p className="font-body font-light text-base leading-relaxed mb-10">
          Having said that, a Refund Policy is a legally binding document that is meant to establish the legal relations between you and your customers regarding how and if you will provide them with a refund. Online businesses selling products are sometimes required (depending on local laws and regulations) to present their product return policy and refund policy. In some jurisdictions, this is needed in order to comply with consumer protection laws. It may also help you avoid legal claims from customers that are not satisfied with the products they purchased.
        </p>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">What to include in the Refund Policy</h2>
        <p className="font-body font-light text-base leading-relaxed">
          Generally speaking, a Refund Policy often addresses these types of issues: the timeframe for asking for a refund; will the refund be full or partial; under which conditions will the customer receive a refund; and much, much more.
        </p>
      </div>
    </div>
  );
}