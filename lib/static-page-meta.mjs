// ============================================================================
// Per-page <head> metadata for the PUBLIC static routes.
// Before this, every static page served the homepage's title, description and
// canonical to crawlers (they do not run JavaScript), so Google treated them
// as duplicates of "/" and delayed indexing. Pure functions, no network.
// ============================================================================
import { SITE_ORIGIN, SITE_NAME, escapeHtml } from './product-meta.mjs';

export const STATIC_PAGE_META = {
  '/catalog': {
    title: 'Shop Fashion, Watches and Electronics | Sourced Nexus',
    description: 'Browse the full Sourced Nexus catalog: couture dresses, suits, shoes, watches and electronics, sourced and delivered in Lusaka, Zambia. Pay online in Kwacha.',
  },
  '/categories': {
    title: 'Shop by Category | Sourced Nexus Lusaka, Zambia',
    description: 'Explore Sourced Nexus by category: dresses, suits, shoes, watches, electronics and more, all curated for customers in Zambia.',
  },
  '/bundles': {
    title: 'Bundles and Outfit Sets | Sourced Nexus Lusaka, Zambia',
    description: 'Save with curated Sourced Nexus bundles and outfit sets. Complete looks at one price, sourced for customers in Lusaka, Zambia.',
  },
  '/pre-order': {
    title: 'Pre-Order Anything We Can Source | Sourced Nexus Zambia',
    description: 'Cannot find it? Send Sourced Nexus a photo or link and we will source it for you and deliver it in Zambia.',
  },
  '/how-it-works': {
    title: 'How It Works | Sourcing, Payment and Delivery | Sourced Nexus',
    description: 'See how Sourced Nexus works: browse or request an item, pay securely online in Kwacha, and receive it in Lusaka, Zambia.',
  },
  '/contact': {
    title: 'Contact Sourced Nexus | Lusaka, Zambia',
    description: 'Get in touch with Sourced Nexus in Lusaka, Zambia by WhatsApp, phone or email for orders, sourcing requests and support.',
  },
  '/terms': {
    title: 'Terms and Conditions | Sourced Nexus',
    description: 'The terms that govern orders and sourcing with Sourced Nexus in Zambia.',
  },
  '/privacy': {
    title: 'Privacy Policy | Sourced Nexus',
    description: 'How Sourced Nexus collects, uses and protects your personal data under the Zambian Data Protection Act.',
  },
  '/refund-policy': {
    title: 'Refund Policy | Sourced Nexus',
    description: 'Sourced Nexus refund and returns policy for orders placed in Zambia.',
  },
  '/accessibility': {
    title: 'Accessibility Statement | Sourced Nexus',
    description: 'Our commitment to making Sourced Nexus accessible to everyone.',
  },
};

/** Normalise a requested path to a known key, or null. */
export function matchStaticPath(raw) {
  if (typeof raw !== 'string') return null;
  const p = ('/' + raw.replace(/[^A-Za-z0-9/_-]/g, '')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  return Object.prototype.hasOwnProperty.call(STATIC_PAGE_META, p) ? p : null;
}

function setTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

/** Return the SPA shell with this page's own title / description / canonical / OG. */
export function applyStaticMeta(shellHtml, path) {
  const meta = STATIC_PAGE_META[path];
  if (!meta) return shellHtml;
  const url = `${SITE_ORIGIN}${path}`;
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  let h = shellHtml;
  h = setTag(h, /<title>[\s\S]*?<\/title>/i, `<title>${t}</title>`);
  h = setTag(h, /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${d}" />`);
  h = setTag(h, /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${url}" />`);
  h = setTag(h, /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${t}" />`);
  h = setTag(h, /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${d}" />`);
  h = setTag(h, /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${url}" />`);
  h = setTag(h, /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${t}" />`);
  h = setTag(h, /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${d}" />`);
  return h;
}
export { SITE_NAME };
