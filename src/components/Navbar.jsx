import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Logo, Icon, cx } from './ui';
import SnackArt from './SnackArt';
import { rupees } from '../domain/money';
import { logoutUser } from '../store/slices/authSlice';
import { openCart, setAddress } from '../store/slices/uiSlice';
import { searchProducts } from '../store/slices/productsSlice';
import { selectDeliveryPoint } from '../store/slices/profileSlice';
import { selectCartCount } from '../store/slices/cartSlice';
import { selectUnreadCount } from '../store/slices/notificationSlice';

const LINKS = [
  { to: '/shop?view=regions', label: 'Regional snacks' },
  { to: '/shop', label: 'Categories' },
  { to: '/shop?sort=bestsellers', label: 'Bestsellers' },
  { to: '/#offers', label: 'Offers' },
];

/** Close a popover when the pointer goes down outside it. */
function useOutside(ref, onOutside) {
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && onOutside();
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [ref, onOutside]);
}

const Navbar = () => {
  const [compact, setCompact] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const on = () => setCompact(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={cx('sticky top-0 z-50 transition-all duration-300', compact ? 'py-1.5' : 'py-3')}>
      <div className="mx-auto max-w-7xl px-3 sm:px-4">
        <div className={cx('glass glass-strong flex items-center gap-2 px-2.5 transition-all sm:gap-3 sm:px-4', compact ? 'h-14' : 'h-16')}>
          <Link to="/" className="shrink-0 rounded-xl" aria-label="SnackHub home">
            <span className="hidden sm:block"><Logo /></span>
            <span className="sm:hidden"><Logo compact /></span>
          </Link>
          <LocationSelector />
          <div className="hidden min-w-0 flex-1 md:block">
            <SearchBox />
          </div>
          <nav className="hidden items-center gap-1 xl:flex" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink key={l.label} to={l.to} className="rounded-full px-3 py-2 text-sm font-bold text-grey-800 transition hover:bg-grey-800/5">
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1 md:ml-0">
            <Bell />
            <CartButton />
            <AccountMenu />
            <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-grey-800/5 xl:hidden" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Icon name="menu" />
            </button>
          </div>
        </div>
        <div className="mt-2 md:hidden">
          <SearchBox />
        </div>
        {menu && (
          <nav className="glass glass-strong mt-2 grid gap-1 p-2 xl:hidden" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link key={l.label} to={l.to} onClick={() => setMenu(false)} className="rounded-xl px-3 py-3 font-bold hover:bg-grey-800/5">{l.label}</Link>
            ))}
            <Link to="/seller" onClick={() => setMenu(false)} className="rounded-xl px-3 py-3 font-semibold text-grey-600 hover:bg-grey-800/5">Seller console</Link>
            <Link to="/rider" onClick={() => setMenu(false)} className="rounded-xl px-3 py-3 font-semibold text-grey-600 hover:bg-grey-800/5">Rider app</Link>
          </nav>
        )}
      </div>
    </header>
  );
};

function LocationSelector() {
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const point = useSelector(selectDeliveryPoint);
  const addresses = useSelector((state) => state.profile.addresses);
  const isCustomer = useSelector((state) => state.auth.user?.role === 'customer');
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div className="relative min-w-0 flex-1 md:flex-none" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox" className="flex h-11 min-w-0 items-center gap-1.5 rounded-xl px-2 text-left transition hover:bg-grey-800/5">
        <Icon name="pin" className="h-5 w-5 shrink-0 text-orange-deep" />
        <span className="min-w-0">
          <span className="block text-[11px] font-extrabold uppercase leading-none tracking-wide text-orange-deep">Deliver to</span>
          <span className="block max-w-[110px] truncate text-sm font-bold leading-tight sm:max-w-[170px]">{point.label}</span>
        </span>
        <Icon name="chevronDown" className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-grey-800/10 bg-white p-2 shadow-2xl" role="listbox" aria-label="Delivery address">
          {isCustomer && addresses.length ? (
            addresses.map((a) => (
              <button
                key={a.id}
                role="option"
                aria-selected={a.id === point.id}
                onClick={() => {
                  dispatch(setAddress(a.id));
                  setOpen(false);
                }}
                className={cx('flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-grey-50', a.id === point.id && 'bg-sun/15')}
              >
                <Icon name="pin" className="mt-0.5 h-4 w-4 text-orange-deep" />
                <span>
                  <span className="block text-sm font-bold">{a.label}</span>
                  <span className="block text-xs text-grey-600">{a.line}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="p-3 text-sm text-grey-600">
              Browsing from <b className="text-grey-800">Brodipet, Guntur</b> (demo). <Link to="/signin" className="font-bold text-orange-deep underline">Sign in</Link> to pick a saved address.
            </div>
          )}
          {isCustomer && <Link to="/account" onClick={() => setOpen(false)} className="mt-1 block rounded-xl px-3 py-2 text-sm font-bold text-orange-deep hover:bg-grey-50">Manage addresses</Link>}
        </div>
      )}
    </div>
  );
}

