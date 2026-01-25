import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import CustomerLayout from './layouts/CustomerLayout';
import { PageFallback, RequireRole } from './components/routing';

// Route-level code splitting (doc 5.1): 3D and GSAP load only where used
const Landing = lazy(() => import('./features/landing/Landing'));
const Explore = lazy(() => import('./features/catalog/Explore'));
const ShopPage = lazy(() => import('./features/catalog/ShopPage'));
const Checkout = lazy(() => import('./features/checkout/Checkout'));
const Orders = lazy(() => import('./features/account/Orders'));
const OrderTracking = lazy(() => import('./features/tracking/OrderTracking'));
const ReportProblem = lazy(() => import('./features/account/ReportProblem'));
const Account = lazy(() => import('./features/account/Account'));
const Notifications = lazy(() => import('./features/account/Notifications'));
const SignIn = lazy(() => import('./features/auth/SignIn'));
const DesignSystem = lazy(() => import('./features/design/DesignSystem'));
const SellerApp = lazy(() => import('./features/seller/SellerApp'));
const RiderApp = lazy(() => import('./features/rider/RiderApp'));
const NotFound = lazy(() => import('./features/NotFound'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<CustomerLayout />}>
            <Route index element={<Landing />} />
            <Route path="shop" element={<Explore />} />
            <Route path="shop/:sellerId" element={<ShopPage />} />
            <Route path="checkout" element={<RequireRole role="customer"><Checkout /></RequireRole>} />
            <Route path="orders" element={<RequireRole role="customer"><Orders /></RequireRole>} />
            <Route path="orders/:id" element={<RequireRole role="customer"><OrderTracking /></RequireRole>} />
            <Route path="orders/:id/report" element={<RequireRole role="customer"><ReportProblem /></RequireRole>} />
            <Route path="account" element={<RequireRole role="customer"><Account /></RequireRole>} />
            <Route path="notifications" element={<RequireRole role="customer"><Notifications /></RequireRole>} />
            <Route path="signin" element={<SignIn />} />
            <Route path="design" element={<DesignSystem />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="seller/*" element={<RequireRole role="seller"><SellerApp /></RequireRole>} />
          <Route path="rider/*" element={<RequireRole role="rider"><RiderApp /></RequireRole>} />
        </Routes>
      </Suspense>
    </>
  );
}
