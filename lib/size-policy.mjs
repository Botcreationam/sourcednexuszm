// ============================================================================
// SIZE VERIFICATION POLICY + SIZE GUIDE DATA (pure, no I/O)
// ----------------------------------------------------------------------------
// ONE definition shared by the server (lib/payza-shared.mjs) and the browser
// (src/lib/sizePolicy.js re-exports this file). The server is authoritative:
// it decides whether a line needs verification, so a browser cannot skip it
// by editing its own cart.
//
// RULES
//   - A product "requires size verification" when it is clothing (by category)
//     AND has sizes to choose from. An admin can force it on/off per product
//     with products.requires_size_verification (true / false).
//   - The size the customer selects is an explicit order specification. This
//     module never converts, maps or substitutes sizes. US, UK, EU and other
//     systems are NOT treated as equivalent anywhere.
// ============================================================================

export const DEFAULT_SIZING_STANDARD = 'Global / International';

export const SIZE_NOTICE_TITLE = 'SIZE SELECTION & ORDERING NOTICE';

export const SIZE_NOTICE_PARAGRAPHS = [
  'Please carefully verify your size before placing your order. The size you select during checkout is the exact size we will order for you.',
  'For clothing such as suits and other garments, Sourced Nexus uses global/international sizing standards. Size labels may differ between countries, brands and manufacturers.',
  'Please check the available size guide and measurements carefully before completing your purchase. If you are unsure about your size, please contact Sourced Nexus before placing your order.',
  'By continuing with your purchase, you confirm that you have selected and verified the correct size.',
];

export const SIZE_CHECKBOX_LABEL =
  'I have verified my size using the size guide and understand that the size selected is the exact size that will be ordered for me.';

// Categories (exact names in the live catalog) that are garments.
// Matching is case-insensitive and tolerant of plural / spacing differences.
const CLOTHING_CATEGORY_PATTERNS = [
  /suit/, /dress/, /cloth/, /top/, /shirt/, /blouse/, /pajama|pyjama/, /bikini|swim/,
  /coat|jacket/, /skirt/, /trouser|pant|jean|short/, /hoodie|sweater|jumper|cardigan/,
  /jumpsuit|romper|gown|abaya|kaftan/, /lingerie|underwear|sleepwear/, /children|kids|baby/,
  /uniform|outfit|attire|wear\b/,
];

// Garment categories that are NOT sized apparel (shoes, watches...) so a
// footwear size is not forced through a clothing notice unless admin opts in.
const NON_CLOTHING_OVERRIDES = [/shoe|sandal|heel|sneaker|boot|loafer|slipper/, /watch|sunglass|accessor|bag|suit ?case|jewel/];

function norm(v) {
  return String(v || '').trim().toLowerCase();
}

export function isClothingCategory(category) {
  const c = norm(category);
  if (!c) return false;
  // "Bags and Suit cases" contains "suit": rule out non-clothing first.
  if (NON_CLOTHING_OVERRIDES.some((re) => re.test(c))) return false;
  return CLOTHING_CATEGORY_PATTERNS.some((re) => re.test(c));
}

/** Does this product need the size verification step? */
export function requiresSizeVerification(product) {
  if (!product) return false;
  if (product.requires_size_verification === true || product.requiresSizeVerification === true) return true;
  if (product.requires_size_verification === false || product.requiresSizeVerification === false) return false;
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  return isClothingCategory(product.category) && sizes.length > 0;
}

/** Size-guide table to show: explicit admin choice, else derived from category. */
export function sizeGuideTypeFor(product) {
  const explicit = product?.size_guide_type || product?.sizeGuideType;
  if (explicit) return explicit;
  const c = norm(product?.category);
  if (!c) return 'none';
  if (/suit|coat|jacket|blazer/.test(c)) return 'suits';
  if (/shoe|sandal|heel|sneaker|boot|loafer|slipper/.test(c)) return 'shoes';
  if (/skirt|trouser|pant|jean|short/.test(c)) return 'bottoms';
  if (isClothingCategory(c)) return 'tops_dresses';
  return 'none';
}

/** The sizing system stated on the product page and stored on the order. */
export function sizingStandardFor(product) {
  const s = String(product?.sizing_standard || product?.sizingStandard || '').trim();
  return s ? s.slice(0, 120) : DEFAULT_SIZING_STANDARD;
}

// ---------------------------------------------------------------------------
// SIZE GUIDES. Measurements are body measurements in cm (inches in brackets).
// Each system is shown SEPARATELY. We deliberately do not publish a "US = UK
// = EU" conversion table: labels differ by brand and manufacturer, and this
// shop never substitutes a size. Customers read measurements, not labels.
// ---------------------------------------------------------------------------
const cm = (n) => `${n} cm (${(n / 2.54).toFixed(1)} in)`;

