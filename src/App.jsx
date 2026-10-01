import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import Catalog from './pages/Catalog';
import ProductDetail from './pages/ProductDetail';
import Categories from './pages/Categories';
import PreOrder from './pages/PreOrder';
import HowItWorks from './pages/HowItWorks';
import Contact from './pages/Contact';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Privacy from './pages/Privacy';
import Accessibility from './pages/Accessibility';
import RefundPolicy from './pages/RefundPolicy';
import TermsAndConditions from './pages/TermsAndConditions';
import Messages from './pages/Messages';
import AdminLayout from '@/components/admin/AdminLayout';
import SiteLayout from '@/components/site/SiteLayout';
import Dashboard from './pages/admin/Dashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminCategories from './pages/admin/AdminCategories';
import AdminPreorders from './pages/admin/AdminPreorders';
import AdminInquiries from './pages/admin/AdminInquiries';
import AdminInbox from './pages/admin/AdminInbox';
import AdminModeration from './pages/admin/AdminModeration';
import AdminPortalLogin from './pages/AdminPortalLogin';
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
    <Routes>
      {/* Customer Auth */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Secure Non-Public Admin Portal Entry */}
      <Route path="/system-admin-portal" element={<AdminPortalLogin />} />

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
      </Route>

      {/* Admin */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={<AdminInbox />} />
        <Route path="inquiries" element={<AdminInquiries />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="preorders" element={<AdminPreorders />} />
        <Route path="moderation" element={<AdminModeration />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


import { ThemeProvider } from '@/components/ThemeProvider';

function App() {

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme" attribute="class">
      <AuthProvider>
        <CartProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <ScrollToTop />
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