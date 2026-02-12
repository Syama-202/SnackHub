import { Route, Routes } from 'react-router-dom';
import ConsoleLayout from '../../components/layout/Console';
import RiderToday from './Today';
import RiderEarnings from './Earnings';

const TABS = [
  { to: '/rider', label: 'Today', icon: 'scooter', end: true },
  { to: '/rider/earnings', label: 'Earnings', icon: 'wallet' },
];

/** Rider PWA (doc 11.3): offers, delivery steps, earnings. */
const RiderConsole = () => (
  <ConsoleLayout title="Rider app" tabs={TABS} mobileTabs>
    <Routes>
      <Route index element={<RiderToday />} />
      <Route path="earnings" element={<RiderEarnings />} />
    </Routes>
  </ConsoleLayout>
);

export default RiderConsole;