export const SIZE_GUIDES = {
  suits: {
    title: 'Suits & Jackets',
    measure: 'Chest, waist and shoulder are BODY measurements, not garment measurements.',
    columns: ['Label (as listed on this product)', 'Chest', 'Waist', 'Shoulder'],
    systemsNote:
      'Suit labels differ by system. US/UK style labels such as 38R, 40R or 42R mean chest in inches plus a length code (R = regular). ' +
      'European numeric sizes (such as 48, 50 or 52) are a separate scale. These systems are NOT automatically equivalent, ' +
      'so this guide does not convert between them. Choose by your measurements and use the exact label shown on this product.',
    rows: [
      ['38R (US/UK style)', cm(97), cm(81), cm(44)],
      ['40R (US/UK style)', cm(102), cm(86), cm(45)],
      ['42R (US/UK style)', cm(107), cm(91), cm(46)],
      ['44R (US/UK style)', cm(112), cm(97), cm(47)],
      ['46R (US/UK style)', cm(117), cm(102), cm(48)],
    ],
    rowsNote:
      'Approximate body measurements for a regular fit. If this product is listed in European numeric sizes, ' +
      'compare your chest and waist with the measurements the supplier gives, or contact us with your measurements before ordering.',
  },
  tops_dresses: {
    title: 'Dresses, Tops & Women\'s Clothing',
    measure: 'Use your body measurements. Stretch and cut vary by style.',
    columns: ['Label (as listed)', 'Bust', 'Waist', 'Hips'],
    systemsNote:
      'S / M / L / XL are brand labels, not a fixed standard. A "M" from one manufacturer can fit like another\'s "S" or "L". ' +
      'Compare your measurements, not the letter.',
    rows: [
      ['XS', cm(80), cm(62), cm(86)],
      ['S', cm(84), cm(66), cm(90)],
      ['M', cm(88), cm(70), cm(94)],
      ['L', cm(94), cm(76), cm(100)],
      ['XL', cm(100), cm(82), cm(106)],
      ['XXL', cm(106), cm(88), cm(112)],
    ],
    rowsNote: 'Approximate body measurements. If between sizes or unsure, contact us before ordering.',
  },
  bottoms: {
    title: 'Skirts, Trousers & Shorts',
    measure: 'Measure waist at the narrowest point and hips at the fullest point.',
    columns: ['Label (as listed)', 'Waist', 'Hips'],
    systemsNote:
      'Waist sizes in inches (e.g. 30, 32) and letter sizes are different systems. Do not assume they match across brands.',
    rows: [
      ['S', cm(66), cm(90)],
      ['M', cm(70), cm(94)],
      ['L', cm(76), cm(100)],
      ['XL', cm(82), cm(106)],
    ],
    rowsNote: 'Approximate body measurements.',
  },
  shoes: {
    title: 'Footwear',
    measure: 'Measure your foot length (heel to longest toe) standing on paper.',
    columns: ['Label (as listed)', 'Foot length'],
    systemsNote:
      'Shoe numbers differ between EU, UK and US scales. The numbers listed on this product (e.g. 40, 41, 42) are the supplier\'s ' +
      'labels. Measure your foot length and compare.',
    rows: [
      ['36', cm(22.8)], ['37', cm(23.5)], ['38', cm(24.1)], ['39', cm(24.8)], ['40', cm(25.4)],
      ['41', cm(26.0)], ['42', cm(26.7)], ['43', cm(27.3)], ['44', cm(27.9)], ['45', cm(28.6)],
    ],
    rowsNote: 'Approximate foot lengths for the numeric labels shown. Brands vary.',
  },
};

export function sizeGuideFor(product) {
  const type = sizeGuideTypeFor(product);
  if (type === 'none') return null;
  return { type, ...SIZE_GUIDES[type] };
}

// ---------------------------------------------------------------------------
// Server-side validation of a customer's size selection for one cart line.
// ---------------------------------------------------------------------------

/**
 * @param {object} product   row from products (sizes, category, flags...)
 * @param {object} line      { size, sizeVerified }
 * @returns {{ok:true, requires:boolean, size:string|null, standard:string|null, verified:boolean}
 *          |{ok:false, code:string, error:string}}
 */
export function validateSizeSelection(product, line) {
  const requires = requiresSizeVerification(product);
  const sizes = Array.isArray(product?.sizes) ? product.sizes.map(String) : [];
  const size = line?.size != null && String(line.size).trim() !== '' ? String(line.size).trim() : null;

  // A chosen size must be one this product actually offers. Never "fixed up".
  if (size && sizes.length > 0 && !sizes.includes(size)) {
    return {
      ok: false,
      code: 'size_unavailable',
      error: `The size "${size}" is not available for "${product?.name || 'this product'}". Please choose an available size.`,
    };
  }
  if (!requires) {
    return { ok: true, requires: false, size, standard: size ? sizingStandardFor(product) : null, verified: false };
  }
  if (!size) {
    return {
      ok: false,
      code: 'size_required',
      error: `Please select a size for "${product?.name || 'this product'}" before checkout.`,
    };
  }
  if (line?.sizeVerified !== true) {
    return {
      ok: false,
      code: 'size_not_verified',
      error: `Please confirm you have verified your size for "${product?.name || 'this product'}" before paying.`,
    };
  }
  return { ok: true, requires: true, size, standard: sizingStandardFor(product), verified: true };
}
