import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useCart } from "@/lib/CartContext";
import Navbar from "./Navbar";
import Footer from "./Footer";
import WhatsAppFloat from "./WhatsAppFloat";
import OnboardingModal from "./OnboardingModal";
import CartDrawer from "./CartDrawer";
import WishlistDrawer from "./WishlistDrawer";
import InquiryModal from "./InquiryModal";

export default function SiteLayout() {
  const { user, isAuthenticated } = useAuth();
  const { isInquiryModalOpen, closeInquiryModal, inquiryItems } = useCart();
  const [showFirstTimeOnboarding, setShowFirstTimeOnboarding] = useState(false);
  const location = useLocation();
  const hideFooter = location.pathname.startsWith("/messages");

  useEffect(() => {
    if (isAuthenticated && user) {
      const completed = user.user_metadata?.onboarding_completed;
      const dismissed = localStorage.getItem("sn_onboarding_dismissed");
      if (completed !== true && dismissed !== "true") {
        setShowFirstTimeOnboarding(true);
      }
    }
  }, [isAuthenticated, user]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      {/* Bottom navigation clearance on mobile/tablet is handled by the footer
          padding (most pages) and by page-level padding where the footer is
          hidden, so no double padding appears between content and footer. */}
      <main className="flex-1">
        <Outlet />
      </main>
      {!hideFooter && <Footer />}
      <WhatsAppFloat />

      {/* Cart, Wishlist, and Inquiry Slide-Overs */}
      <CartDrawer />
      <WishlistDrawer />
      <InquiryModal
        open={isInquiryModalOpen}
        onClose={closeInquiryModal}
        items={inquiryItems}
      />

      {/* Automatic first-time user onboarding modal */}
      <OnboardingModal
        open={showFirstTimeOnboarding}
        onClose={() => {
          setShowFirstTimeOnboarding(false);
          try {
            localStorage.setItem("sn_onboarding_dismissed", "true");
          } catch {}
        }}
      />
    </div>
  );
}