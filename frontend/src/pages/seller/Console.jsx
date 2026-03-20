import { Navigate, Route, Routes } from 'react-router-dom';
import ConsoleLayout from '../../components/layout/Console';
import SellerApproved from './Approved';
import { isDemoSession } from '../../store/slices/auth';
import SellerOrders from './Orders';
import SellerProducts from './Products';
import SellerShop from './Shop';

const TABS = [
  { to: '/seller', label: 'Orders', icon: 'list', end: true },
  { to: '/seller/products', label: 'Products', icon: 'box' },
  { to: '/seller/shop', label: 'Shop', icon: 'settings' },
];

/**
 * Seller console (doc 11.2): order board, products and stock, shop status. The demo seller's
 * console runs on the in-browser mock; a real account sees onboarding until it is approved.
 */
const SellerConsole = () => (!isDemoSession() ? <SellerApproved /> : (
  <ConsoleLayout title="Seller console" tabs={TABS} mobileTabs>
    <Routes>
      <Route index element={<SellerOrders />} />
      <Route path="products" element={<SellerProducts />} />
      <Route path="shop" element={<SellerShop />} />
      {/* an unknown address inside the console goes back to its first screen */}
      <Route path="*" element={<Navigate to="/seller" replace />} />
    </Routes>
  </ConsoleLayout>
));

export default SellerConsole;
