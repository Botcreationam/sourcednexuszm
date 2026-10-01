import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = typeof window !== 'undefined' ? window.self !== window.top : false;

/**
 * Format any price into Zambian Kwacha (K / ZMW)
 * Strips any stray USD / dollar symbols and ensures consistent Kwacha display.
 */
export function formatKwachaPrice(price) {
  if (!price && price !== 0) return "Price on request";
  const str = String(price).trim();
  if (!str || str.toLowerCase() === "price on request" || str === "—" || str === "-") {
    return "Price on request";
  }

  // If already starts with K or ZMW
  if (/^(k|zmw)\s*[\d,.]+/i.test(str)) {
    return str.replace(/^(zmw|k)\s*/i, "K ");
  }

  // Remove any dollar signs or USD labels
  const clean = str.replace(/[$\sUSDusd]/g, "");
  if (/^[\d,.]+$/.test(clean)) {
    return `K ${clean}`;
  }

  if (str.includes("$")) {
    return str.replace(/\$/g, "K ");
  }

  return str;
}

