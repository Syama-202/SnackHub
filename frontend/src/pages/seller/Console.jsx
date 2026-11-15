import { Navigate, Route, Routes } from 'react-router-dom';
import ConsoleLayout from '../../components/layout/Console';
import SellerApproved, { Standing } from './Approved';
import Notifications from '../common/Notifications';
import SellerOrders from './Orders';
import SellerProducts from './Products';
import SellerShop from './Shop';
import SellerPayouts from './Payouts';

const TABS = [
  { to: '/seller', label: 'Orders', icon: 'list', end: true },
  { to: '/seller/products', label: 'Products', icon: 'box' },
  { to: '/seller/payouts', label: 'Payouts', icon: 'wallet' },
  { to: '/seller/shop', label: 'Shop', icon: 'settings' },
];

/**
 * Seller console (doc 11.2): order board, products and stock, shop status. An account works
 * here once its shop is approved, and until then is sent to onboarding.
 */
const SellerConsole = () => {
  const screens = (
    <Routes>
      <Route index element={<><Standing compact /><SellerOrders /></>} />
      <Route path="products" element={<SellerProducts />} />
      <Route path="shop" element={<><Standing /><SellerShop /></>} />
      <Route path="payouts" element={<SellerPayouts />} />
      <Route path="notifications" element={<Notifications />} />
      {/* an unknown address inside the console goes back to its first screen */}
      <Route path="*" element={<Navigate to="/seller" replace />} />
    </Routes>
  );
  return (
    <ConsoleLayout title="Seller console" tabs={TABS} mobileTabs>
      <SellerApproved>{screens}</SellerApproved>
    </ConsoleLayout>
  );
};

export default SellerConsole;
