import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";

const LINKS = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/catalog" },
  { label: "Categories", to: "/categories" },
  { label: "How It Works", to: "/#how-it-works" },
  { label: "Pre-Order", to: "/pre-order" },
  { label: "Contact", to: "/contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

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
      if (path && path !== "/" && location.pathname !== path) {
        navigate(path);
        setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" }), 400);
      } else {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      navigate(to);
    }
  };

  return (
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
            <Link
              to="/login?returnTo=/admin"
              className="text-[11px] tracking-wide-2 uppercase border border-foreground/30 px-4 py-2 hover:bg-foreground hover:text-background transition-colors"
            >
              Admin Login
            </Link>
          </div>

          <button
            className="lg:hidden p-2 -mr-2"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
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
          <Link to="/login?returnTo=/admin" onClick={() => setOpen(false)} className="mt-3 text-center py-3 text-xs tracking-wide-2 uppercase border border-foreground/30">
            Admin Login
          </Link>
        </div>
      </div>
    </header>
  );
}