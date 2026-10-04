import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, SlidersHorizontal, X, SlidersHorizontal as TuneIcon } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isSupabaseConfigured, getSupabaseProducts, supabase } from "@/lib/supabase";
import {
  recordSearchQuery,
  recordCategoryView,
  rankProductsForYou,
  getStoredInterests,
  getRecentlyViewedProducts,
  getActivityBasedProducts,
  getNewArrivalProducts,
  getTopActivityCategories,
  isSuggestionDismissed,
  dismissSuggestion,
} from "@/lib/recommendations";
import ProductCard from "@/components/site/ProductCard";
import ScrollReveal from "@/components/site/ScrollReveal";
import HorizontalProductSection from "@/components/site/HorizontalProductSection";
import BrandedLoader from "@/components/BrandedLoader";
import OnboardingModal from "@/components/site/OnboardingModal";
import PreferencesModal from "@/components/site/PreferencesModal";
import { useAuth } from "@/lib/AuthContext";
import { formatKwachaPrice } from "@/lib/utils";

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name", label: "A–Z" },
];

/**
 * Smart relevance-based search scoring.
 * Connects search terms with product names, categories and descriptions so a
 * query like "station suits" returns relevant station suits AND related
 * products — not just exact text matches.
 */
function scoreProductForQuery(product, q) {
  if (!q) return 0;
  const name = (product.name || "").toLowerCase();
  const category = (product.category || "").toLowerCase();
  const description = (product.description || "").toLowerCase();
  const query = q.toLowerCase().trim();
  const tokens = query.split(/\s+/).filter((t) => t.length >= 2);

  let score = 0;
  if (query && name.includes(query)) score += 100;
  if (query && category.includes(query)) score += 80;

  for (const token of tokens) {
    if (name.includes(token)) score += 30;
    else if (name.split(/\s+/).some((w) => w.startsWith(token))) score += 22;
    if (category.includes(token)) score += 20;
    else if (category.split(/\s+/).some((w) => w.startsWith(token))) score += 14;
    if (description.includes(token)) score += 8;
    // Grade names add matching signal too
    if ((product.grades || []).some((g) => (g.name || "").toLowerCase().includes(token))) score += 6;
  }

  // Phrase partially spans name + category (e.g. "station suits"):
  // reward when all tokens are found somewhere across the product's fields.
  if (tokens.length > 1) {
    const found = tokens.filter(
      (t) => name.includes(t) || category.includes(t) || description.includes(t)
    ).length;
    if (found === tokens.length) score += 25;
  }

  return score;
}

