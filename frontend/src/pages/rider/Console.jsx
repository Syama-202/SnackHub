import { Navigate, Route, Routes } from 'react-router-dom';
import ConsoleLayout from '../../components/layout/Console';
import RiderApproved from './Approved';
import { isDemoSession } from '../../store/slices/auth';
import Notifications from '../common/Notifications';
import RiderToday from './Today';
import RiderEarnings from './Earnings';

const TABS = [
  { to: '/rider', label: 'Today', icon: 'scooter', end: true },
  { to: '/rider/earnings', label: 'Earnings', icon: 'wallet' },
];

/**
 * Rider PWA (doc 11.3): offers, delivery steps, earnings. The demo rider runs on the
 * in-browser mock; a real account works on the API once approved, and until then is sent to
 * onboarding.
 */
const RiderConsole = () => {
  const screens = (
    <Routes>
      <Route index element={<RiderToday />} />
      <Route path="earnings" element={<RiderEarnings />} />
      <Route path="notifications" element={<Notifications />} />
      {/* an unknown address inside the console goes back to its first screen */}
      <Route path="*" element={<Navigate to="/rider" replace />} />
    </Routes>
  );
  return (
    <ConsoleLayout title="Rider app" tabs={TABS} mobileTabs>
      {isDemoSession() ? screens : <RiderApproved>{screens}</RiderApproved>}
    </ConsoleLayout>
  );
};

export default RiderConsole;
