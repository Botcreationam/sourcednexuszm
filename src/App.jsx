import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { lazy, Suspense } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import SiteLayout from '@/components/site/SiteLayout';

// Route-level code splitting: each page ships as its own chunk so the first
// load only downloads what the visitor's route needs. This matters on slow
// mobile connections — previously every page (including all admin screens
// and charts) arrived in one 1.6MB bundle before anything could render.
const Home = lazy(() => import('./pages/Home'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Catalog = lazy(() => import('./pages/Catalog'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Categories = lazy(() => import('./pages/Categories'));
const PreOrder = lazy(() => import('./pages/PreOrder'));
const HowItWorks = lazy(() => import('./pages/HowItWorks'));
const Contact = lazy(() => import('./pages/Contact'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Accessibility = lazy(() => import('./pages/Accessibility'));
const RefundPolicy = lazy(() => import('./pages/RefundPolicy'));
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'));
const Messages = lazy(() => import('./pages/Messages'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminPreorders = lazy(() => import('./pages/admin/AdminPreorders'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminInquiries = lazy(() => import('./pages/admin/AdminInquiries'));
const AdminInbox = lazy(() => import('./pages/admin/AdminInbox'));
const AdminModeration = lazy(() => import('./pages/admin/AdminModeration'));

import { CartProvider } from '@/lib/CartContext';

import BrandedLoader from '@/components/BrandedLoader';

const AuthenticatedApp = () => {
  const { isLoadingAuth, authChecked } = useAuth();

  // Show luxury branded loader while initial auth state resolves on boot
  if (isLoadingAuth && !authChecked) {
    return <BrandedLoader text="Loading Sourced Nexus..." />;
  }

  // Render the main app — visitors browse freely without being forced to authenticate
  return (
    <Suspense fallback={<BrandedLoader text="Loading Sourced Nexus..." />}>
    <Routes>
      {/* Customer Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />


      {/* Customer storefront */}
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/pre-order" element={<PreOrder />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/accessibility" element={<Accessibility />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/checkout" element={<Checkout />} />
      </Route>

      {/* Admin */}
      <Route path="/secure/nexuspanel-trust" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={<AdminInbox />} />
        <Route path="inquiries" element={<AdminInquiries />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="preorders" element={<AdminPreorders />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="moderation" element={<AdminModeration />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


import { ThemeProvider } from '@/components/ThemeProvider';
import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { trackWebsiteVisit } from '@/lib/analytics';

function AnalyticsTracker() {
  const location = useLocation();
  
  useEffect(() => {
    trackWebsiteVisit(location);
  }, [location]);

  return null;
}

function App() {

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme" attribute="class">
      <AuthProvider>
        <CartProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <ScrollToTop />
              <AnalyticsTracker />
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </QueryClientProvider>
        </CartProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App