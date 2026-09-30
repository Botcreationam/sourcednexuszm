import { Link } from 'react-router-dom';

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 md:px-16 lg:px-32 py-20">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-body text-muted-foreground hover:text-foreground transition-colors mb-10">
          ← Back to Home
        </Link>

        <h1 className="font-heading text-4xl font-normal mb-4 tracking-tight">Terms & Conditions</h1>

        <p className="text-sm text-muted-foreground mb-10 italic">A legal disclaimer</p>

        <p className="font-body font-light text-base leading-relaxed mb-10">
          The explanations and information provided on this page are only general and high-level explanations and information on how to write your own document of Terms & Conditions. You should not rely on this article as legal advice or as recommendations regarding what you should actually do, because we cannot know in advance what are the specific terms you wish to establish between your business and your customers and visitors. We recommend that you seek legal advice to help you understand and to assist you in the creation of your own Terms & Conditions.
        </p>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">Terms & Conditions - the basics</h2>
        <p className="font-body font-light text-base leading-relaxed mb-6">
          Having said that, Terms and Conditions ("T&C") are a set of legally binding terms defined by you, as the owner of this website. The T&C set forth the legal boundaries governing the activities of the website visitors, or your customers, while they visit or engage with this website. The T&C are meant to establish the legal relationship between the site visitors and you as the website owner.
        </p>
        <p className="font-body font-light text-base leading-relaxed mb-6">
          T&C should be defined according to the specific needs and nature of each website. For example, a website offering products to customers in e-commerce transactions requires T&C that are different from the T&C of a website only providing information (like a blog, a landing page, and so on).
        </p>
        <p className="font-body font-light text-base leading-relaxed mb-10">
          T&C provide you as the website owner the ability to protect yourself from potential legal exposure, but this may differ from jurisdiction to jurisdiction, so make sure to receive local legal advice if you are trying to protect yourself from legal exposure.
        </p>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">What to include in the T&C document</h2>
        <p className="font-body font-light text-base leading-relaxed">
          Generally speaking, T&C often address these types of issues: Who is allowed to use the website; the possible payment methods; a declaration that the website owner may change his or her offering in the future; the types of warranties the website owner gives his or her customers; a reference to issues of intellectual property or copyrights, where relevant; the website owner's right to suspend or cancel a member's account; and much, much more.
        </p>
      </div>
    </div>
  );
}