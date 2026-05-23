import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useCountUp, usePolling } from '../../hooks';
import { rupees } from '@shared/domain/money';
import { STATE_LABEL, isActive } from '@shared/domain/orderStates';
import { Card, Pill, Icon, Button, cx } from '../../components/ui';
import { TrackMap } from '../../components/tracking/TrackMap';
import { tokenReplaced } from '../../store/slices/auth';
import { fetchAdminOrders, fetchAdminRiders, fetchAdminSellers, fetchReconciliation, fetchSla } from '../../store/slices/admin';

function Metric({ label, value, format = (v) => Math.round(v), tone }) {
  const v = useCountUp(value || 0);
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-grey-600">{label}</p>
      <p className={cx('mt-1 font-display text-3xl font-extrabold', tone)}>{format(v)}</p>
    </Card>
  );
}

/** Live orders, SLA dashboard and alerts (doc 11.4). */
const LiveOps = () => {
  const dispatch = useDispatch();
  const token = useSelector((state) => state.auth.accessToken);
  const { sla: m, orders, riders, sellers, reconciliation: recon } = useSelector((state) => state.admin);
  const [picked, setPicked] = useState(() => {
    try {
      return localStorage.getItem('snackhub.admin.city');
    } catch {
      return null;
    }
  });
  const pick = (c) => {
    setPicked(c);
    try {
      localStorage.setItem('snackhub.admin.city', c);
    } catch {
      /* storage blocked */
    }
  };

  usePolling(() => dispatch(fetchSla()), 10000, true, 'order');
  usePolling(() => dispatch(fetchAdminOrders()), 5000, true, 'order');
  usePolling(() => dispatch(fetchAdminRiders()), 5000, true, ['rider', 'position']);
  usePolling(() => dispatch(fetchReconciliation()), 15000, true, 'order');
  usePolling(() => dispatch(fetchAdminSellers()), 30000);

  const live = orders.filter((o) => isActive(o.status));
  const cities = [...new Set(sellers.map((s) => s.cityId))].sort();
  // open on the city with the most live orders until an admin picks one
  const perCity = {};
  for (const o of live) {
    const c = sellers.find((s) => s.id === o.seller.id)?.cityId;
    if (c) perCity[c] = (perCity[c] ?? 0) + 1;
  }
  const busiest = Object.keys(perCity).sort((x, y) => perCity[y] - perCity[x])[0];
  // with no live orders: the city with the most riders online, then the most shops
  const count = (list, c) => list.filter((x) => x.cityId === c).length;
  const fullest = [...cities].sort((x, y) => count(riders, y) - count(riders, x) || count(sellers, y) - count(sellers, x))[0];
  const city = (picked && cities.includes(picked) ? picked : null) ?? busiest ?? fullest;
  const alerts = [
    ...orders.filter((o) => o.emergency).map((o) => ({ tone: 'red', text: `Rider emergency on order #${o.id}` })),
    ...orders.filter((o) => o.cashMismatch).map((o) => ({ tone: 'orange', text: `Cash mismatch on #${o.id}: collected ${rupees(o.collectedPaise)} of ${rupees(o.totalPaise)}` })),
    ...(m?.lateOrders > 2 ? [{ tone: 'orange', text: `${m.lateOrders} late deliveries: consider slow mode for the area` }] : []),
  ];

  // Demo helper: pretend the second factor was checked 6 minutes ago, to show the step-up
  const expireMfa = () => {
    const [, , id] = token.split('.');
    dispatch(tokenReplaced(`demo.admin.${id}.${Date.now() - 6 * 60000}`));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold">Live operations</h1>
        {token?.startsWith('demo.') && <Button size="sm" variant="ghost" className="ml-auto" onClick={expireMfa}>Expire my MFA (demo step-up)</Button>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Active orders" value={m?.activeOrders} />
        <Metric label="Delivered today" value={m?.deliveredToday} />
        <Metric label="On-time rate" value={(m?.onTimeRate || 0) * 100} format={(v) => `${Math.round(v)}%`} tone={m?.onTimeRate < 0.85 ? 'text-red-text' : ''} />
        <Metric label="P90 delivery" value={m?.p90DeliveryMin} format={(v) => `${v.toFixed(1)}m`} />
        <Metric label="Late orders" value={m?.lateOrders} tone={m?.lateOrders ? 'text-red-text' : ''} />
        <Metric label="Riders online" value={m?.ridersOnline} />
        <Metric label="Open complaints" value={m?.openComplaints} />
      </div>

      {alerts.length > 0 && (
        <div className="mt-4 space-y-2" role="alert">
          {alerts.map((a, i) => (
            <p key={i} className={cx('flex items-center gap-2 rounded-2xl p-3 text-sm font-bold', a.tone === 'red' ? 'bg-red-strong text-white' : 'bg-sun/30 text-grey-800')}>
              <Icon name="alert" className="h-4 w-4" /> {a.text}
            </p>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Live map</h2>
            <select value={city ?? ''} onChange={(e) => pick(e.target.value)} className="h-10 rounded-full border border-grey-800/15 px-3 text-sm capitalize" aria-label="City">
              {cities.map((c) => <option key={c} value={c}>{c.replace(/-/g, ' ')}</option>)}
            </select>
          </div>
          <OpsMap city={city} sellers={sellers} riders={riders} orders={live} />
        </Card>
        <Card className="p-4">
          <h2 className="text-lg font-extrabold">Live orders</h2>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
            {live.length === 0 && <p className="py-8 text-center text-sm text-grey-600">No active orders. Place one on the customer site.</p>}
            {live.map((o) => (
              <div key={o.id} className="rounded-xl bg-grey-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold">#{o.id} · {o.seller.shopName}</span>
                  <Pill tone={o.tempClass === 'HOT' ? 'red' : 'orange'}>{o.tempClass}</Pill>
                </div>
                <p className="text-grey-600">{STATE_LABEL[o.status]} · {o.rider ? o.rider.name : 'no rider yet'} · promised {new Date(o.promisedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full bg-primary" style={{ width: `${Math.round(o.track.progress * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6 overflow-x-auto p-4">
        <h2 className="text-lg font-extrabold">Cash reconciliation</h2>
        <p className="text-sm text-grey-600">Pay-on-delivery orders: what the rider recorded against the order total.</p>
        <table className="mt-3 w-full min-w-[480px] text-sm">
          <thead className="text-left text-grey-600"><tr><th className="py-2">Order</th><th>Rider</th><th>Total</th><th>Collected</th><th>Status</th></tr></thead>
          <tbody>
            {recon.length === 0 && <tr><td colSpan="5" className="py-4 text-grey-600">No delivered pay-on-delivery orders yet.</td></tr>}
            {recon.map((r) => (
              <tr key={r.orderId} className="border-t border-grey-800/5">
                <td className="py-2 font-bold">#{r.orderId}</td><td>#{r.riderId}</td><td>{rupees(r.totalPaise)}</td><td>{rupees(r.collectedPaise)}</td>
                <td>{r.mismatch ? <Pill tone="red">Mismatch</Pill> : <Pill tone="green">Matches</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

function OpsMap({ city, sellers, riders, orders }) {
  const shops = sellers.filter((s) => s.cityId === city);
  const rs = riders.filter((r) => r.cityId === city && r.lat != null);
  const os = orders.filter((o) => shops.some((s) => s.id === o.seller.id));
  const points = useMemo(
    () => [
      ...shops.map((s) => ({ id: `s${s.id}`, kind: 'shop', lat: s.lat, lng: s.lng, muted: !['active', 'probation'].includes(s.status), label: `${s.shopName}${s.status !== 'active' ? ` (${s.status})` : ''}` })),
      ...rs.map((r) => ({ id: `r${r.id}`, kind: 'rider', lat: r.lat, lng: r.lng, muted: r.status === 'OFFLINE', label: `Rider ${r.name ?? `#${r.id}`}, ${String(r.status).toLowerCase()}` })),
      ...os.filter((o) => o.drop).map((o) => ({ id: `o${o.id}`, kind: 'drop', lat: o.drop.lat, lng: o.drop.lng, label: `Drop for order #${o.id}` })),
    ],
    [shops, rs, os],
  );
  const lines = useMemo(() => os.filter((o) => o.drop).map((o) => [o.track?.riderPos ?? o.seller, o.drop]), [os]);
  return (
    <div className="mt-3">
      <TrackMap points={points} lines={lines} height={380} label={`Map of ${city}: ${shops.length} shops, ${rs.length} riders, ${os.length} active orders`} />
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-grey-600">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-orange-deep" /> Shop</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-primary" /> Rider (last GPS fix)</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-grey-900" /> Drop point</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-grey-400" /> Offline or not live</li>
      </ul>
    </div>
  );
}

export default LiveOps;
