import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, Sliders, Sparkles, Heart, ShoppingBag } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useCart } from "@/lib/CartContext";
import PreferencesModal from "./PreferencesModal";
import OnboardingModal from "./OnboardingModal";
import SignOutModal from "./SignOutModal";
import { ModeToggle } from "@/components/ModeToggle";

const LINKS = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/catalog" },
  { label: "Categories", to: "/categories" },
  { label: "How It Works", to: "/how-it-works" },
  { label: "Pre-Order", to: "/pre-order" },
  { label: "Contact", to: "/contact" },
];

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { cartCount, wishlistCount, openCart, openWishlist } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [interestsOpen, setInterestsOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const location = useLocation();

  const navigate = useNavigate();

  // Check if email account is awaiting verification (Google users are automatically verified)
  const isEmailUnverified =
    isAuthenticated &&
    user?.app_metadata?.provider === "email" &&
    !user?.email_confirmed_at;

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

            <div className="hidden lg:flex items-center gap-8">
              {LINKS.map((l) => (
                <button
                  key={l.label}
                  onClick={() => handleNav(l.to)}
                  className="text-[11px] tracking-wide-2 uppercase text-foreground/80 hover:text-foreground transition-colors relative after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-foreground after:transition-all hover:after:w-full"
                >
                  {l.label}
                </button>
              ))}

              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <Link
                      to="/admin"
                      className="text-[10px] tracking-wide-2 uppercase bg-foreground text-background px-3 py-1.5 hover:opacity-85 transition-opacity"
                    >
                      Admin Panel
                    </Link>
                  )}
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

              {/* Inquiry Cart & Wishlist Trigger Icons */}
              <div className="flex items-center gap-2 border-l border-border/80 pl-4">
                <ModeToggle />

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
                    <span className="absolute -top-1 -right-1 bg-[#C5A059] text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-in zoom-in">
                      {cartCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Mobile Header Controls */}
            <div className="flex items-center gap-1 lg:hidden">
              <ModeToggle />
              <button
                type="button"
                onClick={openWishlist}
                className="relative p-2 text-foreground/80 hover:text-foreground"
                aria-label={`Wishlist (${wishlistCount} items)`}
              >
                <Heart className="w-5 h-5" />
                {wishlistCount > 0 && (
                  <span className="absolute top-1 right-1 bg-red-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {wishlistCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={openCart}
                className="relative p-2 text-foreground/80 hover:text-foreground"
                aria-label={`Inquiry Cart (${cartCount} items)`}
              >
                <ShoppingBag className="w-5 h-5" />
                {cartCount > 0 && (
                  <span className="absolute top-1 right-1 bg-[#C5A059] text-black text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
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
          className={`lg:hidden overflow-hidden border-t border-border bg-background transition-[max-height] duration-500 ${
            open ? "max-h-[80vh]" : "max-h-0"
          }`}
        >
          <div className="flex flex-col px-5 py-4 gap-1">
            {LINKS.map((l) => (
              <button
                key={l.label}
                onClick={() => handleNav(l.to)}
                className="text-left py-3 text-sm tracking-wide-2 uppercase border-b border-border/60 last:border-0"
              >
                {l.label}
              </button>
            ))}
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
                    {isAdmin && (
                      <Link to="/admin" onClick={() => setOpen(false)} className="text-[10px] tracking-wide-2 uppercase text-[#C5A059] underline inline-block">
                        Admin Panel →
                      </Link>
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
    </>
  );
}