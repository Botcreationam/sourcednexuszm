import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Menu, X, LogOut, Sliders, Heart, ShoppingBag, MessageSquare, Home, Bell, Store, Search, ReceiptText } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useCart } from "@/lib/CartContext";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatKwachaPrice } from "@/lib/utils";
import PreferencesModal from "./PreferencesModal";
import OnboardingModal from "./OnboardingModal";
import SignOutModal from "./SignOutModal";
import NotificationsDrawer from "./NotificationsDrawer";
import { ModeToggle } from "@/components/ModeToggle";
import { productPath } from "@/lib/productUrl";

const LINKS = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/catalog" },
  { label: "New Arrivals", to: "/catalog?sort=newest" },
  { label: "Bundles", to: "/bundles" },
  { label: "Categories", to: "/categories" },
  { label: "How It Works", to: "/how-it-works" },
  { label: "Pre-Order", to: "/pre-order" },
  { label: "Contact", to: "/contact" },
];

// Mobile hamburger shows only secondary sections. The primary sections
// (Home, Shop, Saved, Inbox, Cart) live exclusively in the bottom navigation
// so the navigation never appears duplicated on mobile screens.
const MOBILE_MENU_LINKS = [
  { label: "New Arrivals", to: "/catalog?sort=newest" },
  { label: "Bundles", to: "/bundles" },
  { label: "Categories", to: "/categories" },
  { label: "How It Works", to: "/how-it-works" },
  { label: "Pre-Order", to: "/pre-order" },
  { label: "Contact", to: "/contact" },
];

/**
 * One tab of the mobile bottom navigation.
 * Active state uses the brand gold (#C5A059) with a top indicator bar.
 */
/** Spoken suffix for a tab badge. The visible label always comes first so
 *  voice control ("click Cart") and screen readers match the on-screen text. */
