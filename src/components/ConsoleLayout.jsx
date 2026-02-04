import { NavLink, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import DemoBanner from './DemoBanner';
import Toast from './Toast';
import { Logo, Icon, cx } from './ui';
import { logoutUser } from '../store/slices/authSlice';
import { resetSeller } from '../store/slices/sellerSlice';
import { resetRider } from '../store/slices/riderSlice';

/** Shared shell for the seller console and the rider app. */
const ConsoleLayout = ({ title, tabs, children, mobileTabs = false }) => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const signOut = () => {
    dispatch(logoutUser());
    dispatch(resetSeller());
    dispatch(resetRider());
  };
  return (
    <div className="min-h-dvh bg-console">
      <DemoBanner />
      <header className="sticky top-0 z-40 border-b border-grey-800/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Link to="/" aria-label="SnackHub home"><Logo compact /></Link>
          <div className="min-w-0">
            <p className="font-display text-lg font-extrabold leading-none">{title}</p>
            <p className="truncate text-xs text-grey-600">{user?.name}</p>
          </div>
          <nav className="ml-4 hidden gap-1 md:flex" aria-label={title}>
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition', isActive ? 'bg-grey-800 text-white' : 'text-grey-800 hover:bg-grey-800/5')}>
                <Icon name={t.icon} className="h-4 w-4" /> {t.label}
              </NavLink>
            ))}
          </nav>
          <button onClick={signOut} className="ml-auto inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-bold text-grey-600 hover:bg-grey-800/5">
            <Icon name="logout" className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>
      <main id="main" className={cx('mx-auto max-w-7xl px-4 py-6', mobileTabs && 'pb-28 md:pb-6')}>{children}</main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid border-t border-grey-800/10 bg-white md:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }} aria-label={`${title} sections`}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold', isActive ? 'text-orange-deep' : 'text-grey-600')}>
            <Icon name={t.icon} className="h-6 w-6" /> {t.label}
          </NavLink>
        ))}
      </nav>
      <Toast bottomOffset={70} />
    </div>
  );
};

export default ConsoleLayout;
