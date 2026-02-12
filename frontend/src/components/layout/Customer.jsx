import { Suspense, useEffect } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'motion/react';
import DemoBanner from './DemoBanner';
import Toast from '../ui/Toast';
import Navbar from './Navbar';
import Footer from './Footer';
import CartDrawer from '../cart/Drawer';
import CartPrompts from '../cart/Prompts';
import ProductModal from '../product/Modal';
import RiderLane from '../tracking/RiderLane';
import { PageFallback } from '../../routes/Guards';
import { fetchCart, resetCart } from '../../store/slices/cart';
import { fetchAddresses, resetProfile } from '../../store/slices/profile';
import { fetchOrders, resetOrders } from '../../store/slices/order';
import { fetchNotifications, resetNotifications } from '../../store/slices/notification';
import { usePolling, useReducedMotion } from '../../hooks';

/**
 * Customer shell. Loads the signed-in customer's cart, addresses, orders and
 * notifications into Redux, keeps them fresh, and clears them on sign-out.
 */
export default function CustomerLayout() {
  const dispatch = useDispatch();
  const location = useLocation();
  const outlet = useOutlet();
  const reduced = useReducedMotion();
  const isCustomer = useSelector((state) => state.auth.user?.role === 'customer');

  useEffect(() => {
    if (isCustomer) {
      dispatch(fetchCart());
      dispatch(fetchAddresses());
    } else {
      dispatch(resetCart());
      dispatch(resetProfile());
      dispatch(resetOrders());
      dispatch(resetNotifications());
    }
  }, [isCustomer, dispatch]);

  // Order list drives the always-visible rider lane; notifications drive the bell
  usePolling(() => dispatch(fetchOrders()), 5000, isCustomer);
  usePolling(() => dispatch(fetchNotifications()), 4000, isCustomer);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:font-bold">Skip to content</a>
      <DemoBanner />
      <Navbar />
      <main id="main" className="min-h-[60vh]">
        <Suspense fallback={<PageFallback />}>
          {reduced ? (
            outlet
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={location.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.22, ease: 'easeInOut' }}>
                {outlet}
              </motion.div>
            </AnimatePresence>
          )}
        </Suspense>
      </main>
      <Footer />
      <CartDrawer />
      <ProductModal />
      <CartPrompts />
      {/* The rider lane lives in the layout so it survives page changes (doc 22.5) */}
      <RiderLane />
      <Toast bottomOffset={88} />
    </>
  );
}
