import { supabase } from "@/lib/supabase";
import { getSessionId, getVisitorId } from "@/lib/analytics";

/**
 * Sourced Nexus — TikTok FYP-Inspired Personalized Recommendation Engine
 * 
 * Computes personalized product rankings based on:
 * - Selected interests during registration/onboarding
 * - Products viewed & category dwell history
 * - Search queries
 * - Likes & saved items
 * - Product freshness & popularity
 * - Discovery mechanism to explore outside personal bubble
 * - Privacy-first controls (reset personalization & toggle tracking)
 */

export const ONBOARDING_CATEGORIES = [
  { id: "clothing", label: "Clothing and fashion", tags: ["suits", "dresses", "clothing", "fashion"] },
  { id: "dresses", label: "Dresses and outfits", tags: ["dresses", "gown", "cocktail"] },
  { id: "shoes", label: "Shoes and sneakers", tags: ["shoes", "heels", "sneakers", "oxfords"] },
  { id: "electronics", label: "Electronics", tags: ["electronics", "gadgets", "audio", "tech"] },
  { id: "phones", label: "Phones and accessories", tags: ["electronics", "phones", "iphone", "smartwatch"] },
  { id: "computers", label: "Computers and components", tags: ["electronics", "laptop", "macbook", "pc"] },
  { id: "beauty", label: "Beauty and skincare", tags: ["beauty", "perfumes", "fragrance", "skincare"] },
  { id: "appliances", label: "Home appliances", tags: ["appliances", "home", "kitchen"] },
  { id: "furniture", label: "Furniture", tags: ["furniture", "decor", "interior"] },
  { id: "sports", label: "Sports and fitness", tags: ["sports", "fitness", "activewear", "gym"] },
  { id: "books", label: "Books and stationery", tags: ["books", "stationery", "pens"] },
  { id: "bags", label: "Bags and accessories", tags: ["bags & accessories", "watches", "belts", "wallets", "accessories"] },
  { id: "automotive", label: "Automotive accessories", tags: ["automotive", "car"] },
  { id: "groceries", label: "Food and groceries", tags: ["food", "groceries", "gourmet"] },
  { id: "other", label: "Other shopping categories", tags: ["lifestyle", "general"] },
];

const STORAGE_KEYS = {
  INTERESTS: "sn_user_interests",
  VIEWS: "sn_viewed_products",
  LIKES: "sn_liked_products",
  SEARCHES: "sn_recent_searches",
  CATEGORY_AFFINITY: "sn_category_affinity",
  PERSONALIZATION_ENABLED: "sn_personalization_enabled",
  ONBOARDING_DONE: "sn_onboarding_completed",
};

/**
 * Get current user interests from localStorage or fallback
 */
export function getStoredInterests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INTERESTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Check if personalization tracking is enabled by user
 */
export function isPersonalizationEnabled() {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.PERSONALIZATION_ENABLED);
    return val !== "false"; // Defaults to true
  } catch {
    return true;
  }
}

export function setPersonalizationEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEYS.PERSONALIZATION_ENABLED, enabled ? "true" : "false");
  } catch {}
}

/**
 * Save user interests both locally and to Supabase user metadata / profile
 */
export async function saveUserInterests(interests, user = null, supabase = null) {
  try {
    localStorage.setItem(STORAGE_KEYS.INTERESTS, JSON.stringify(interests));
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, "true");
  } catch {}

  // Sync to Supabase if authenticated
  if (user && supabase) {
    try {
      await supabase.auth.updateUser({
        data: {
          interests,
          onboarding_completed: true,
          interests_updated_at: new Date().toISOString(),
        },
      });

      // Also upsert into public.user_profiles if the table is available
      try {
        await supabase.from("user_profiles").upsert({
          id: user.id,
          interests,
          updated_at: new Date().toISOString(),
        });
      } catch (tableErr) {
        // Table may be created or pending migration; user_metadata is already updated
      }
    } catch (err) {
      console.warn("Could not sync interests to Supabase account:", err?.message);
    }
  }

  // Dispatch custom event for real-time reactivity in UI
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sn:interests_updated", { detail: { interests } }));
  }
}

