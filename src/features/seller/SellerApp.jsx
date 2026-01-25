import { useEffect, useRef, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import ConsoleLayout from '../../layouts/ConsoleLayout';
import { api } from '../../lib/api';
import { actions } from '../../store/web';
import { rupees } from '../../domain/money';
import { useNow } from '../../lib/hooks';
import { Button, Card, Pill, Icon, TempBadge, Skeleton, cx } from '../../components/ui';
import SnackArt from '../../components/SnackArt';

const TABS = [
  { to: '/seller', label: 'Orders', icon: 'list', end: true },
  { to: '/seller/products', label: 'Products', icon: 'box' },
  { to: '/seller/shop', label: 'Shop', icon: 'settings' },
];

export default function SellerApp() {
  return (
    <ConsoleLayout title="Seller console" tabs={TABS} mobileTabs>
      <Routes>
        <Route index element={<Board />} />
        <Route path="products" element={<Products />} />
        <Route path="shop" element={<Shop />} />
      </Routes>
    </ConsoleLayout>
  );
}

function useSellerAction() {
  const qc = useQueryClient();
  const dispatch = useDispatch();
  return useMutation({
    mutationFn: ({ id, action }) => api(`/seller/orders/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller', 'orders'] }),
    onError: (e) => dispatch(actions.toast({ title: 'Action failed', body: e.message, tone: 'error' })),
  });
}

/** Board with three columns: New, Packing, Packed (doc 11.2). */
function Board() {
  const { data: orders, isLoading } = useQuery({ queryKey: ['seller', 'orders'], queryFn: () => api('/seller/orders'), refetchInterval: 2000 });
  const { data: shop } = useQuery({ queryKey: ['seller', 'shop'], queryFn: () => api('/seller/shop'), refetchInterval: 10000 });
  const [sound, setSound] = useState(false);
  const seen = useRef(null);
  const dispatch = useDispatch();

  // Sound alert for new orders (doc 11.2: push and a sound alert)
  useEffect(() => {
    if (!orders) return;
    const ids = new Set(orders.filter((o) => o.status === 'PLACED').map((o) => o.id));
    if (seen.current) {
      const fresh = [...ids].filter((id) => !seen.current.has(id));
      if (fresh.length) {
        dispatch(actions.toast({ title: 'New order', body: `Order #${fresh[0]} is waiting. Accept within 2 minutes.`, tone: 'sun' }));
        if (sound) beep();
      }
    }
    seen.current = ids;
  }, [orders, sound, dispatch]);

  const cols = [
    { id: 'new', title: 'New', match: ['PLACED'] },
    { id: 'packing', title: 'Packing', match: ['ACCEPTED', 'PACKING'] },
    { id: 'packed', title: 'Packed', match: ['PACKED'] },
  ];
  const done = orders?.filter((o) => ['PICKED_UP', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED', 'CANCELLED', 'REJECTED'].includes(o.status)).slice(0, 8) || [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold">Orders</h1>
        {shop && <Pill tone={shop.paused ? 'red' : 'green'}>{shop.paused ? 'Shop paused' : 'Taking orders'}</Pill>}
        {shop?.busyExtraMin > 0 && <Pill tone="orange">Busy +{shop.busyExtraMin} min</Pill>}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => api('/dev/incoming-order', { method: 'POST' }).catch((e) => dispatch(actions.toast({ title: 'Could not create', body: e.message, tone: 'error' })))}
        >
          Simulate an incoming order (demo)
        </Button>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="h-4 w-4 accent-[#E86A00]" /> Sound alert
        </label>
      </div>
      {shop && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Orders today" value={shop.stats.ordersToday} />
          <Stat label="Delivered" value={shop.stats.delivered} />
          <Stat label="Sales (delivered)" value={rupees(shop.stats.salesPaise)} />
          <Stat label="Quality score" value={shop.qualityScore} hint={shop.qualityScore < 70 ? 'Below 70 warns' : 'Healthy'} />
        </div>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {cols.map((c) => {
          const list = orders?.filter((o) => c.match.includes(o.status)) || [];
          return (
            <section key={c.id} className="rounded-[22px] bg-grey-50 p-3" aria-labelledby={`col-${c.id}`}>
              <h2 id={`col-${c.id}`} className="flex items-center justify-between px-1 pb-2 font-display text-lg font-extrabold">
                {c.title} <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white px-2 text-sm">{list.length}</span>
              </h2>
              <div className="space-y-3">
                {isLoading && <Skeleton className="h-36" />}
                <AnimatePresence initial={false}>
                  {list.map((o) => (
                    <motion.div key={o.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
                      <OrderCard o={o} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {!isLoading && list.length === 0 && <p className="px-1 py-6 text-center text-sm text-grey-600">Nothing here</p>}
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
}

function Stat({ label, value, hint }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-grey-600">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
      {hint && <p className="text-xs text-grey-600">{hint}</p>}
    </Card>
  );
}

function OrderCard({ o }) {
  const now = useNow(1000);
  const act = useSellerAction();
  const secsLeft = Math.max(0, 120 - Math.floor((now - o.placedAt) / 1000));
  const run = (action) => act.mutate({ id: o.id, action });
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
      <div className="mt-3 flex flex-wrap gap-2">
        {o.status === 'PLACED' && (
          <>
            <Button size="sm" onClick={() => run('accept')} loading={act.isPending}>Accept</Button>
            <Button size="sm" variant="ghost" onClick={() => run('reject')}>Reject</Button>
          </>
        )}
        {o.status === 'ACCEPTED' && <Button size="sm" onClick={() => run('start')}>Start packing</Button>}
        {o.status === 'PACKING' && <Button size="sm" onClick={() => run('packed')}>Mark packed</Button>}
      </div>
    </Card>
  );
}

function Products() {
  const qc = useQueryClient();
  const dispatch = useDispatch();
  const { data, isLoading } = useQuery({ queryKey: ['seller', 'products'], queryFn: () => api('/seller/products') });
  const adjust = useMutation({
    mutationFn: ({ id, delta, reason }) => api(`/seller/products/${id}/stock`, { method: 'PATCH', body: { delta, reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller', 'products'] }),
    onError: (e) => dispatch(actions.toast({ title: 'Stock not changed', body: e.message, tone: 'error' })),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }) => api(`/seller/products/${id}`, { method: 'PATCH', body: { active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller', 'products'] }),
  });
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Products and stock</h1>
      <p className="mt-1 text-sm text-grey-600">Stock edits are adjustments (plus or minus, with a reason) applied to the live count, so orders arriving at the same time are never overwritten.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        {data?.map((p) => (
          <Card key={p.id} className={cx('flex gap-4 p-4', !p.active && 'opacity-60')}>
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sun/25 to-orange/10">
              <SnackArt shape={p.art.shape} colors={p.art.colors} plate={false} className="h-20 w-20" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-bold">{p.title}</p>
                <TempBadge temp={p.servingTemp} />
              </div>
              <p className="text-sm text-grey-600">{rupees(p.pricePaise)} · {p.weight} · prep {p.prepMinutes} min</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cx('rounded-full px-2.5 py-1 text-sm font-extrabold', p.stock === 0 ? 'bg-red-strong text-white' : p.stock <= 3 ? 'bg-sun text-grey-800' : 'bg-grey-50')}>{p.stock === 0 ? 'Sold out' : `${p.stock} in stock`}</span>
                <div className="inline-flex overflow-hidden rounded-full ring-1 ring-grey-800/15" role="group" aria-label={`Adjust stock for ${p.title}`}>
                  <button className="h-9 w-10 font-black hover:bg-grey-50 disabled:opacity-40" disabled={p.stock === 0} onClick={() => adjust.mutate({ id: p.id, delta: -1, reason: 'manual correction' })} aria-label="Remove one">−</button>
                  <button className="h-9 w-12 border-x border-grey-800/10 text-sm font-bold hover:bg-grey-50" onClick={() => adjust.mutate({ id: p.id, delta: 5, reason: 'new batch' })} aria-label="Add five">+5</button>
                  <button className="h-9 w-10 font-black hover:bg-grey-50" onClick={() => adjust.mutate({ id: p.id, delta: 1, reason: 'manual correction' })} aria-label="Add one">+</button>
                </div>
                <button onClick={() => adjust.mutate({ id: p.id, delta: -p.stock, reason: 'item unavailable' })} disabled={p.stock === 0} className="h-9 rounded-full px-3 text-xs font-bold text-red-text hover:bg-red/10 disabled:opacity-40">Mark unavailable</button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs font-bold text-grey-600">
                <input type="checkbox" checked={p.active} onChange={(e) => toggle.mutate({ id: p.id, active: e.target.checked })} className="h-4 w-4 accent-[#E86A00]" /> Listed
              </label>
              {p.lastAdjust && <p className="mt-1 text-xs text-grey-600">Last change: {p.lastAdjust.delta > 0 ? '+' : ''}{p.lastAdjust.delta} ({p.lastAdjust.reason})</p>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const SHOP_STEPS = ['draft', 'pending', 'probation', 'active'];

function Shop() {
  const qc = useQueryClient();
  const { data: s } = useQuery({ queryKey: ['seller', 'shop'], queryFn: () => api('/seller/shop') });
  const save = useMutation({
    mutationFn: (body) => api('/seller/shop', { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller', 'shop'] }),
  });
  if (!s) return <Skeleton className="h-64" />;
  const expDays = Math.round((new Date(s.licenceExpiresOn) - Date.now()) / 86400000);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-extrabold">{s.shopName}</h1>
        <p className="text-grey-600">{s.city}, {s.region}</p>
        <Card className="mt-4 p-5">
          <h2 className="text-lg font-extrabold">Verification status</h2>
          <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {SHOP_STEPS.map((st, i) => {
              const reached = SHOP_STEPS.indexOf(s.status) >= i;
              return (
                <li key={st} className="flex items-center gap-2">
                  <span className={cx('rounded-full px-3 py-1 font-bold capitalize', s.status === st ? 'bg-grey-800 text-white' : reached ? 'bg-emerald-50 text-emerald-700' : 'bg-grey-50 text-grey-600')}>{st === 'pending' ? 'under review' : st}</span>
                  {i < SHOP_STEPS.length - 1 && <Icon name="arrowRight" className="h-4 w-4 text-grey-400" />}
                </li>
              );
            })}
          </ol>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-grey-600">Food licence</dt><dd className="font-mono font-bold">{s.licenceNo}</dd></div>
            <div><dt className="text-grey-600">Expires</dt><dd className={cx('font-bold', expDays < 30 && 'text-red-text')}>{s.licenceExpiresOn} ({expDays} days)</dd></div>
            <div><dt className="text-grey-600">Quality score</dt><dd className="font-bold">{s.qualityScore} / 100</dd></div>
            <div><dt className="text-grey-600">Acceptance rate</dt><dd className="font-bold">{Math.round(s.acceptanceRate * 100)}%</dd></div>
          </dl>
          {expDays < 30 && <p className="mt-3 rounded-xl bg-red/10 p-3 text-sm font-semibold text-red-text">Your licence expires soon. The shop is suspended on the expiry date until a renewed licence is verified.</p>}
          <p className="mt-3 text-xs text-grey-600">The “Verified shop” badge shows only while your licence is valid and the shop is active. Below 70 warns, below 60 limits your reach, below 50 suspends.</p>
        </Card>
      </div>
      <Card className="p-5 lg:mt-16">
        <h2 className="text-lg font-extrabold">Busy mode</h2>
        <p className="text-sm text-grey-600">Add prep time when the kitchen is slammed, so the delivery time customers see stays honest. Shops that cannot make 30 minutes for an address are not shown there.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Extra prep minutes">
          {[0, 3, 6, 10].map((m) => (
            <button key={m} role="radio" aria-checked={s.busyExtraMin === m} onClick={() => save.mutate({ busyExtraMin: m })} className={cx('h-11 rounded-full px-4 font-bold', s.busyExtraMin === m ? 'bg-grey-800 text-white' : 'bg-grey-50')}>
              {m === 0 ? 'Normal' : `+${m} min`}
            </button>
          ))}
        </div>
        <h2 className="mt-6 text-lg font-extrabold">Pause the shop</h2>
        <p className="text-sm text-grey-600">Paused shops are hidden from customers. Open orders still need to be finished.</p>
        <Button className="mt-3" variant={s.paused ? 'primary' : 'outline'} onClick={() => save.mutate({ paused: !s.paused })}>{s.paused ? 'Resume taking orders' : 'Pause new orders'}</Button>
        <p className="mt-6 text-sm text-grey-600">Opening hours: <b>{s.openHours}</b> · Delivery radius: <b>{s.radiusKm} km</b> (hot snacks are capped at 3 km)</p>
      </Card>
    </div>
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
