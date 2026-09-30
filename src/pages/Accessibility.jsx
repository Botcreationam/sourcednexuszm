import { Link } from 'react-router-dom';

export default function Accessibility() {
  return (
    <div className="min-h-screen bg-background text-foreground px-6 md:px-16 lg:px-32 py-20">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-body text-muted-foreground hover:text-foreground transition-colors mb-10">
          ← Back to Home
        </Link>

        <h1 className="font-heading text-4xl font-normal mb-10 tracking-tight">Accessibility Statement</h1>

        <p className="font-body font-light text-base leading-relaxed mb-6">
          The purpose of the following template is to assist you in writing your accessibility statement. Please note that you are responsible for ensuring that your site's statement meets the requirements of the local law in your area or region.
        </p>

        <p className="font-body font-light text-base leading-relaxed mb-6 italic text-muted-foreground">
          *Note: This page currently has several sections. Once you complete editing the Accessibility Statement below, you need to delete this section.
        </p>

        <p className="font-body font-light text-base leading-relaxed mb-10">
          To learn more about this, check out our article "Accessibility: Adding an Accessibility Statement to Your Site".
        </p>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">Accessibility Statement</h2>
        <p className="font-body font-light text-base leading-relaxed mb-2">
          This statement was last updated on [enter relevant date].
        </p>
        <p className="font-body font-light text-base leading-relaxed mb-10">
          We at [enter organization / business name] are working to make our site [enter site name and address] accessible to people with disabilities.
        </p>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">What Web Accessibility Is</h2>
        <p className="font-body font-light text-base leading-relaxed mb-10">
          An accessible site allows visitors with disabilities to browse the site with the same or a similar level of ease and enjoyment as other visitors. This can be achieved with the capabilities of the system on which the site is operating, and through assistive technologies.
        </p>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">Accessibility Adjustments on This Site</h2>
        <p className="font-body font-light text-base leading-relaxed mb-4">
          We have adapted this site in accordance with WCAG [2.0 / 2.1 / 2.2 - select relevant option] guidelines, and have made the site accessible to the level of [A / AA / AAA - select relevant option]. This site's contents have been adapted to work with assistive technologies, such as screen readers and keyboard use. As part of this effort, we have also [remove irrelevant information]:
        </p>
        <ul className="font-body font-light text-base leading-relaxed space-y-2 list-disc list-inside mb-10">
          <li>Used the Accessibility Wizard to find and fix potential accessibility issues</li>
          <li>Set the language of the site</li>
          <li>Set the content order of the site's pages</li>
          <li>Defined clear heading structures on all of the site's pages</li>
          <li>Added alternative text to images</li>
          <li>Implemented color combinations that meet the required color contrast</li>
          <li>Reduced the use of motion on the site</li>
          <li>Ensured all videos, audio, and files on the site are accessible</li>
        </ul>

        <h2 className="font-heading text-2xl font-normal mb-4 tracking-tight">Declaration of Partial Compliance With the Standard Due to Third-Party Content</h2>
        <p className="font-body font-light text-sm text-muted-foreground italic">[only add if relevant]</p>
      </div>
    </div>
  );
}