import { Route, Routes } from 'react-router-dom';
import ConsoleLayout from '../../components/layout/Console';
import SellerOrders from './Orders';
import SellerProducts from './Products';
import SellerShop from './Shop';

const TABS = [
  { to: '/seller', label: 'Orders', icon: 'list', end: true },
  { to: '/seller/products', label: 'Products', icon: 'box' },
  { to: '/seller/shop', label: 'Shop', icon: 'settings' },
];

/** Seller console (doc 11.2): order board, products and stock, shop status. */
const SellerConsole = () => (
  <ConsoleLayout title="Seller console" tabs={TABS} mobileTabs>
    <Routes>
      <Route index element={<SellerOrders />} />
      <Route path="products" element={<SellerProducts />} />
      <Route path="shop" element={<SellerShop />} />
    </Routes>
  </ConsoleLayout>
);

export default SellerConsole;
