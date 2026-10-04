import {
  LayoutGrid,
  Shirt,
  Glasses,
  ShoppingBag,
  Watch,
  Smartphone,
  Footprints,
  Gem,
  Baby,
  Tag,
} from "lucide-react";

/**
 * Maps a category name to a representative Lucide icon for the circular
 * category selector. Matching is keyword-based (not an exact table) so new
 * categories added in Supabase automatically get a sensible icon without
 * requiring a schema or data migration.
 */
const KEYWORD_ICONS = [
  [/^all$/i, LayoutGrid],
  [/dress|cloth|shirt|suit|jacket|wear|fashion|apparel|top|skirt|trouser|pant/i, Shirt],
  [/sunglass|glass|accessor|jewel|belt/i, Glasses],
  [/bag|purse|wallet|backpack/i, ShoppingBag],
  [/watch|timepiece/i, Watch],
  [/phone|electronic|tech|gadget|laptop|audio|headphone/i, Smartphone],
  [/shoe|sneaker|boot|sandal|footwear/i, Footprints],
  [/ring|necklace|bracelet|gem|diamond/i, Gem],
  [/kid|baby|child/i, Baby],
];

export function getCategoryIcon(name = "") {
  for (const [pattern, Icon] of KEYWORD_ICONS) {
    if (pattern.test(name)) return Icon;
  }
  return Tag;
}
