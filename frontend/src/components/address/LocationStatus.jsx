import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { checkLocation, detectDismissed, detectLocation, fetchCities, signInHandled } from '../../store/slices/location';
import { cityPoint, selectDeliveryPoint } from '../../store/slices/profile';
import { pickCurrentPoint } from '../../store/slices/ui';
import { addToast } from '../../store/slices/toast';
import { Icon, cx } from '../ui';

// A few ways to say each thing, so the same words do not greet the customer every visit
// (one per day). {city}, {place} and {n} are filled in.
const SAY = {
  missing: ['Where should we bring your snacks?', 'Tell us where you are, and we will find the snacks that can reach you.'],
  denied: ['Location is off for SnackHub. Pick your city or one of your addresses, and we will show the shops that deliver there.'],
  undetected: ["We couldn't detect your location. Select your delivery address to discover snacks near you."],
  unsupported: [
    "Looks like we're not available in {city} yet. Stay tuned: SnackHub is coming your way!",
    "We're not serving {city} yet, but we're cooking up something exciting!",
  ],
  outOfZone: [
    "We're close, but not quite in your delivery zone yet!",
    "Hey! We're not serving {place} just yet. We're working on bringing your favourite snacks closer to you.",
    "Oops! Our snack partners haven't reached {place} yet.",
  ],
  allClosed: ['Our snack partners near you are taking a little break. {n} shops deliver here; come back when they open.'],
  found: ['Your favourite snacks are just around the corner!', 'Found you! The snacks below can all reach you.'],
};
const today = Math.floor(Date.now() / 86_400_000);
const say = (key, vars = {}) => {
  const list = SAY[key];
  return list[today % list.length].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
};

/**
 * Says where SnackHub can deliver, under the navbar, only when there is something to say:
 * no location yet, location blocked or not found, a city not served yet, or a spot no shop
 * reaches. Asks for the position right after a customer signs in, and checks every delivery
 * point the customer picks (/locate), so a change of address is judged at once.
 */
export default function LocationStatus() {
  const dispatch = useDispatch();
  const point = useSelector(selectDeliveryPoint);
  const user = useSelector((state) => state.auth.user);
  const guestPoint = useSelector((state) => state.ui.guestPoint);
  const { cities, detect, detectReason, askAfterSignIn, info } = useSelector((state) => state.location);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem('snackhub.locationNote') === 'hidden');
  const told = useRef(null);

  useEffect(() => {
    dispatch(fetchCities());
  }, [dispatch]);

  // right after a customer signs in: the browser asks for permission, once
  useEffect(() => {
    if (!askAfterSignIn) return;
    dispatch(signInHandled());
    if (user?.role === 'customer') dispatch(detectLocation({ reason: 'login' }));
  }, [askAfterSignIn, user?.role, dispatch]);

  // every delivery point is checked: served, out of the zone, or a city not served yet
  const key = `${point.lat},${point.lng},${point.pincode ?? ''}`;
  useEffect(() => {
    dispatch(checkLocation({ lat: point.lat, lng: point.lng, pincode: point.pincode }));
  }, [key, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // a fresh detection that found shops: one cheerful line, not a banner
  useEffect(() => {
    if (detect !== 'found' || !info || told.current === key) return;
    told.current = key;
    if (info.status === 'SERVED') dispatch(addToast({ type: 'success', title: say('found'), message: `Delivering to ${point.label}.` }));
  }, [detect, info, key, point.label, dispatch]);

  const here = info && Math.abs(info.at.lat - point.lat) < 1e-5 && Math.abs(info.at.lng - point.lng) < 1e-5 ? info : null;
  const note = useMemo(() => {
    if (detect === 'DENIED') return { tone: 'ask', title: say('missing'), body: say('denied') };
    if (detect === 'UNAVAILABLE' || detect === 'UNSUPPORTED') return { tone: 'ask', title: say('missing'), body: say('undetected') };
    if (here?.status === 'UNSUPPORTED_CITY') {
      const city = here.address?.city || 'your city';
      return { tone: 'soon', title: say('unsupported', { city }), body: here.nearestCity ? `The nearest city we serve is ${here.nearestCity.name}, ${here.nearestCity.distanceKm} km away.` : null, nearest: here.nearestCity };
    }
    if (here?.status === 'OUT_OF_ZONE') {
      const place = here.address?.locality || 'your area';
      return { tone: 'soon', title: say('outOfZone', { place }), body: `No shop delivers to ${place} in ${here.city?.name ?? 'this city'} yet. Try an address nearer the centre, or another saved address.` };
    }
    if (here?.status === 'SERVED' && here.openShops === 0) return { tone: 'info', title: say('allClosed', { n: here.shops }), body: null };
    // a guest who has not told us anything yet
    if (!user && !guestPoint && detect === 'idle') return { tone: 'ask', title: say('missing'), body: 'Share your location or pick a city to see the snacks that can reach you.' };
    return null;
  }, [detect, here, user, guestPoint]);

  if (detect === 'asking') {
    return (
      <p className="page mt-2 flex items-center gap-2 text-sm font-semibold text-grey-600" role="status">
        <Icon name="pin" className="h-4 w-4 animate-pulse text-orange-text" /> {detectReason === 'login' ? 'Finding the snacks near you…' : 'Finding you…'}
      </p>
    );
  }
  if (!note || (hidden && note.tone !== 'soon')) return null;

  const pickCity = (id) => {
    const c = cities.find((x) => x.id === id);
    if (c) {
      dispatch(pickCurrentPoint(cityPoint(c)));
      dispatch(detectDismissed());
    }
  };
  const close = () => {
    setHidden(true);
    sessionStorage.setItem('snackhub.locationNote', 'hidden');
    dispatch(detectDismissed());
  };

  return (
    <div className="page mt-3">
      <div role="status" className={cx('relative flex flex-wrap items-start gap-3 rounded-card border p-4 pr-10 shadow-card', note.tone === 'soon' ? 'border-orange/30 bg-sun-soft/80' : 'border-grey-800/10 bg-white/85')}>
        <Icon name="pin" className="mt-0.5 h-5 w-5 shrink-0 text-orange-text" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-grey-900">{note.title}</p>
          {note.body && <p className="mt-0.5 text-sm text-grey-600">{note.body}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {detect !== 'DENIED' && (
              <button type="button" onClick={() => dispatch(detectLocation({ reason: 'tap' }))} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-grey-900 px-3.5 text-sm font-semibold text-white">
                <Icon name="pin" className="h-4 w-4" /> Use my current location
              </button>
            )}
            {note.nearest && (
              <button type="button" onClick={() => pickCity(note.nearest.id)} className="inline-flex h-9 items-center rounded-full border border-grey-800/15 bg-white px-3.5 text-sm font-semibold">
                Browse {note.nearest.name}
              </button>
            )}
            <label className="sr-only" htmlFor="location-city">Pick a city</label>
            <select id="location-city" value="" onChange={(e) => pickCity(e.target.value)} className="field h-9 w-auto min-h-0 rounded-full py-0 text-sm">
              <option value="" disabled>Pick a city</option>
              {[...cities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {user?.role === 'customer' && <Link to="/account" className="text-sm font-semibold text-orange-text hover:underline">Add an address</Link>}
          </div>
        </div>
        <button type="button" onClick={close} aria-label="Close" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-grey-600 hover:bg-grey-800/5">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
