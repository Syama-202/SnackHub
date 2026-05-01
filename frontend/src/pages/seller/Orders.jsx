import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AnimatePresence, m } from 'motion/react';
import { fetchSellerOrders, fetchShopProfile, sellerOrderAction, simulateIncomingOrder } from '../../store/slices/seller';
import { addToast } from '../../store/slices/toast';
import { rupees } from '@shared/domain/money';
import { useNow, usePolling } from '../../hooks';
import { isDemoSession } from '../../store/slices/auth';
import { Button, Card, Pill, TempBadge, Skeleton, cx } from '../../components/ui';

const COLUMNS = [
  { id: 'new', title: 'New', match: ['PLACED'] },
  { id: 'packing', title: 'Packing', match: ['ACCEPTED', 'PACKING'] },
  { id: 'packed', title: 'Packed', match: ['PACKED'] },
];
const DONE = ['PICKED_UP', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED', 'CANCELLED', 'REJECTED'];

/** Board with three columns: New, Packing, Packed (doc 11.2). */
const SellerOrders = () => {
  const dispatch = useDispatch();
  const { orders, ordersLoaded, shop } = useSelector((state) => state.seller);
  const [sound, setSound] = useState(false);
  const seen = useRef(null);
  const was = useRef(null);

  usePolling(() => dispatch(fetchSellerOrders()), 4000, true, 'order');
  usePolling(() => dispatch(fetchShopProfile()), 30000, true, 'shop');

  // A toast and an optional sound for new orders (doc 11.2: push and a sound alert)
  useEffect(() => {
    if (!ordersLoaded) return;
    const ids = new Set(orders.filter((o) => o.status === 'PLACED').map((o) => o.id));
    if (seen.current) {
      const fresh = [...ids].filter((id) => !seen.current.has(id));
      if (fresh.length) {
        dispatch(addToast({ type: 'sun', title: 'New order', message: `Order #${fresh[0]} is waiting. Accept within 2 minutes.` }));
        if (sound) beep();
      }
    }
    seen.current = ids;
    // an open order the customer (or the shop clock) closed since the last look
    const now = new Map(orders.map((o) => [o.id, o.status]));
    if (was.current) {
      const closed = orders.find((o) => o.status === 'CANCELLED' && was.current.get(o.id) && was.current.get(o.id) !== 'CANCELLED');
      if (closed) dispatch(addToast({ type: 'error', title: 'Order cancelled', message: `Order #${closed.id} was cancelled. You do not need to pack it.` }));
    }
    was.current = now;
  }, [orders, ordersLoaded, sound, dispatch]);

  const simulate = async () => {
    try {
      await dispatch(simulateIncomingOrder()).unwrap();
      dispatch(fetchSellerOrders());
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Could not create', message: e.message }));
    }
  };

  const done = orders.filter((o) => DONE.includes(o.status)).slice(0, 8);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold">Orders</h1>
        {shop && <Pill tone={shop.paused ? 'red' : 'green'}>{shop.paused ? 'Shop paused' : 'Taking orders'}</Pill>}
        {shop?.busyExtraMin > 0 && <Pill tone="orange">Busy +{shop.busyExtraMin} min</Pill>}
        {isDemoSession() && <Button size="sm" variant="ghost" className="ml-auto" onClick={simulate}>Simulate an incoming order (demo)</Button>}
        <label className={cx('flex items-center gap-2 text-sm font-bold', !isDemoSession() && 'ml-auto')}>
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="h-4 w-4 accent-orange-deep" /> Sound alert
        </label>
      </div>
      {shop && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Orders today" value={shop.stats.ordersToday} />
          <Stat label="Delivered" value={shop.stats.delivered} />
          <Stat label="Sales (delivered)" value={rupees(shop.stats.salesPaise)} />
          <Stat label="Quality score" value={shop.qualityScore ?? '–'} hint={shop.qualityScore == null ? 'After your first ratings' : shop.qualityScore < 70 ? 'Below 70 warns' : 'Healthy'} />
        </div>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => {
          const list = orders.filter((o) => c.match.includes(o.status));
          return (
            <section key={c.id} className="rounded-[22px] border border-white/70 bg-white/45 p-3 shadow-sm" aria-labelledby={`col-${c.id}`}>
              <h2 id={`col-${c.id}`} className="flex items-center justify-between px-1 pb-2 font-display text-lg font-extrabold">
                {c.title} <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-sm">{list.length}</span>
              </h2>
              <div className="space-y-3">
                {!ordersLoaded && <Skeleton className="h-36" />}
                <AnimatePresence initial={false}>
                  {list.map((o) => (
                    <m.div key={o.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                      <OrderCard order={o} />
                    </m.div>
                  ))}
                </AnimatePresence>
                {ordersLoaded && list.length === 0 && <p className="px-1 py-6 text-center text-sm text-grey-600">Nothing here</p>}
              </div>
            </section>
          );
        })}
      </div>
      <h2 className="mt-8 text-xl font-extrabold">Recent</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-grey-600"><tr><th className="p-3">Order</th><th className="p-3">Items</th><th className="p-3">Status</th><th className="p-3 text-right">Value</th></tr></thead>
          <tbody>
            {done.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-grey-600">Finished, cancelled and rejected orders show here.</td></tr>}
            {done.map((o) => (
              <tr key={o.id} className="border-t border-grey-800/5">
                <td className="p-3 font-bold">#{o.id}</td>
                <td className="p-3">{o.items.map((i) => `${i.title} × ${i.qty}`).join(', ')}</td>
                <td className="p-3"><Pill tone={o.status === 'DELIVERED' ? 'green' : o.status === 'CANCELLED' || o.status === 'REJECTED' ? 'red' : 'sun'}>{o.status.replace('_', ' ').toLowerCase()}</Pill></td>
                <td className="p-3 text-right font-bold">{rupees(o.subtotalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

function Stat({ label, value, hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-grey-600">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
      {hint && <p className="text-xs text-grey-600">{hint}</p>}
    </Card>
  );
}

function OrderCard({ order: o }) {
  const dispatch = useDispatch();
  const now = useNow(1000);
  const pending = useSelector((state) => Boolean(state.seller.pending[o.id]));
  const secsLeft = Math.max(0, 120 - Math.floor((now - o.placedAt) / 1000));
  const run = async (action) => {
    try {
      await dispatch(sellerOrderAction({ id: o.id, action })).unwrap();
    } catch (e) {
      dispatch(addToast({ type: 'error', title: 'Action failed', message: e.message }));
    }
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-extrabold">#{o.id} <TempBadge temp={o.tempClass} /></p>
          <p className="text-xs text-grey-600">{new Date(o.placedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {o.paymentMode === 'COD' ? 'Pay on delivery' : 'Paid online'}</p>
        </div>
        {o.status === 'PLACED' && <span className={cx('rounded-full px-2 py-0.5 text-xs font-extrabold', secsLeft < 30 ? 'bg-red-strong text-white' : 'bg-sun text-grey-800')} aria-label={`${secsLeft} seconds to accept`}>{Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, '0')}</span>}
        {o.simulated && <Pill tone="grey">Auto (demo)</Pill>}
      </div>
      <ul className="mt-2 text-sm">
        {o.items.map((i) => <li key={i.productId}><b>{i.qty} ×</b> {i.title}</li>)}
      </ul>
      {o.status === 'ACCEPTED' && o.tempClass === 'HOT' && (
        <p className="mt-2 rounded-xl bg-sun/25 p-2 text-xs font-semibold">{o.rider ? `Rider ${o.rider.name} assigned. Cook now so it is hot at pickup.` : 'Wait for a rider before frying. You will get a “cook now” prompt.'}</p>
      )}
      {o.status === 'PACKED' && <p className="mt-2 text-xs text-grey-600">{o.rider ? `Waiting for ${o.rider.name} to collect.` : 'Finding a rider…'}</p>}
      {['ACCEPTED', 'PACKING'].includes(o.status) && o.tempClass !== 'HOT' && !o.rider && <p className="mt-2 text-xs text-grey-600">Finding a rider…</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {o.status === 'PLACED' && (
          <>
            <Button size="sm" onClick={() => run('accept')} loading={pending}>Accept</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run('reject')}>Reject</Button>
          </>
        )}
        {o.status === 'ACCEPTED' && <Button size="sm" loading={pending} onClick={() => run('start')}>Start packing</Button>}
        {o.status === 'PACKING' && <Button size="sm" loading={pending} onClick={() => run('packed')}>Mark packed</Button>}
      </div>
    </Card>
  );
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* audio blocked */
  }
}

export default SellerOrders;