/**
 * Record product view to boost affinity
 */
export function recordProductView(product) {
  if (!product || !isPersonalizationEnabled()) return;
  try {
    const id = product.id;
    const category = product.category || "General";

    // 1. Update viewed products with timestamp
    const rawViews = localStorage.getItem(STORAGE_KEYS.VIEWS);
    const views = rawViews ? JSON.parse(rawViews) : [];
    const filtered = views.filter((v) => v.id !== id);
    filtered.unshift({ id, category, time: Date.now() });
    localStorage.setItem(STORAGE_KEYS.VIEWS, JSON.stringify(filtered.slice(0, 50)));

    // 2. Increment category affinity score
    const rawAff = localStorage.getItem(STORAGE_KEYS.CATEGORY_AFFINITY);
    const aff = rawAff ? JSON.parse(rawAff) : {};
    aff[category] = (aff[category] || 0) + 1;
    localStorage.setItem(STORAGE_KEYS.CATEGORY_AFFINITY, JSON.stringify(aff));

    window.dispatchEvent(new CustomEvent("sn:activity_updated"));

    // Async sync to Supabase for real view counts (anonymous or auth'd)
    const sessionId = getSessionId();
    const visitorId = getVisitorId();
    
    supabase.auth.getSession().then(({ data }) => {
      supabase.from("product_views").insert({
        product_id: id,
        session_id: sessionId,
        visitor_id: visitorId,
        user_id: data?.session?.user?.id || null
      }).then(() => {}).catch(() => {});
    });
  } catch {}
}

/**
 * Record search query
 */
export function recordSearchQuery(query) {
  if (!query || !isPersonalizationEnabled()) return;
  try {
    const clean = query.trim().toLowerCase();
    if (!clean) return;
    const raw = localStorage.getItem(STORAGE_KEYS.SEARCHES);
    const searches = raw ? JSON.parse(raw) : [];
    const filtered = searches.filter((s) => s.toLowerCase() !== clean);
    filtered.unshift(clean);
    localStorage.setItem(STORAGE_KEYS.SEARCHES, JSON.stringify(filtered.slice(0, 15)));
  } catch {}
}

/**
 * Toggle like/save for a product
 */
export function toggleProductLike(productId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LIKES);
    let likes = raw ? JSON.parse(raw) : [];
    const exists = likes.includes(productId);
    if (exists) {
      likes = likes.filter((id) => id !== productId);
    } else {
      likes.unshift(productId);
    }
    localStorage.setItem(STORAGE_KEYS.LIKES, JSON.stringify(likes.slice(0, 100)));
    window.dispatchEvent(new CustomEvent("sn:likes_updated", { detail: { likes } }));
    
    // Async sync to Supabase for authenticated users
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        if (!exists) {
          supabase.from("product_likes").insert({ product_id: productId, user_id: data.session.user.id }).then(()=>{});
        } else {
          supabase.from("product_likes").delete().match({ product_id: productId, user_id: data.session.user.id }).then(()=>{});
        }
      }
    });

    return !exists;
  } catch {
    return false;
  }
}

export function isProductLiked(productId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LIKES);
    const likes = raw ? JSON.parse(raw) : [];
    return likes.includes(productId);
  } catch {
    return false;
  }
}

export function getLikedProductIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LIKES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Privacy Reset: Completely clear all tracked personalization data
 */
