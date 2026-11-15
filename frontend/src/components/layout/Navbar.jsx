import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Logo, Icon, cx } from '../ui';
import { logoutUser } from '../../store/slices/auth';
import { openCart, setAddress, pickCurrentPoint } from '../../store/slices/ui';
import { addToast } from '../../store/slices/toast';
import { suggestSearch } from '../../store/slices/products';
import { selectDeliveryPoint, cityPoint } from '../../store/slices/profile';
import { detectLocation } from '../../store/slices/location';
import { selectCartCount } from '../../store/slices/cart';
import { selectUnreadCount } from '../../store/slices/notification';

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
  // Three of the links open the same page with a different view, so the current one is found
  // from the whole address; plain /shop is "Categories" unless another view is showing.
  const { pathname, search } = useLocation();
  const isHere = (to) => (to === '/shop' ? pathname === '/shop' && !/[?&](view=regions|sort=bestsellers)/.test(search) : pathname + search === to);
  useEffect(() => {
    const on = () => setCompact(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={cx('sticky top-0 z-50 transition-all duration-300', compact ? 'py-1.5' : 'py-3')}>
      <div className="page">
        <div className={cx('glass glass-strong flex items-center gap-2 px-2.5 transition-all sm:gap-3 sm:px-4', compact ? 'h-14' : 'h-16')}>
          <Link to="/" className="shrink-0 rounded-xl" aria-label="SnackHub home">
            <span className="hidden sm:block"><Logo /></span>
            <span className="sm:hidden"><Logo compact /></span>
          </Link>
          <LocationSelector />
          <div className="hidden min-w-0 flex-1 lg:block">
            <SearchBox />
          </div>
          <nav className="hidden items-center gap-1 xl:flex" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.label} to={l.to} aria-current={isHere(l.to) ? 'page' : undefined} className={cx('rounded-full px-3.5 py-2 text-[0.9375rem] font-semibold transition hover:bg-white hover:shadow-sm', isHere(l.to) ? 'bg-white text-orange-text shadow-sm' : 'text-grey-800')}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1 lg:ml-0">
            <Bell />
            <CartButton />
            <AccountMenu />
            <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-grey-800/5 xl:hidden" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Icon name="menu" />
            </button>
          </div>
        </div>
        <div className="mt-2 lg:hidden">
          <SearchBox />
        </div>
        {menu && (
          <nav className="glass glass-strong mt-2 grid gap-1 p-2 xl:hidden" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link key={l.label} to={l.to} onClick={() => setMenu(false)} className="rounded-xl px-3 py-3 font-semibold hover:bg-grey-800/5">{l.label}</Link>
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
  const cities = useSelector((state) => state.location.cities);
  const addressId = useSelector((state) => state.ui.addressId);
  const locating = useSelector((state) => state.location.detect === 'asking');
  const ref = useRef(null);
  useOutside(ref, () => setOpen(false));
  const pickList = isCustomer && addresses.length > 0;
  // a city or the current location: browsing from there, also with saved addresses
  const choose = (pt) => {
    dispatch(pickCurrentPoint(pt));
    setOpen(false);
  };
  const locate = async () => {
    const res = await dispatch(detectLocation({ reason: 'tap' }));
    if (detectLocation.fulfilled.match(res)) setOpen(false);
    else if (res.payload?.code === 'DENIED') dispatch(addToast({ type: 'error', title: 'Location is blocked', message: 'Allow location for SnackHub in the browser, or pick your city.' }));
    else dispatch(addToast({ type: 'error', title: "We couldn't detect your location", message: 'Select your delivery address or a city to discover snacks near you.' }));
  };
  const cityPicker = (
    <label className="block">
      <span className="mb-1 block font-semibold">{pickList ? 'Or browse a city' : 'Or pick a city'}</span>
      <select
        value={!point.current && cities.some((c) => c.id === point.cityId && point.label === c.name) ? point.cityId : ''}
        onChange={(e) => choose(cityPoint(cities.find((c) => c.id === e.target.value)))}
        className="field h-11"
      >
        <option value="" disabled>Choose a city</option>
        {[...new Set(cities.map((c) => c.state))].sort().map((st) => (
          <optgroup key={st} label={st}>
            {cities.filter((c) => c.state === st).sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
  const hereButton = (
    <button type="button" onClick={locate} disabled={locating} className="flex h-11 w-full items-center gap-2 rounded-xl bg-grey-50 px-3 font-semibold hover:bg-sun/20 disabled:opacity-60">
      <Icon name="pin" className="h-4 w-4 text-orange-text" /> {locating ? 'Finding you…' : 'Use my current location'}
    </button>
  );
  return (
    <div className="relative min-w-0 flex-1 md:flex-none" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup={pickList ? 'listbox' : 'dialog'} className="flex h-11 min-w-0 items-center gap-1.5 rounded-xl px-2 text-left transition hover:bg-grey-800/5">
        <Icon name="pin" className="h-5 w-5 shrink-0 text-orange-text" />
        <span className="min-w-0">
          <span className="block text-[0.6875rem] font-bold uppercase leading-none tracking-wide text-orange-text">Deliver to</span>
          <span className="block max-w-[6.875rem] truncate text-sm font-semibold leading-tight sm:max-w-[10.625rem]">{point.label}</span>
        </span>
        <Icon name="chevronDown" className="h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-grey-800/10 bg-white p-2 shadow-2xl" role={pickList ? 'listbox' : 'dialog'} aria-label="Delivery address">
          {pickList ? (
            <>
            <div className="p-1 text-sm">{hereButton}</div>
            {addresses.map((a) => (
              <button
                key={a.id}
                role="option"
                aria-selected={a.id === addressId}
                onClick={() => {
                  dispatch(setAddress(a.id));
                  setOpen(false);
                }}
                className={cx('flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-grey-50', a.id === addressId && 'bg-sun/15')}
              >
                <Icon name="pin" className="mt-0.5 h-4 w-4 text-orange-text" />
                <span>
                  <span className="block text-sm font-semibold">{a.label}</span>
                  <span className="block text-xs text-grey-600">{a.line}</span>
                </span>
              </button>
            ))}
            <div className="p-2 text-sm">{cityPicker}</div>
            </>
          ) : (
            <div className="space-y-3 p-2 text-sm">
              {hereButton}
              {cityPicker}
              <p className="text-xs text-grey-600">
                You see shops that deliver to this point. {isCustomer ? <Link to="/account" onClick={() => setOpen(false)} className="font-semibold text-orange-text underline">Save an address</Link> : <Link to="/customer/signin" className="font-semibold text-orange-text underline">Sign in</Link>} to order to your door.
              </p>
            </div>
          )}
          {isCustomer && <Link to="/account" onClick={() => setOpen(false)} className="mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-orange-text hover:bg-grey-50">Manage addresses</Link>}
        </div>
      )}
    </div>
  );
}

function SearchBox() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const point = useSelector(selectDeliveryPoint);
  const suggest = useSelector((state) => state.products.suggest);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const term = q.trim();
  const results = suggest.q === term ? suggest.suggestions : [];

  // autocomplete after a short pause in typing, not on every key
  useEffect(() => {
    if (term.length < 2) return undefined;
    const t = setTimeout(() => dispatch(suggestSearch({ q: term, point: { lat: point.lat, lng: point.lng, pincode: point.pincode } })), 250);
    return () => clearTimeout(t);
  }, [term, point.lat, point.lng, point.pincode, dispatch]);

  const go = (text) => {
    setOpen(false);
    setQ('');
    navigate(`/search?q=${encodeURIComponent(text)}`);
  };
  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && results[active]) go(results[active].text);
        else if (term) go(term);
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
        className="h-11 w-full rounded-full border border-grey-800/10 bg-white/90 pl-11 pr-4 text-[0.9375rem] placeholder:text-grey-600 focus:border-orange focus:outline-none focus:ring-4 focus:ring-orange/15"
      />
      {open && term.length >= 2 && suggest.q === term && (
        <ul id="search-results" role="listbox" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-grey-800/10 bg-white py-1 shadow-2xl">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.text}`} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.text)} className={cx('flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-grey-50', i === active && 'bg-sun/15')}>
                <Icon name={r.kind === 'shop' ? 'store' : 'search'} className="h-4 w-4 shrink-0 text-grey-500" />
                <span className="min-w-0 flex-1 truncate font-medium">{r.text}</span>
                {r.kind === 'shop' && <span className="text-xs text-grey-500">Shop</span>}
              </button>
            </li>
          ))}
          <li role="option" aria-selected={active === results.length}>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(term)} className="flex w-full items-center gap-3 border-t border-grey-800/5 px-4 py-2.5 text-left text-sm text-grey-600 hover:bg-grey-50">
              <Icon name="arrowRight" className="h-4 w-4 shrink-0" /> {results.length ? 'See every result for' : 'Search for'} “{term}”
            </button>
          </li>
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
        <span key={bump} className="absolute -right-1 -top-1 grid h-5 min-w-5 animate-bump place-items-center rounded-full bg-red-strong px-1 text-[0.6875rem] font-bold text-white ring-2 ring-white">
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
      <Link to="/join" className="hidden h-11 items-center rounded-full px-4 text-sm font-semibold hover:bg-grey-800/5 sm:inline-flex">
        Sign in
      </Link>
    );
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="grid h-11 w-11 place-items-center rounded-full hover:bg-grey-800/5" aria-label="Account menu">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-grey-800 text-sm font-bold text-white">{user.name[0]}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-grey-800/10 bg-white p-2 shadow-2xl">
          <p className="px-3 pb-2 pt-1 text-sm"><b>{user.name}</b><br /><span className="text-grey-600">{user.email}</span></p>
          {user.role === 'customer' && (
            <>
              <MenuLink to="/orders" icon="list" onClick={() => setOpen(false)}>Your orders</MenuLink>
              <MenuLink to="/favourites" icon="heart" onClick={() => setOpen(false)}>Favourites</MenuLink>
              <MenuLink to="/account" icon="user" onClick={() => setOpen(false)}>Profile and addresses</MenuLink>
              <MenuLink to="/notifications" icon="bell" onClick={() => setOpen(false)}>Notifications</MenuLink>
            </>
          )}
          {user.role === 'seller' && <MenuLink to="/seller" icon="box" onClick={() => setOpen(false)}>Seller console</MenuLink>}
          {user.role === 'rider' && <MenuLink to="/rider" icon="scooter" onClick={() => setOpen(false)}>Rider app</MenuLink>}
          <MenuLink to="/account/security" icon="lock" onClick={() => setOpen(false)}>Security and sign-in</MenuLink>
          <button
            role="menuitem"
            onClick={() => {
              dispatch(logoutUser());
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-text hover:bg-grey-50"
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
    <Link role="menuitem" to={to} onClick={onClick} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-grey-50">
      <Icon name={icon} className="h-4 w-4 text-grey-600" /> {children}
    </Link>
  );
}

export default Navbar;