function badgeNoun(label, n) {
  if (label === "Cart") return n === 1 ? "item" : "items";
  if (label === "Inbox") return n === 1 ? "unread message" : "unread messages";
  return "new";
}
function NavTab({ icon: Icon, label, active = false, onClick, badge = 0, badgeClass = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={badge > 0 ? `${label}, ${badge > 9 ? "more than 9" : badge} ${badgeNoun(label, badge)}` : label}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center h-full gap-1 transition-colors ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {active && (
        <span className="absolute top-0 inset-x-4 h-[2px] bg-[#C5A059]" aria-hidden="true" />
      )}
      <span className="relative">
        <Icon className={`w-5 h-5 ${active ? "text-[#C5A059]" : ""}`} strokeWidth={active ? 2 : 1.75} />
        {badge > 0 && (
          <span
            key={badge}
            aria-hidden="true"
            className={`sn-pop absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold ${badgeClass}`}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className={`text-[9px] uppercase tracking-wide-2 ${active ? "font-medium" : ""}`}>{label}</span>
    </button>
  );
}

/**
 * Inline header search form (pill input + suggestion dropdown).
 * Renders on the same row as the logo on every screen size.
 */
function HeaderSearchForm({
  value,
  onChange,
  onSubmit,
  suggestions,
  showSuggestions,
  onFocus,
  onBlur,
  onPick,
  inputRef,
  placeholder = "Search products...",
  className = "",
}) {
  return (
    <form onSubmit={onSubmit} className={`flex-1 min-w-0 ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-label="Search products"
          className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm bg-transparent border border-border rounded-full focus:border-foreground outline-none"
        />
        {/* Search suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-background border border-border shadow-lg max-h-80 overflow-y-auto">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(p);
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
    </form>
  );
}

export default function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const { cartCount, wishlistCount, isCartOpen, isWishlistOpen, openCart, openWishlist } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [navSearch, setNavSearch] = useState("");
  const [navSuggestions, setNavSuggestions] = useState([]);
  const [showNavSuggestions, setShowNavSuggestions] = useState(false);
  const [desktopSearchOpen, setDesktopSearchOpen] = useState(false);
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const navigate = useNavigate();

  // Debounced product suggestions for the header search bar
  useEffect(() => {
    const q = navSearch.trim();
    if (!isSupabaseConfigured || q.length < 2) {
      setNavSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from("products")
          .select("id,name,category,price,images")
          .neq("status", "hidden")
          .ilike("name", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(5);
        setNavSuggestions(data || []);
      } catch {
        setNavSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [navSearch]);

  const handleNavSearchChange = (e) => {
    const q = e.target.value;
    setNavSearch(q);
    setShowNavSuggestions(true);
    // Live filtering while already on the catalog page
    if (location.pathname === "/catalog") {
      const next = new URLSearchParams(params);
      if (q.trim()) next.set("search", q);
      else next.delete("search");
      setParams(next, { replace: true });
    }
  };

  const handleNavSearchSubmit = (e) => {
    e.preventDefault();
    const q = navSearch.trim();
    setShowNavSuggestions(false);
    if (!q) return;
    const next = new URLSearchParams();
    next.set("search", q);
    navigate(`/catalog?${next.toString()}`);
  };

  const handleNavSuggestionPick = (p) => {
    setShowNavSuggestions(false);
    setDesktopSearchOpen(false);
    navigate(productPath(p));
  };

  const closeDesktopSearch = () => {
    setDesktopSearchOpen(false);
    setShowNavSuggestions(false);
  };

  // Check if email account is awaiting verification (Google users are automatically verified)
  const isEmailUnverified =
    isAuthenticated &&
    user?.app_metadata?.provider === "email" &&
    !user?.email_confirmed_at;

  useEffect(() => {
    if (isAuthenticated && user) {
      const fetchUnread = async () => {
        const { count } = await supabase
          .from("customer_inquiries")
          .select("*", { count: 'exact', head: true })
          .eq("user_id", user.id)
          .eq("has_unread_customer", true);
        if (count !== null) setUnreadMessages(count);
      };
      fetchUnread();
      
      const channel = supabase.channel('navbar-messages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_inquiries', filter: `user_id=eq.${user.id}` }, () => {
          fetchUnread();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const handleNav = (to) => {
    setOpen(false);
    if (to.includes("#")) {
      const [path, hash] = to.split("#");
      const targetPath = path || "/";
      if (location.pathname !== targetPath) {
        navigate(to);
      } else {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth" });
        }
      }
    } else {
      navigate(to);
    }
  };

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-500 ${
          scrolled ? "bg-background/90 backdrop-blur-md border-b border-border" : "bg-transparent"
        }`}
      >
        <nav className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="flex h-16 md:h-20 items-center justify-between">
            <Link to="/" className="group flex items-center gap-3" onClick={() => setOpen(false)}>
              <img src="https://media.base44.com/images/public/6abc6a8a4b6c9d175aa35566/e89637ef7_generated_image.png" alt="Sourced Nexus" className="h-10 md:h-12 w-auto object-contain" />
              <span className="hidden sm:block leading-none">
                <span className="block font-display text-xl md:text-2xl tracking-wide-2">SOURCED NEXUS</span>
                <span className="block text-[9px] tracking-luxe text-muted-foreground mt-0.5">LUSAKA • ZAMBIA</span>
              </span>
            </Link>

            <div className="hidden xl:flex items-center gap-7">
              {desktopSearchOpen ? (
                <>
                  <HeaderSearchForm
                    value={navSearch}
                    onChange={handleNavSearchChange}
                    onSubmit={handleNavSearchSubmit}
                    suggestions={navSuggestions}
                    showSuggestions={showNavSuggestions}
                    onFocus={() => setShowNavSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowNavSuggestions(false), 150)}
                    onPick={handleNavSuggestionPick}
                    className="mr-2"
                  />
                  <button
                    type="button"
                    onClick={closeDesktopSearch}
                    aria-label="Close search"
                    className="text-muted-foreground hover:text-foreground transition-colors p-1.5 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
              <>
              {LINKS.map((l) => (
                <button
                  key={l.label}
                  onClick={() => handleNav(l.to)}
                  className="whitespace-nowrap text-[11px] tracking-wide-2 uppercase text-foreground/80 hover:text-foreground transition-colors relative after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-foreground after:transition-all hover:after:w-full"
                >
                  {l.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDesktopSearchOpen(true)}
                aria-label="Search"
                title="Search"
                className="text-foreground/80 hover:text-foreground transition-colors p-1 flex-shrink-0"
              >
                <Search className="w-4 h-4" />
              </button>
              </>
              )}

              {isAuthenticated ? (
                <div className="flex items-center gap-3">

                  {isEmailUnverified && (
                    <span
                      title="Please check your email inbox to verify your account"
                      className="text-[9px] uppercase tracking-wide-2 text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded cursor-help"
                    >
                      Verify Email
                    </span>
                  )}
                  <span className="text-[10px] tracking-wide-2 uppercase text-muted-foreground truncate max-w-[130px]" title={user?.email}>
                    {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleNav("/account/orders")}
                    title="My Orders"
                    aria-label="My Orders"
                    className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                  >
                    <ReceiptText className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferencesOpen(true)}
                    title="Preferences & Interests"
                    className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSignOutOpen(true)}
                    title="Sign Out"
                    className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="text-[11px] tracking-wide-2 uppercase border border-foreground/30 px-4 py-2 hover:bg-foreground hover:text-background transition-colors"
                >
                  Sign In
                </Link>
              )}

              {/* Inquiry Cart, Messages & Wishlist Trigger Icons */}
              <div className="flex items-center gap-2 border-l border-border/80 pl-4">
                <ModeToggle />

                {isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => handleNav("/messages")}
                    className="relative p-2 text-foreground/80 hover:text-foreground transition-all hover:scale-110"
                    title="Messages"
                  >
                    <MessageSquare className="w-4 h-4" />
                    {unreadMessages > 0 && (
                      <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-in zoom-in">
                        {unreadMessages}
                      </span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={openWishlist}
                  className="relative p-2 text-foreground/80 hover:text-foreground transition-all hover:scale-110"
                  title="Saved / Wishlist"
                  aria-label={`Wishlist (${wishlistCount} items)`}
                >
                  <Heart className="w-4 h-4" />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-in zoom-in">
                      {wishlistCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={openCart}
                  className="relative p-2 text-foreground/80 hover:text-foreground transition-all hover:scale-110"
                  title="Inquiry Cart"
                  aria-label={`Inquiry Cart (${cartCount} items)`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  {cartCount > 0 && (
                    <span key={cartCount} className="sn-pop absolute -top-1 -right-1 bg-[#C5A059] text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Header search bar — same line as the logo on mobile & tablet */}
            <HeaderSearchForm
              value={navSearch}
              onChange={handleNavSearchChange}
              onSubmit={handleNavSearchSubmit}
              suggestions={navSuggestions}
              showSuggestions={showNavSuggestions}
              onFocus={() => setShowNavSuggestions(true)}
              onBlur={() => setTimeout(() => setShowNavSuggestions(false), 150)}
              onPick={handleNavSuggestionPick}
              className="mx-3 xl:hidden"
            />

            {/* Mobile Header Controls: theme, notifications and secondary menu only.
                Primary navigation (Home, Shop, Saved, Inbox, Cart) lives in the
                fixed bottom bar so it never duplicates at the top of the screen. */}
            <div className="flex items-center gap-1 xl:hidden">
              <ModeToggle />
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(true)}
                  className="relative p-2 text-foreground/80 hover:text-foreground"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadMessages > 0 && (
                    <span className="absolute top-1 right-1 bg-blue-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                      {unreadMessages}
                    </span>
                  )}
                </button>
              )}
              <button
                className="p-2 -mr-1"
                onClick={() => setOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </nav>


        {/* Mobile menu */}
        <div
          className={`xl:hidden overflow-hidden border-t border-border bg-background transition-[max-height] duration-500 ${
            open ? "max-h-[80vh]" : "max-h-0"
          }`}
        >
          <div className="flex flex-col px-5 py-4 gap-1">
            {MOBILE_MENU_LINKS.map((l) => (
              <button
                key={l.label}
                onClick={() => handleNav(l.to)}
                className="text-left py-3 text-sm tracking-wide-2 uppercase border-b border-border/60 last:border-0"
              >
                {l.label}
              </button>
            ))}
            {isAuthenticated && (
              <>
                <button
                  onClick={() => handleNav("/account/orders")}
                  className="text-left py-3 text-sm tracking-wide-2 uppercase border-b border-border/60"
                >
                  My Orders
                </button>
                <button
                  onClick={() => { setOpen(false); setNotificationsOpen(true); }}
                  className="text-left py-3 text-sm tracking-wide-2 uppercase border-b border-border/60 flex items-center justify-between text-[#C5A059]"
                >
                  Notifications
                </button>
              </>
            )}
            {isAuthenticated ? (
              <div className="pt-3 mt-2 border-t border-border space-y-3">
                <div className="flex flex-col gap-1">
                  <p className="text-xs uppercase tracking-wide-2 text-foreground break-all">{user?.email}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {isEmailUnverified && (
                      <span className="text-[9px] uppercase tracking-wide-2 text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded inline-block">
                        Unverified Email
                      </span>
                    )}

                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setPreferencesOpen(true); }}
                    className="flex-1 text-xs uppercase tracking-wide-2 text-muted-foreground hover:text-foreground p-2 border border-border text-center"
                  >
                    Preferences
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setSignOutOpen(true); }}
                    className="flex-1 text-xs uppercase tracking-wide-2 text-muted-foreground hover:text-foreground p-2 border border-border text-center"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <Link to="/login" onClick={() => setOpen(false)} className="mt-3 text-center py-3 text-xs tracking-wide-2 uppercase border border-foreground/30">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Bottom Navigation (primary navigation below lg).
          Fixed to the viewport bottom, never covers content (SiteLayout/Footer
          provide matching bottom padding) and supports iPhone safe areas.
          Hidden on the public landing page ("/"): that page is marketing, not
          the shopping experience, so it must not show shopping navigation. */}
      {location.pathname !== "/" && (
      <nav
        className="xl:hidden fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur-md border-t border-border pb-safe"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5 h-[60px] items-center">
          <NavTab
            icon={Home}
            label="Home"
            active={location.pathname === "/"}
            onClick={() => handleNav("/")}
          />
          <NavTab
            icon={Store}
            label="Shop"
            active={location.pathname.startsWith("/catalog") || location.pathname.startsWith("/categories")}
            onClick={() => handleNav("/catalog")}
          />
          <NavTab
            icon={Heart}
            label="Saved"
            active={isWishlistOpen}
            onClick={openWishlist}
            badge={wishlistCount}
            badgeClass="bg-red-500 text-white"
          />
          <NavTab
            icon={MessageSquare}
            label="Inbox"
            active={location.pathname.startsWith("/messages")}
            onClick={() => handleNav("/messages")}
            badge={unreadMessages}
            badgeClass="bg-blue-500 text-white"
          />
          <NavTab
            icon={ShoppingBag}
            label="Cart"
            active={isCartOpen}
            onClick={openCart}
            badge={cartCount}
            badgeClass="bg-[#C5A059] text-black"
          />
        </div>
      </nav>
      )}

      {/* Preferences & Interests Modals */}
      <PreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        onOpenInterests={() => setInterestsOpen(true)}
      />
      <OnboardingModal
        open={interestsOpen}
        onClose={() => setInterestsOpen(false)}
        isEditMode={true}
      />
      <SignOutModal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
      />
      <NotificationsDrawer 
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </>
  );
}