export default function Catalog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [interestsModalOpen, setInterestsModalOpen] = useState(false);
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [recRefreshKey, setRecRefreshKey] = useState(0);

  const category = params.get("category") || "All";
  const sort = params.get("sort") || "newest";

  useEffect(() => {
    if (!search.trim()) return;
    const timer = setTimeout(() => {
      recordSearchQuery(search.trim());
    }, 600);
    return () => clearTimeout(timer);
  }, [search]);

  // Feed real browsing activity into the recommendation engine
  useEffect(() => {
    if (category && category !== "All") recordCategoryView(category);
  }, [category]);

  const [categories, setCategories] = useState(["All"]);

  useEffect(() => {
    async function loadData() {
      try {
        if (isSupabaseConfigured) {
          const [sp, sc] = await Promise.all([
            getSupabaseProducts({ limit: 200 }),
            supabase.from("categories").select("name").order("display_order", { ascending: true })
          ]);

          if (sp && sp.length > 0) {
            setProducts(sp);
          } else {
            // Fallback to base44 if Supabase has no products yet
            const bProducts = await base44.entities.Product.list("-created_date", 200);
            setProducts(bProducts || []);
          }

          if (sc.data && sc.data.length > 0) {
            setCategories(["All", ...sc.data.map(c => c.name)]);
          }
          setLoading(false);
          return;
        }

        const bProducts = await base44.entities.Product.list("-created_date", 200);
        setProducts(bProducts || []);
      } catch (err) {
        console.error("Failed to load catalog data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Keep recommendations live when activity/interests change
  useEffect(() => {
    const handleUpdate = () => setRecRefreshKey((k) => k + 1);
    window.addEventListener("sn:interests_updated", handleUpdate);
    window.addEventListener("sn:likes_updated", handleUpdate);
    window.addEventListener("sn:activity_updated", handleUpdate);
    window.addEventListener("sn:personalization_reset", handleUpdate);
    window.addEventListener("sn:suggestion_dismissed", handleUpdate);
    return () => {
      window.removeEventListener("sn:interests_updated", handleUpdate);
      window.removeEventListener("sn:likes_updated", handleUpdate);
      window.removeEventListener("sn:activity_updated", handleUpdate);
      window.removeEventListener("sn:personalization_reset", handleUpdate);
      window.removeEventListener("sn:suggestion_dismissed", handleUpdate);
    };
  }, []);

  const setCategory = (c) => {
    const next = new URLSearchParams(params);
    if (c === "All") next.delete("category");
    else next.set("category", c);
    setParams(next);
  };
  const setSort = (s) => {
    const next = new URLSearchParams(params);
    next.set("sort", s);
    setParams(next);
  };

  // ---- Smart search: relevance-scored results ----
  const searchResults = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    return products
      .map((p) => ({ p, score: scoreProductForQuery(p, q) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ p }) => p);
  }, [products, search]);

  const searchSuggestions = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return searchResults?.slice(0, 6) || [];
  }, [searchResults, search]);

  const filtered = useMemo(() => {
    // While searching: relevance-ranked results
    if (searchResults) {
      let list = [...searchResults];
      if (category !== "All") {
        const target = category.toLowerCase().trim();
        const inCat = list.filter((p) => (p.category || "").toLowerCase().trim() === target);
        // Keep related results from other categories below exact-category ones
        const rest = list.filter((p) => (p.category || "").toLowerCase().trim() !== target);
        list = [...inCat, ...rest];
      }
      return list;
    }

    let list = [...products];
    if (category !== "All") {
      const target = category.toLowerCase().trim();
      list = list.filter((p) => {
        const cat = (p.category || "").toLowerCase().trim();
        return cat === target;
      });
    }
    const priceNum = (p) => {
      const m = String(p.price ?? "").replace(/[^0-9.]/g, "");
      return m ? parseFloat(m) : 0;
    };
    if (sort === "price-asc") list.sort((a, b) => priceNum(a) - priceNum(b));
    else if (sort === "price-desc") list.sort((a, b) => priceNum(b) - priceNum(a));
    else if (sort === "name") list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }, [products, category, sort, searchResults]);

  // ---- Personalized recommendation sections (activity-driven, not random) ----
  const {
    forYouSection,
    hasPersonalization,
    recentlyViewed,
    activitySection,
    activityCategories,
    newArrivals,
    newArrivalBanner,
  } = useMemo(() => {
    const currentInterests = user?.user_metadata?.interests || getStoredInterests();
    const ranked = rankProductsForYou(products, { interests: currentInterests });
    const recent = getRecentlyViewedProducts(products, 12);
    const activityCats = getTopActivityCategories(3);
    const activity = getActivityBasedProducts(products, 12);
    const arrivals = getNewArrivalProducts(products, 12);

    // One quiet, dismissible "New Arrivals" card for the freshest product the
    // customer hasn't seen, only if it belongs to a category they actually
    // browse. Never a popup — an inline card with X / "Not interested".
    let banner = null;
    for (const p of arrivals) {
      if (!recent.some((r) => r.id === p.id) && !isSuggestionDismissed(`new_arrival_${p.id}`)) {
        banner = p;
        break;
      }
    }

    return {
      forYouSection: ranked.forYouSection,
      hasPersonalization: ranked.hasPersonalization,
      recentlyViewed: recent,
      activitySection: activity,
      activityCategories: activityCats,
      newArrivals: arrivals,
      newArrivalBanner: banner,
    };
  }, [products, user, recRefreshKey]);

  const popularInCategory = useMemo(() => {
    if (category === "All") return [];
    const target = category.toLowerCase().trim();
    return products
      .filter((p) => (p.category || "").toLowerCase().trim() === target)
      .sort((a, b) => Number(Boolean(b.is_popular)) - Number(Boolean(a.is_popular)))
      .slice(0, 12);
  }, [products, category]);

  const tuneInterestsAction = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setInterestsModalOpen(true)}
        className="inline-flex items-center gap-1.5 text-[10px] tracking-wide-2 uppercase border border-foreground/30 px-3 py-1.5 hover:bg-foreground hover:text-background transition-colors"
      >
        <TuneIcon className="w-3.5 h-3.5" /> Tune Interests
      </button>
      <button
        type="button"
        onClick={() => setPreferencesModalOpen(true)}
        aria-label="Personalization & Privacy Preferences"
        className="p-1.5 border border-foreground/30 hover:bg-foreground hover:text-background transition-colors"
        title="Privacy & Personalization Settings"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const dismissBanner = (notInterested) => {
    if (!newArrivalBanner) return;
    dismissSuggestion(`new_arrival_${newArrivalBanner.id}`, {
      category: newArrivalBanner.category,
      notInterested,
    });
  };

  const isSearching = Boolean(search.trim());

  return (
    <div className="pt-20">
      {/* Header */}
      <section className="border-b border-border py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-5 md:px-8 text-center">
          <ScrollReveal>
            <p className="text-[11px] tracking-luxe uppercase text-muted-foreground">The Collection</p>
            <h1 className="font-display text-5xl md:text-6xl mt-3">Shop The Catalog</h1>
            <p className="mt-4 text-sm font-light text-muted-foreground max-w-md mx-auto">
              Curated pieces, sourced on request. Delivery across Lusaka in 7–14 working days.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* Controls */}
      <div className="sticky top-16 md:top-20 z-30 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="mx-auto max-w-7xl px-5 md:px-8 py-4 flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`text-[11px] tracking-wide-2 uppercase px-4 py-2 whitespace-nowrap transition-colors ${
                  category === c ? "bg-foreground text-background" : "border border-border hover:border-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex gap-3 items-center">
            <div className="relative flex-1 md:flex-none md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search products, e.g. station suits"
                className="w-full md:w-64 pl-9 pr-8 py-2 text-sm bg-transparent border border-border focus:border-foreground outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Search suggestions dropdown */}
              {showSuggestions && searchSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-background border border-border shadow-lg max-h-80 overflow-y-auto">
                  {searchSuggestions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setShowSuggestions(false);
                        navigate(`/product/${p.id}`);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors border-b border-border/40 last:border-b-0"
                    >
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt="" className="w-10 h-12 object-cover flex-shrink-0" loading="lazy" />
                      ) : (
                        <div className="w-10 h-12 bg-muted flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium line-clamp-1">{p.name}</p>
                        <p className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">
                          {p.category} • {formatKwachaPrice(p.price)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="appearance-none pl-9 pr-8 py-2 text-sm bg-transparent border border-border focus:border-foreground outline-none cursor-pointer"
              >
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          {loading ? (
            <BrandedLoader fullScreen={false} text="Loading Catalog..." />
          ) : (
            <>
              <p className="text-[11px] tracking-wide-2 uppercase text-muted-foreground mb-8">
                {isSearching
                  ? `${filtered.length} result${filtered.length === 1 ? "" : "s"} for “${search.trim()}”`
                  : `${filtered.length} ${filtered.length === 1 ? "piece" : "pieces"}`}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 md:gap-6">
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="text-center py-20">
                  <p className="font-display text-3xl">No products found</p>
                  <p className="text-sm text-muted-foreground mt-2">Try a different category or search term.</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ---- Personalized recommendation sections (not shown while searching) ---- */}
      {!loading && !isSearching && (
        <>
          {/* Quiet, dismissible New Arrivals card */}
          {newArrivalBanner && (
            <div className="mx-auto max-w-7xl px-5 md:px-8">
              <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4 border border-border bg-muted/20 p-4">
                {newArrivalBanner.images?.[0] && (
                  <img
                    src={newArrivalBanner.images[0]}
                    alt={newArrivalBanner.name}
                    className="w-20 h-20 object-cover flex-shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] tracking-wide-2 uppercase text-muted-foreground">New Arrival</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/product/${newArrivalBanner.id}`)}
                    className="font-display text-lg hover:opacity-70 transition-opacity line-clamp-1 text-left"
                  >
                    {newArrivalBanner.name}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Just added in {newArrivalBanner.category} — {formatKwachaPrice(newArrivalBanner.price)}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => dismissBanner(true)}
                    className="text-[10px] tracking-wide-2 uppercase text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 transition-colors"
                  >
                    Not interested
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissBanner(false)}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Dismiss new arrival card"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recommended For You — real browsing activity, ranked by the FYP engine */}
          {hasPersonalization && forYouSection.length > 0 && (
            <HorizontalProductSection
              eyebrow="Personalized For You"
              title="Recommended For You"
              products={forYouSection}
              viewAllTo="/catalog"
              action={tuneInterestsAction}
            />
          )}

          {/* Based on Your Activity — top browsed categories */}
          {activitySection.length > 0 && activityCategories.length > 0 && (
            <div className="bg-muted/15 border-y border-border/50">
              <HorizontalProductSection
                eyebrow="Based on Your Activity"
                title={`Because you browsed ${activityCategories.slice(0, 2).join(" & ")}`}
                products={activitySection}
                viewAllTo={`/catalog?category=${encodeURIComponent(activityCategories[0])}`}
              />
            </div>
          )}

          {/* Recently Viewed */}
          {recentlyViewed.length > 0 && (
            <HorizontalProductSection
              eyebrow="Pick Up Where You Left Off"
              title="Recently Viewed"
              products={recentlyViewed}
            />
          )}

          {/* New Arrivals */}
          {newArrivals.length > 0 && (
            <HorizontalProductSection
              eyebrow="Just In"
              title="New Arrivals"
              products={newArrivals}
              viewAllTo="/catalog?sort=newest"
            />
          )}

          {/* Popular in the selected category */}
          {popularInCategory.length > 0 && (
            <HorizontalProductSection
              eyebrow="Customer Favourites"
              title={`Popular in ${category}`}
              products={popularInCategory}
              viewAllTo={`/catalog?category=${encodeURIComponent(category)}`}
            />
          )}
        </>
      )}

      {/* Shopping Interests Onboarding & Customization Modal */}
      <OnboardingModal
        open={interestsModalOpen}
        onClose={() => setInterestsModalOpen(false)}
        isEditMode={true}
      />

      {/* Privacy and Personalization Preferences Modal */}
      <PreferencesModal
        open={preferencesModalOpen}
        onClose={() => setPreferencesModalOpen(false)}
        onOpenInterests={() => setInterestsModalOpen(true)}
      />
    </div>
  );
}