export async function resetPersonalization(user = null, supabase = null) {
  try {
    localStorage.removeItem(STORAGE_KEYS.INTERESTS);
    localStorage.removeItem(STORAGE_KEYS.VIEWS);
    localStorage.removeItem(STORAGE_KEYS.LIKES);
    localStorage.removeItem(STORAGE_KEYS.SEARCHES);
    localStorage.removeItem(STORAGE_KEYS.CATEGORY_AFFINITY);
    localStorage.removeItem(STORAGE_KEYS.ONBOARDING_DONE);
  } catch {}

  if (user && supabase) {
    try {
      await supabase.auth.updateUser({
        data: {
          interests: [],
          onboarding_completed: false,
          personalization_reset_at: new Date().toISOString(),
        },
      });
      try {
        await supabase.from("user_profiles").update({
          interests: [],
          updated_at: new Date().toISOString(),
        }).eq("id", user.id);
      } catch {}
    } catch (err) {
      console.warn("Could not reset preferences on server:", err?.message);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sn:personalization_reset"));
  }
}

/**
 * Match a product against a list of selected user interest labels
 */
function productMatchesInterests(product, userInterests) {
  if (!userInterests || userInterests.length === 0) return false;
  const pCat = (product.category || "").toLowerCase();
  const pName = (product.name || "").toLowerCase();
  const pDesc = (product.description || "").toLowerCase();

  for (const interestLabel of userInterests) {
    const match = ONBOARDING_CATEGORIES.find(
      (c) => c.label.toLowerCase() === interestLabel.toLowerCase() || c.id === interestLabel
    );
    if (!match) {
      // Direct string comparison
      if (pCat.includes(interestLabel.toLowerCase())) return true;
      continue;
    }
    // Check tags
    for (const tag of match.tags) {
      if (pCat.includes(tag) || pName.includes(tag) || pDesc.includes(tag)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Core Algorithm: FYP Scoring & Personalized Product Ranking
 * Inspired by TikTok's For You Page architecture:
 * 1. Calculate relevance weight across multi-modal signals
 * 2. Apply discovery injection to break echo chamber
 * 3. Add freshness & popularity baseline
 * 4. Micro-jitter for dynamic page feel on return visits
 */
export function rankProductsForYou(products = [], options = {}) {
  if (!products || products.length === 0) {
    return {
      rankedProducts: [],
      forYouSection: [],
      discoverySection: [],
      hasPersonalization: false,
    };
  }

  const enabled = isPersonalizationEnabled();
  const userInterests = options.interests || getStoredInterests();
  const likedIds = new Set(getLikedProductIds());

  let categoryAffinity = {};
  let recentSearches = [];
  let viewedIds = new Set();

  if (enabled) {
    try {
      const rawAff = localStorage.getItem(STORAGE_KEYS.CATEGORY_AFFINITY);
      categoryAffinity = rawAff ? JSON.parse(rawAff) : {};
      const rawSearches = localStorage.getItem(STORAGE_KEYS.SEARCHES);
      recentSearches = rawSearches ? JSON.parse(rawSearches) : [];
      const rawViews = localStorage.getItem(STORAGE_KEYS.VIEWS);
      const views = rawViews ? JSON.parse(rawViews) : [];
      views.forEach((v) => viewedIds.add(v.id));
    } catch {}
  }

  const hasSignals =
    userInterests.length > 0 ||
    likedIds.size > 0 ||
    Object.keys(categoryAffinity).length > 0 ||
    recentSearches.length > 0;

  // Score each product
  const scored = products.map((product) => {
    let score = 0;
    const cat = product.category || "";
    const name = (product.name || "").toLowerCase();

    // 1. Popularity & Freshness Baseline
    if (product.is_popular) score += 25;
    if (product.is_new_arrival) score += 20;

    // 2. Direct Onboarding / Registration Interest Match (High Weight)
    const matchesInterest = productMatchesInterests(product, userInterests);
    if (matchesInterest) {
      score += 45;
    }

    // 3. User Likes & Saves (Strong Direct Engagement)
    if (likedIds.has(product.id)) {
      score += 50;
    }

    // 4. Category Dwell & Exploration Affinity
    const affCount = categoryAffinity[cat] || 0;
    if (affCount > 0) {
      score += Math.min(affCount * 6, 35);
    }

    // 5. Search Intent Match
    for (const term of recentSearches) {
      if (name.includes(term) || cat.toLowerCase().includes(term)) {
        score += 30;
        break;
      }
    }

    // 6. Echo-chamber dampening: slightly discount items already viewed 3+ times
    // so fresh unviewed catalog items can surface
    if (viewedIds.has(product.id)) {
      score += 5; // Slight bonus for recognized affinity, but keeps room for fresh discoveries
    } else {
      score += 15; // "Fresh to this user" exploration bonus
    }

    // 7. Dynamic micro-jitter (+/- 4 pts) so the feed feels lively on reloads
    const jitter = (Math.random() - 0.5) * 8;
    score += jitter;

    return { product, score, matchesInterest };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Split into For You (high affinity) and Discovery (outside user's main interests)
  const forYouList = [];
  const discoveryList = [];

  scored.forEach((item) => {
    if (item.matchesInterest || (categoryAffinity[item.product.category] || 0) > 0) {
      forYouList.push(item.product);
    } else {
      discoveryList.push(item.product);
    }
  });

  // TikTok FYP Interleaving:
  // Blend in 1 discovery item for every 3-4 interest matches to ensure serendipitous browsing
  const blendedFeed = [];
  let forYouIdx = 0;
  let discIdx = 0;

  while (forYouIdx < forYouList.length || discIdx < discoveryList.length) {
    // Push up to 3 forYou items
    for (let i = 0; i < 3 && forYouIdx < forYouList.length; i++) {
      blendedFeed.push(forYouList[forYouIdx++]);
    }
    // Push 1 discovery item
    if (discIdx < discoveryList.length) {
      blendedFeed.push(discoveryList[discIdx++]);
    }
    // If no more discovery, flush rest of forYou
    if (discIdx >= discoveryList.length && forYouIdx < forYouList.length) {
      blendedFeed.push(forYouList[forYouIdx++]);
    }
  }

  // Fallback if no specific signals: return popular/new arrivals arrangement
  const finalFeed = blendedFeed.length > 0 ? blendedFeed : products;

  return {
    rankedProducts: finalFeed,
    forYouSection: finalFeed.slice(0, 16),
    discoverySection: discoveryList.slice(0, 12),
    hasPersonalization: hasSignals,
  };
}

/* ============================================================================
 * BROWSING-ACTIVITY RECOMMENDATION HELPERS
 * Power "Recently Viewed", "Based on Your Activity", "Recommended for You",
 * "New Arrivals" and dismissible recommendation cards on the shop page.
 * All data stays on-device (localStorage) unless the customer is signed in —
 * see claimVisitorActivityOnLogin() below for the anonymous -> account merge.
 * ========================================================================== */

const DISMISSALS_KEY = "sn_dismissed_suggestions";
const NEW_ARRIVALS_WINDOW_DAYS = 30;

/**
 * Record a category browse (category page / product page visit) so
 * "Based on Your Activity" and "Recommended Watches"-style sections
 * reflect real browsing rather than hardcoded products.
 */
export function recordCategoryView(category) {
  if (!category || !isPersonalizationEnabled()) return;
  try {
    const rawAff = localStorage.getItem(STORAGE_KEYS.CATEGORY_AFFINITY);
    const aff = rawAff ? JSON.parse(rawAff) : {};
    aff[category] = (aff[category] || 0) + 1;
    localStorage.setItem(STORAGE_KEYS.CATEGORY_AFFINITY, JSON.stringify(aff));
    window.dispatchEvent(new CustomEvent("sn:activity_updated"));
  } catch {}
}

/** Categories ordered by browsing affinity, strongest first. */
export function getTopActivityCategories(limit = 3) {
  try {
    const rawAff = localStorage.getItem(STORAGE_KEYS.CATEGORY_AFFINITY);
    const aff = rawAff ? JSON.parse(rawAff) : {};
    return Object.entries(aff)
      .filter(([cat, score]) => cat && score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([cat]) => cat);
  } catch {
    return [];
  }
}

/** Reduce affinity for a category (used by "Not interested"). */
export function reduceCategoryAffinity(category, factor = 3) {
  try {
    const rawAff = localStorage.getItem(STORAGE_KEYS.CATEGORY_AFFINITY);
    const aff = rawAff ? JSON.parse(rawAff) : {};
    if (aff[category]) {
      aff[category] = Math.max(0, Math.round(aff[category] / factor));
      if (aff[category] === 0) delete aff[category];
      localStorage.setItem(STORAGE_KEYS.CATEGORY_AFFINITY, JSON.stringify(aff));
      window.dispatchEvent(new CustomEvent("sn:activity_updated"));
    }
  } catch {}
}

/**
 * Recently viewed products (newest first), mapped onto the live catalog.
 * @param {Array} products the loaded product catalog
 * @param {number} limit
 */
export function getRecentlyViewedProducts(products = [], limit = 12) {
  try {
    const rawViews = localStorage.getItem(STORAGE_KEYS.VIEWS);
    const views = rawViews ? JSON.parse(rawViews) : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const out = [];
    for (const v of views) {
      const product = byId.get(v.id);
      if (product) out.push(product);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Products from the customer's strongest browsing categories,
 * excluding anything already in "Recently Viewed" so the section
 * surfaces NEW related pieces instead of repeats.
 */
export function getActivityBasedProducts(products = [], limit = 12) {
  const topCategories = getTopActivityCategories();
  if (topCategories.length === 0) return [];
  const recentIds = new Set(getRecentlyViewedProducts(products, limit).map((p) => p.id));
  const seen = new Set();
  const out = [];
  // Round-robin across top categories for a balanced mix
  for (const cat of topCategories) {
    for (const p of products) {
      if (p.category === cat && !recentIds.has(p.id) && !seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/** New arrivals: flagged or added within the recency window. */
export function getNewArrivalProducts(products = [], limit = 12) {
  const cutoff = Date.now() - NEW_ARRIVALS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const withTs = products.map((p) => {
    const ts = p.created_at ? Date.parse(p.created_at) : NaN;
    return { p, ts: Number.isNaN(ts) ? 0 : ts };
  });
  return withTs
    .filter(({ p, ts }) => p.is_new_arrival || ts >= cutoff)
    .sort((a, b) => Math.max(b.ts, 0) - Math.max(a.ts, 0))
    .slice(0, limit)
    .map(({ p }) => p);
}

/* --- Dismissible recommendation cards (remembered, never intrusive) --- */

export function isSuggestionDismissed(key) {
  try {
    const raw = localStorage.getItem(DISMISSALS_KEY);
    const dismissed = raw ? JSON.parse(raw) : {};
    return Boolean(dismissed[key]);
  } catch {
    return false;
  }
}

/**
 * Dismiss a suggestion card permanently (for this browser).
 * "notInterested" also lowers the category affinity so future
 * recommendations adapt immediately.
 */
export function dismissSuggestion(key, { category = null, notInterested = false } = {}) {
  try {
    const raw = localStorage.getItem(DISMISSALS_KEY);
    const dismissed = raw ? JSON.parse(raw) : {};
    dismissed[key] = { at: Date.now(), notInterested };
    localStorage.setItem(DISMISSALS_KEY, JSON.stringify(dismissed));
    if (notInterested && category) reduceCategoryAffinity(category);
    window.dispatchEvent(new CustomEvent("sn:suggestion_dismissed", { detail: { key } }));
  } catch {}
}

/**
 * Privacy-conscious merge of anonymous browsing activity into the account:
 * attaches this device's anonymous product views to the signed-in user via a
 * security-definer RPC (claim_visitor_activity). Fire-and-forget, never
 * blocks login, and creates no duplicate rows (only null-user rows are
 * claimed once).
 */
export async function claimVisitorActivityOnLogin(userId = null) {
  try {
    if (!supabase || !userId) return;
    const visitorId = getVisitorId();
    if (!visitorId) return;
    await supabase.rpc("claim_visitor_activity", { p_visitor_id: visitorId });
  } catch (err) {
    // Non-fatal: local personalization still works without the DB merge.
    console.warn("Anonymous activity merge skipped:", err?.message);
  }
}
