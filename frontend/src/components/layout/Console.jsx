import { NavLink, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import DemoBanner from './DemoBanner';
import Backdrop from '../ui/Backdrop';
import Toast from '../ui/Toast';
import { Logo, Icon, cx } from '../ui';
import { logoutUser } from '../../store/slices/auth';
import { resetSeller } from '../../store/slices/seller';
import { resetRider } from '../../store/slices/rider';

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
    <div className="min-h-dvh">
      <Backdrop />
      <DemoBanner />
      <header className="sticky top-0 z-40 px-3 pt-3">
        <div className="page glass glass-strong flex h-16 items-center gap-3">
          <Link to="/" aria-label="SnackHub home"><Logo compact /></Link>
          <div className="min-w-0">
            <p className="font-display text-xl font-extrabold leading-none">{title}</p>
            <p className="truncate text-xs text-grey-600">{user?.name}</p>
          </div>
          <nav className="ml-4 hidden gap-1 md:flex" aria-label={title}>
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition', isActive ? 'chip-on' : 'text-grey-800 hover:bg-white/70')}>
                <Icon name={t.icon} className="h-4 w-4" /> {t.label}
              </NavLink>
            ))}
          </nav>
          <button onClick={signOut} aria-label="Sign out" className="ml-auto inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-bold text-grey-600 hover:bg-grey-800/5">
            <Icon name="logout" className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>
      <main id="main" className={cx('page py-6', mobileTabs && 'pb-28 md:pb-6')}>{children}</main>
      <nav className="glass glass-strong safe-bottom fixed inset-x-2 bottom-2 z-40 grid md:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }} aria-label={`${title} sections`}>
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[0.6875rem] font-bold', isActive ? 'text-orange-text' : 'text-grey-600')}>
            <Icon name={t.icon} className="h-6 w-6" /> {t.label}
          </NavLink>
        ))}
      </nav>
      <Toast bottomOffset={70} />
    </div>
  );
};

export default ConsoleLayout;
