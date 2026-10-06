import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, Navigate, NavLink } from "react-router-dom";
import { LayoutDashboard, Shirt, Tags, ClipboardList, ExternalLink, LogOut, Menu, X, MessageSquareQuote, ShieldAlert, Inbox, Receipt, Megaphone } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { ModeToggle } from "@/components/ModeToggle";

const NAV = [
  { to: "/secure/nexuspanel-trust", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/secure/nexuspanel-trust/inbox", label: "Inbox", icon: Inbox },
  { to: "/secure/nexuspanel-trust/inquiries", label: "Customer Inquiries", icon: MessageSquareQuote },
  { to: "/secure/nexuspanel-trust/products", label: "Products", icon: Shirt },
  { to: "/secure/nexuspanel-trust/categories", label: "Categories", icon: Tags },
  { to: "/secure/nexuspanel-trust/preorders", label: "Pre-Orders", icon: ClipboardList },
  { to: "/secure/nexuspanel-trust/orders", label: "Orders", icon: Receipt },
  { to: "/secure/nexuspanel-trust/moderation", label: "Moderation", icon: ShieldAlert },
  { to: "/secure/nexuspanel-trust/announcements", label: "Announcements", icon: Megaphone },
];


import BrandedLoader from "@/components/BrandedLoader";

export default function AdminLayout() {
  const { user, isAuthenticated, isAdmin, isLoadingAuth, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  if (isLoadingAuth) {
    return <BrandedLoader text="Verifying Portal Privileges..." />;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="font-display text-4xl">Access Denied</h1>
          <p className="mt-3 text-sm text-muted-foreground">You do not have verified administrator privileges for this portal.</p>
          <Link to="/" className="mt-6 inline-block text-[11px] tracking-wide-2 uppercase border-b border-foreground pb-0.5">Back to Site</Link>
        </div>
      </div>
    );
  }

  const doLogout = () => { logout(false); navigate("/login"); };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-6 py-6 border-b border-border">
        <p className="font-display text-xl tracking-wide-2">SOURCED NEXUS</p>
        <p className="text-[9px] tracking-luxe text-muted-foreground mt-0.5">ADMIN PANEL</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-3 text-sm tracking-wide-2 uppercase transition-colors ${isActive ? "bg-foreground text-background" : "text-foreground/70 hover:bg-muted"}`}
          >
            <n.icon className="w-4 h-4" strokeWidth={1.5} /> {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-border space-y-1">
        <Link to="/" target="_blank" className="flex items-center gap-3 px-3 py-3 text-sm tracking-wide-2 uppercase text-foreground/70 hover:bg-muted">
          <ExternalLink className="w-4 h-4" strokeWidth={1.5} /> View Site
        </Link>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm tracking-wide-2 uppercase text-foreground/70">Theme</span>
          <ModeToggle />
        </div>
        <button onClick={doLogout} className="w-full flex items-center gap-3 px-3 py-3 text-sm tracking-wide-2 uppercase text-foreground/70 hover:bg-muted">
          <LogOut className="w-4 h-4" strokeWidth={1.5} /> Logout
        </button>
        <p className="px-3 pt-2 text-[10px] text-muted-foreground truncate">{user?.email}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-64 border-r border-border bg-card sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-card border-b border-border flex items-center justify-between px-4 h-14">
        <span className="font-display text-lg tracking-wide-2">SOURCED NEXUS</span>
        <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="w-6 h-6" /></button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-card border-r border-border h-full"><SidebarContent /></div>
          <button className="flex-1 bg-foreground/30" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="w-6 h-6 text-cream ml-4 mt-4" />
          </button>
        </div>
      )}

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}