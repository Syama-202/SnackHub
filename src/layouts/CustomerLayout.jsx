import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import DemoBanner from '../components/DemoBanner';
import Toaster from '../components/Toaster';
import Navbar from './Navbar';
import Footer from './Footer';
import CartDrawer from '../features/cart/CartDrawer';
import { ShopProvider } from '../features/cart/ShopContext';
import RiderLane from '../features/tracking/RiderLane';
import { actions } from '../store/webStore';
import { PageFallback } from '../components/RouteGuards';

export default function CustomerLayout() {
  const dispatch = useDispatch();
  const toasts = useSelector((s) => s.ui.toasts);
  return (
    <ShopProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:font-bold">Skip to content</a>
      <DemoBanner />
      <Navbar />
      <main id="main" className="min-h-[60vh]">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <CartDrawer />
      {/* The rider lane lives in the layout so it survives page changes (doc 22.5) */}
      <RiderLane />
      <Toaster toasts={toasts} onDismiss={(id) => dispatch(actions.dismissToast(id))} bottomOffset={88} />
    </ShopProvider>
  );
}
