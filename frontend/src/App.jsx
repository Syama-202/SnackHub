import { useRouteTitle } from './hooks';
import { WEB_TITLES } from './constants/titles';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Provider, useDispatch } from 'react-redux';
import store from './store';
import { restoreSession } from './store/slices/auth';
import { useRealtime } from './hooks';
import CustomerLayout from './components/layout/Customer';
import { PageFallback, RequireRole } from './routes/Guards';
import ErrorBoundary from './components/ui/ErrorBoundary';
import WakingNotice from './components/layout/WakingNotice';
// The landing page is the first screen most visitors see, so it ships in the entry bundle
import Home from './pages/customer/Home';

// Route-level code splitting (doc 5.1): 3D and GSAP load only where used
const ProductList = lazy(() => import('./pages/customer/ProductList'));
const Search = lazy(() => import('./pages/customer/Search'));
const ShopDetail = lazy(() => import('./pages/customer/ShopDetail'));
const Checkout = lazy(() => import('./pages/customer/Checkout'));
const OrderHistory = lazy(() => import('./pages/customer/OrderHistory'));
const Favourites = lazy(() => import('./pages/customer/Favourites'));
const OrderTracking = lazy(() => import('./pages/customer/OrderTracking'));
const ReportProblem = lazy(() => import('./pages/customer/ReportProblem'));
const Profile = lazy(() => import('./pages/customer/Profile'));
const Notifications = lazy(() => import('./pages/common/Notifications'));
const Join = lazy(() => import('./pages/auth/Join'));
const SignIn = lazy(() => import('./pages/auth/SignIn'));
const SignUp = lazy(() => import('./pages/auth/SignUp'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Security = lazy(() => import('./pages/common/Security'));
const SellerOnboarding = lazy(() => import('./pages/seller/Onboarding'));
const RiderOnboarding = lazy(() => import('./pages/rider/Onboarding'));
const DesignSystem = lazy(() => import('./pages/common/DesignSystem'));
const Terms = lazy(() => import('./pages/common/Terms'));
const Privacy = lazy(() => import('./pages/common/Privacy'));
const Refunds = lazy(() => import('./pages/common/Refunds'));
const Contact = lazy(() => import('./pages/common/Contact'));
const NotFound = lazy(() => import('./pages/common/NotFound'));
const SellerConsole = lazy(() => import('./pages/seller/Console'));
const RiderConsole = lazy(() => import('./pages/rider/Console'));

// Turns the httpOnly refresh cookie (if any) back into an access token on first
// load, so a page refresh keeps the user signed in.
function SessionBootstrap() {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);
  // live updates for whichever portal is signed in (customer, seller or rider)
  useRealtime();
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
  // a crash shows a way back instead of a blank screen; another page starts fresh
  const { pathname } = useLocation();
  useRouteTitle(WEB_TITLES);
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* The layout stays mounted; only the page area transitions */}
          <Route element={<CustomerLayout />}>
            <Route index element={<Home />} />
            <Route path="shop" element={<ProductList />} />
            <Route path="search" element={<Search />} />
            <Route path="shop/:sellerId" element={<ShopDetail />} />
            <Route path="checkout" element={<RequireRole role="customer"><Checkout /></RequireRole>} />
            <Route path="orders" element={<RequireRole role="customer"><OrderHistory /></RequireRole>} />
            <Route path="orders/:id" element={<RequireRole role="customer"><OrderTracking /></RequireRole>} />
            <Route path="orders/:id/report" element={<RequireRole role="customer"><ReportProblem /></RequireRole>} />
            <Route path="account" element={<RequireRole role="customer"><Profile /></RequireRole>} />
            <Route path="notifications" element={<RequireRole role="customer"><Notifications /></RequireRole>} />
            <Route path="favourites" element={<RequireRole role="customer"><Favourites /></RequireRole>} />
            {/* one sign-up and one sign-in per portal; /signin?as=seller still lands on the right one */}
            <Route path="join" element={<Join />} />
            <Route path="signin" element={<Join />} />
            {['customer', 'seller', 'rider'].map((portal) => [
              <Route key={`${portal}-in`} path={`${portal}/signin`} element={<SignIn portal={portal} />} />,
              <Route key={`${portal}-up`} path={`${portal}/signup`} element={<SignUp portal={portal} />} />,
            ])}
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="account/security" element={<RequireRole role={['customer', 'seller', 'rider']}><Security /></RequireRole>} />
            <Route path="seller/onboarding" element={<RequireRole role="seller"><SellerOnboarding /></RequireRole>} />
            <Route path="rider/onboarding" element={<RequireRole role="rider"><RiderOnboarding /></RequireRole>} />
            {/* the design system page is for building the app, not for visitors */}
            {import.meta.env.DEV && <Route path="design" element={<DesignSystem />} />}
            <Route path="terms" element={<Terms />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="refunds" element={<Refunds />} />
            <Route path="contact" element={<Contact />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="seller/*" element={<RequireRole role="seller"><SellerConsole /></RequireRole>} />
          <Route path="rider/*" element={<RequireRole role="rider"><RiderConsole /></RequireRole>} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <Provider store={store}>
      <Router>
        <ScrollToTop />
        <SessionBootstrap />
        <WakingNotice />
        <AppRoutes />
      </Router>
    </Provider>
  );
}

export default App;
