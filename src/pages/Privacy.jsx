import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 md:px-16 lg:px-32 py-20">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-body text-muted-foreground hover:text-foreground transition-colors mb-10">
          ← Back to Home
        </Link>
        <h1 className="font-heading text-4xl font-normal mb-4 tracking-tight">Privacy Policy</h1>

        <p className="text-sm text-muted-foreground mb-10 italic">A legal disclaimer</p>

        <p className="font-body font-light text-base leading-relaxed mb-10">
          The explanations and information provided on this page are only general and high-level explanations and information on how to write your own document of a Privacy Policy. You should not rely on this article as legal advice or as recommendations regarding what you should actually do, because we cannot know in advance what are the specific privacy policies you wish to establish between your business and your customers and visitors. We recommend that you seek legal advice to help you understand and to assist you in the creation of your own Privacy Policy.
        </p>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">Privacy Policy - the basics</h2>
        <p className="font-body font-light text-base leading-relaxed mb-10">
          Having said that, a privacy policy is a statement that discloses some or all of the ways a website collects, uses, discloses, processes, and manages the data of its visitors and customers. It usually also includes a statement regarding the website's commitment to protecting its visitors' or customers' privacy, and an explanation about the different mechanisms the website is implementing in order to protect privacy.
        </p>
        <p className="font-body font-light text-base leading-relaxed mb-10">
          Different jurisdictions have different legal obligations of what must be included in a Privacy Policy. You are responsible to make sure you are following the relevant legislation to your activities and location.
        </p>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">What to include in the Privacy Policy</h2>
        <p className="font-body font-light text-base leading-relaxed">
          Generally speaking, a Privacy Policy often addresses these types of issues: the types of information the website is collecting and the manner in which it collects the data; an explanation about why is the website collecting these types of information; what are the website's practices on sharing the information with third parties; ways in which your visitors and customers can exercise their rights according to the relevant privacy legislation; the specific practices regarding minors' data collection; and much, much more.
        </p>
      </div>
    </div>
  );
}