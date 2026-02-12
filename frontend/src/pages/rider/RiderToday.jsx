import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { deliveryStep, fetchActiveDelivery, fetchOffers, fetchRiderProfile, respondToOffer, sendLocation, setRiderStatus } from '../../store/slices/riderSlice';
import { addToast } from '../../store/slices/toastSlice';
import { rupees, rupeesExact } from '@shared/domain/money';
import { distanceM } from '@shared/domain/geo';
import { useNow, usePolling } from '../../hooks/uiHooks';
import { Button, Card, Pill, Icon, TempBadge, Modal, CloseButton, cx } from '../../components/ui';
import LaneSvg from '../../components/tracking/LaneSvg';

const RiderToday = () => {
  const dispatch = useDispatch();
  const { me, offers, active } = useSelector((state) => state.rider);
  const online = me && me.status !== 'OFFLINE';

  useEffect(() => {
    dispatch(fetchRiderProfile());
  }, [dispatch]);
  usePolling(() => dispatch(fetchActiveDelivery()), 1500);
  // Offers arrive over Socket.io in the real app; polled here
  usePolling(() => dispatch(fetchOffers()), 1500, Boolean(online) && !active);

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="flex items-center gap-4 p-4">
        <span className={cx('grid h-12 w-12 place-items-center rounded-2xl', online ? 'bg-emerald-500 text-white' : 'bg-grey-50 text-grey-600')}><Icon name="scooter" className="h-6 w-6" /></span>
        <div className="flex-1">
          <p className="font-extrabold">{online ? 'You are online' : 'You are offline'}</p>
          <p className="text-sm text-grey-600">{online ? 'Offers arrive here with a 20 second timer.' : 'Go online to receive offers.'}</p>
        </div>
        <button role="switch" aria-checked={Boolean(online)} aria-label="Online" onClick={() => dispatch(setRiderStatus(online ? 'OFFLINE' : 'ONLINE'))} className={cx('relative h-8 w-14 rounded-full transition', online ? 'bg-emerald-500' : 'bg-grey-400')}>
          <span className={cx('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all', online ? 'left-7' : 'left-1')} />
        </button>
      </Card>

      {active ? (
        <ActiveDelivery o={active} />
      ) : (
        <div className="mt-6">
          <h2 className="text-xl font-extrabold">Offers</h2>
          <div className="mt-3 space-y-3">
            {offers.map((of) => <OfferCard key={of.id} of={of} />)}
            {online && offers.length === 0 && (
              <Card className="p-6 text-center text-grey-600">
                <p className="font-bold text-grey-800">Waiting for offers…</p>
                <p className="mt-1 text-sm">To get one: in the seller console (another tab) press “Simulate an incoming order”, then Accept it. The offer appears here for 20 seconds.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function OfferCard({ of }) {
  const dispatch = useDispatch();
  const now = useNow(250);
  const [busy, setBusy] = useState(false);
  const left = Math.max(0, Math.ceil((of.expiresAt - now) / 1000));
  const respond = async (action) => {
    setBusy(true);
    try {
      await dispatch(respondToOffer({ id: of.id, action })).unwrap();
      dispatch(fetchActiveDelivery());
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Offer gone', message: e.message }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 bg-grey-50"><div className="h-full bg-primary transition-all" style={{ width: `${(left / 20) * 100}%` }} /></div>
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-extrabold">{of.shop}</p>
            <p className="text-sm text-grey-600">{of.items} items · pickup {of.pickupKm} km · drop {of.dropKm} km</p>
          </div>
          <span className="font-display text-3xl font-extrabold" aria-label={`${left} seconds left`}>{left}s</span>
        </div>
        <div className="mt-2 flex items-center gap-2"><TempBadge temp={of.tempClass} /><Pill tone="green">Est. {rupees(of.estPayPaise)}</Pill></div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => respond('decline')}>Decline</Button>
          <Button onClick={() => respond('accept')} loading={busy}>Accept</Button>
        </div>
      </div>
    </Card>
  );
}

function ActiveDelivery({ o }) {
  const dispatch = useDispatch();
  const stepPending = useSelector((state) => state.rider.stepPending);
  const [sealed, setSealed] = useState(false);
  const [code, setCode] = useState('');
  const [cash, setCash] = useState('');
  const [driving, setDriving] = useState(false);
  const [sos, setSos] = useState(false);
  const drive = useRef(null);
  const t = o.track;
  const pickedUp = ['PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(o.status);
  const target = pickedUp ? o.drop : o.seller;

  const step = async (s, body, okToast) => {
    try {
      await dispatch(deliveryStep({ orderId: o.id, step: s, body })).unwrap();
      if (okToast) dispatch(addToast(okToast));
      dispatch(fetchActiveDelivery());
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Not done', message: e.message }));
    }
  };

  // Simulated GPS: one ping a second toward the next stop (real app: watchPosition every 5 s)
  useEffect(() => {
    if (!driving) return;
    let pos = t.riderPos || o.seller;
    drive.current = setInterval(async () => {
      const d = distanceM(pos, target);
      if (d < 20) {
        setDriving(false);
        return;
      }
      const k = Math.min(1, 28 / d); // about 100 km/h, under the server's 120 km/h check
      pos = { lat: pos.lat + (target.lat - pos.lat) * k, lng: pos.lng + (target.lng - pos.lng) * k };
      await dispatch(sendLocation(pos));
      dispatch(fetchActiveDelivery());
    }, 1000);
    return () => clearInterval(drive.current);
  }, [driving]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;

  return (
    <div className="mt-6 space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-grey-900 px-4 pt-3 text-white">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">Order #{o.id} · {o.status.replace(/_/g, ' ').toLowerCase()}</span>
            <TempBadge temp={o.tempClass} />
          </div>
          <LaneSvg stage={o.status} progress={t.progress} height={90} />
        </div>
        <div className="p-4">
          <p className="font-extrabold">{pickedUp ? 'Deliver to' : 'Collect from'}: {pickedUp ? o.addressText : o.seller.shopName}</p>
          <p className="text-sm text-grey-600">{pickedUp ? `${(t.distanceM / 1000).toFixed(2)} km to drop · about ${t.etaMin} min` : 'Head to the shop'}</p>
          {o.hotHoldWarning && <p className="mt-2 rounded-xl bg-red/10 p-2 text-sm font-bold text-red-text">Packed over 10 minutes ago. Ask the shop to re-pack hot items.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1 rounded-full bg-grey-50 px-4 text-sm font-bold"><Icon name="map" className="h-4 w-4" /> Navigate</a>
            {(!pickedUp || o.status === 'ON_THE_WAY') && (
              <Button size="sm" variant={driving ? 'dark' : 'ghost'} onClick={() => setDriving((d) => !d)}>{driving ? 'Stop simulated drive' : 'Simulate drive (demo GPS)'}</Button>
            )}
          </div>
        </div>
      </Card>

      {['ACCEPTED', 'PACKING', 'PACKED'].includes(o.status) && (
        <Card className="p-4">
          <h3 className="font-extrabold">Pickup</h3>
          <ul className="mt-2 text-sm">{o.items.map((i) => <li key={i.productId}>{i.qty} × {i.title}</li>)}</ul>
          <label className="mt-3 flex items-center gap-3 rounded-xl bg-grey-50 p-3 font-semibold">
            <input type="checkbox" checked={sealed} onChange={(e) => setSealed(e.target.checked)} className="h-5 w-5 accent-orange-deep" />
            Package sealed and items counted
          </label>
          <Button className="mt-3 w-full" disabled={o.status !== 'PACKED' || !sealed} onClick={() => step('picked-up', { sealed })} loading={stepPending}>
            {o.status === 'PACKED' ? 'Picked up' : 'Waiting for the shop to pack'}
          </Button>
        </Card>
      )}

      {pickedUp && (
        <Card className="p-4">
          <h3 className="font-extrabold">Delivery code</h3>
          {o.insideGeofence || o.status === 'ARRIVED' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                step('deliver', { code, collectedPaise: o.paymentMode === 'COD' ? Math.round(Number(cash || 0) * 100) : undefined }, { type: 'success', title: 'Delivered', message: 'Earnings row added.' });
              }}
            >
              <p className="text-sm text-grey-600">Ask the customer for their 4-digit code.</p>
              <label htmlFor="otp" className="sr-only">Delivery code</label>
              <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="mt-2 h-14 w-full rounded-2xl border-2 border-grey-800/15 text-center font-display text-3xl tracking-[0.5em] focus:border-orange focus:outline-none" placeholder="••••" />
              {o.paymentMode === 'COD' && (
                <label className="mt-3 block">
                  <span className="text-sm font-bold">Cash collected (to collect: {rupeesExact(o.totalPaise)})</span>
                  <input type="number" inputMode="decimal" min="0" step="1" value={cash} onChange={(e) => setCash(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-grey-800/15 px-3" placeholder={(o.totalPaise / 100).toFixed(0)} />
                </label>
              )}
              <Button type="submit" className="mt-3 w-full" disabled={code.length !== 4 || o.otpLocked} loading={stepPending}>Complete delivery</Button>
              {o.otpLocked && <p className="mt-2 text-sm font-bold text-red-text">Too many wrong codes. An admin has been alerted.</p>}
            </form>
          ) : (
            <p className="mt-1 flex items-center gap-2 text-sm text-grey-600"><Icon name="lock" className="h-4 w-4" /> Code entry unlocks inside 150 m of the drop point.</p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href="tel:+910000000000" className="inline-flex h-11 items-center justify-center gap-1 rounded-full bg-grey-50 text-sm font-bold"><Icon name="phone" className="h-4 w-4" /> Call customer</a>
            <Button variant="ghost" onClick={() => step('unreachable', {}, { type: 'sun', title: 'Waiting 5 minutes', message: 'Then an admin takes over. No penalty for you.' })}>Not reachable</Button>
          </div>
        </Card>
      )}

      <Button variant="danger" className="w-full" onClick={() => setSos(true)}><Icon name="alert" className="h-5 w-5" /> Emergency</Button>
      <Modal open={sos} onClose={() => setSos(false)} title="Emergency">
        <div className="relative p-6">
          <CloseButton onClick={() => setSos(false)} className="absolute right-3 top-3" />
          <h2 className="text-2xl font-extrabold">Accident or breakdown?</h2>
          <p className="mt-2 text-grey-600">We alert an admin and send the nearest rider to your last position. No penalty once the admin confirms.</p>
          <Button
            variant="danger"
            className="mt-5 w-full"
            onClick={() => {
              step('emergency', { note: 'rider pressed emergency' }, { type: 'sun', title: 'Admin alerted', message: 'The nearest rider is being sent to your location.' });
              setSos(false);
            }}
          >
            Alert admin now
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default RiderToday;
