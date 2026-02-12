import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Provider, useDispatch } from 'react-redux';
import store from './store/store';
import { restoreSession } from './store/slices/authSlice';
import CustomerLayout from './components/layout/CustomerLayout';
import { PageFallback, RequireRole } from './components/layout/RouteGuards';
// The landing page is the first screen most visitors see, so it ships in the entry bundle
import Home from './pages/customer/Home';

// Route-level code splitting (doc 5.1): 3D and GSAP load only where used
const ProductList = lazy(() => import('./pages/customer/ProductList'));
const ShopDetail = lazy(() => import('./pages/customer/ShopDetail'));
const Checkout = lazy(() => import('./pages/customer/Checkout'));
const OrderHistory = lazy(() => import('./pages/customer/OrderHistory'));
const OrderTracking = lazy(() => import('./pages/customer/OrderTracking'));
const ReportProblem = lazy(() => import('./pages/customer/ReportProblem'));
const Profile = lazy(() => import('./pages/customer/Profile'));
const Notifications = lazy(() => import('./pages/customer/Notifications'));
const Login = lazy(() => import('./pages/auth/Login'));
const DesignSystem = lazy(() => import('./pages/common/DesignSystem'));
const NotFound = lazy(() => import('./pages/common/NotFound'));
const SellerConsole = lazy(() => import('./pages/seller/SellerConsole'));
const RiderConsole = lazy(() => import('./pages/rider/RiderConsole'));

// Turns the httpOnly refresh cookie (if any) back into an access token on first
// load, so a page refresh keeps the user signed in.
function SessionBootstrap() {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* The layout stays mounted; only the page area transitions */}
        <Route element={<CustomerLayout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<ProductList />} />
          <Route path="shop/:sellerId" element={<ShopDetail />} />
          <Route path="checkout" element={<RequireRole role="customer"><Checkout /></RequireRole>} />
          <Route path="orders" element={<RequireRole role="customer"><OrderHistory /></RequireRole>} />
          <Route path="orders/:id" element={<RequireRole role="customer"><OrderTracking /></RequireRole>} />
          <Route path="orders/:id/report" element={<RequireRole role="customer"><ReportProblem /></RequireRole>} />
          <Route path="account" element={<RequireRole role="customer"><Profile /></RequireRole>} />
          <Route path="notifications" element={<RequireRole role="customer"><Notifications /></RequireRole>} />
          <Route path="signin" element={<Login />} />
          <Route path="design" element={<DesignSystem />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="seller/*" element={<RequireRole role="seller"><SellerConsole /></RequireRole>} />
        <Route path="rider/*" element={<RequireRole role="rider"><RiderConsole /></RequireRole>} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <Provider store={store}>
      <Router>
        <ScrollToTop />
        <SessionBootstrap />
        <AppRoutes />
      </Router>
    </Provider>
  );
}

export default App;