function SearchBox() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const point = useSelector(selectDeliveryPoint);
  const search = useSelector((state) => state.products.search);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = q.trim();
  const results = search.q === term ? search.results : [];

  // Debounced autocomplete
  useEffect(() => {
    if (term.length < 2) return;
    const t = setTimeout(() => dispatch(searchProducts({ q: term, point })), 180);
    return () => clearTimeout(t);
  }, [term, point, dispatch]);

  const go = (r) => {
    setOpen(false);
    setQ('');
    navigate(`/shop/${r.sellerId}?highlight=${r.id}`);
  };
  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && results[active]) go(results[active]);
        else if (term) {
          setOpen(false);
          navigate(`/shop?q=${encodeURIComponent(term)}`);
        }
      }}
    >
      <label htmlFor="site-search" className="sr-only">Search snacks</label>
      <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-grey-600" />
      <input
        id="site-search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(-1, a - 1));
        }}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
        aria-autocomplete="list"
        placeholder="Search murukku, sweets, chips, mixtures..."
        className="h-11 w-full rounded-full border border-grey-800/10 bg-white/90 pl-11 pr-4 text-[15px] placeholder:text-grey-600 focus:border-orange focus:outline-none focus:ring-4 focus:ring-orange/15"
      />
      {open && term.length >= 2 && search.q === term && (
        <ul id="search-results" role="listbox" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-grey-800/10 bg-white shadow-2xl">
          {results.length === 0 && <li className="px-4 py-3 text-sm text-grey-600">No snacks near you match “{term}”. Try “murukku” or “laddu”.</li>}
          {results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)} className={cx('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-grey-50', i === active && 'bg-sun/15')}>
                <SnackArt shape={r.art.shape} colors={r.art.colors} plate={false} className="h-10 w-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{r.title}</span>
                  <span className="block truncate text-xs text-grey-600">{r.shopName}</span>
                </span>
                <span className="text-sm font-bold">{rupees(r.pricePaise)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function CartButton() {
  const dispatch = useDispatch();
  const count = useSelector(selectCartCount);
  const bump = useSelector((state) => state.ui.cartBump);
  return (
    <button onClick={() => dispatch(openCart())} className="relative grid h-11 w-11 place-items-center rounded-full bg-primary text-grey-800 shadow-md transition hover:scale-105" aria-label={`Cart, ${count} items`}>
      <Icon name="cart" />
      {count > 0 && (
        <span key={bump} className="absolute -right-1 -top-1 grid h-5 min-w-5 animate-bump place-items-center rounded-full bg-red-strong px-1 text-[11px] font-extrabold text-white ring-2 ring-white">
          {count}
        </span>
      )}
    </button>
  );
}

function Bell() {
  const isCustomer = useSelector((state) => state.auth.user?.role === 'customer');
  const unread = useSelector(selectUnreadCount);
  if (!isCustomer) return null;
  return (
    <Link to="/notifications" className="relative hidden h-11 w-11 place-items-center rounded-full hover:bg-grey-800/5 sm:grid" aria-label={`Notifications, ${unread} unread`}>
      <Icon name="bell" />
      {unread > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-strong ring-2 ring-white" />}
    </Link>
  );
}

function AccountMenu() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false));
  if (!user)
    return (
      <Link to="/signin" className="hidden h-11 items-center rounded-full px-4 text-sm font-bold hover:bg-grey-800/5 sm:inline-flex">
        Sign in
      </Link>
    );
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="grid h-11 w-11 place-items-center rounded-full hover:bg-grey-800/5" aria-label="Account menu">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-grey-800 text-sm font-extrabold text-white">{user.name[0]}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-grey-800/10 bg-white p-2 shadow-2xl">
          <p className="px-3 pb-2 pt-1 text-sm"><b>{user.name}</b><br /><span className="text-grey-600">{user.email}</span></p>
          {user.role === 'customer' && (
            <>
              <MenuLink to="/orders" icon="list" onClick={() => setOpen(false)}>Your orders</MenuLink>
              <MenuLink to="/account" icon="user" onClick={() => setOpen(false)}>Profile and addresses</MenuLink>
              <MenuLink to="/notifications" icon="bell" onClick={() => setOpen(false)}>Notifications</MenuLink>
            </>
          )}
          {user.role === 'seller' && <MenuLink to="/seller" icon="box" onClick={() => setOpen(false)}>Seller console</MenuLink>}
          {user.role === 'rider' && <MenuLink to="/rider" icon="scooter" onClick={() => setOpen(false)}>Rider app</MenuLink>}
          <button
            role="menuitem"
            onClick={() => {
              dispatch(logoutUser());
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-text hover:bg-grey-50"
          >
            <Icon name="logout" className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, icon, children, onClick }) {
  return (
    <Link role="menuitem" to={to} onClick={onClick} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-grey-50">
      <Icon name={icon} className="h-4 w-4 text-grey-600" /> {children}
    </Link>
  );
}

export default Navbar;
