import { Navigate, Route, Routes } from 'react-router-dom';
import ConsoleLayout from '../../components/layout/Console';
import SellerApproved, { Standing } from './Approved';
import { isDemoSession } from '../../store/slices/auth';
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
 * Seller console (doc 11.2): order board, products and stock, shop status. The demo seller's
 * console runs on the in-browser mock; a real account works on the API once approved, and
 * until then is sent to onboarding.
 */
const SellerConsole = () => {
  const demo = isDemoSession();
  const screens = (
    <Routes>
      <Route index element={<>{!demo && <Standing compact />}<SellerOrders /></>} />
      <Route path="products" element={<SellerProducts />} />
      <Route path="shop" element={<>{!demo && <Standing />}<SellerShop /></>} />
      <Route path="payouts" element={<SellerPayouts />} />
      <Route path="notifications" element={<Notifications />} />
      {/* an unknown address inside the console goes back to its first screen */}
      <Route path="*" element={<Navigate to="/seller" replace />} />
    </Routes>
  );
  return (
    <ConsoleLayout title="Seller console" tabs={TABS} mobileTabs>
      {demo ? screens : <SellerApproved>{screens}</SellerApproved>}
    </ConsoleLayout>
  );
};

export default SellerConsole;
