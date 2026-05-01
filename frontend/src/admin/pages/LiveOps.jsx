import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useCountUp, usePolling } from '../../hooks';
import { rupees } from '@shared/domain/money';
import { STATE_LABEL, isActive } from '@shared/domain/orderStates';
import { Card, Pill, Icon, Button, cx } from '../../components/ui';
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
  const [city, setCity] = useState('guntur');

  usePolling(() => dispatch(fetchSla()), 10000, true, 'order');
  usePolling(() => dispatch(fetchAdminOrders()), 5000, true, 'order');
  usePolling(() => dispatch(fetchAdminRiders()), 5000, true, ['rider', 'position']);
  usePolling(() => dispatch(fetchReconciliation()), 15000, true, 'order');
  usePolling(() => dispatch(fetchAdminSellers()), 30000);

  const live = orders.filter((o) => isActive(o.status));
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
            <select value={city} onChange={(e) => setCity(e.target.value)} className="h-10 rounded-full border border-grey-800/15 px-3 text-sm" aria-label="City">
              {[...new Set(sellers.map((s) => s.cityId))].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <OpsMap city={city} sellers={sellers} riders={riders} orders={live} />
          <p className="mt-2 text-xs text-grey-600">Schematic map from coordinates. The real console uses MapLibre with a free vector-tile host, not the public OpenStreetMap tile servers.</p>
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
  const rs = riders.filter((r) => r.cityId === city);
  const os = orders.filter((o) => shops.some((s) => s.id === o.seller.id));
  const pts = [...shops, ...rs, ...os.map((o) => o.drop)].filter(Boolean);
  const bounds = useMemo(() => {
    if (!pts.length) return null;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const pad = 0.004;
    return { minLat: Math.min(...lats) - pad, maxLat: Math.max(...lats) + pad, minLng: Math.min(...lngs) - pad, maxLng: Math.max(...lngs) + pad };
  }, [pts]);
  if (!bounds) return <div className="mt-3 h-80 rounded-2xl bg-grey-50" />;
  const W = 600, H = 360;
  const x = (lng) => ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * W;
  const y = (lat) => H - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full rounded-2xl bg-[#F7F4EE]" role="img" aria-label={`Map of ${city}: ${shops.length} shops, ${rs.length} riders, ${os.length} active orders`}>
      {Array.from({ length: 12 }, (_, i) => <line key={`v${i}`} x1={i * 55} y1="0" x2={i * 55} y2={H} stroke="#E9E2D6" />)}
      {Array.from({ length: 7 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 60} x2={W} y2={i * 60} stroke="#E9E2D6" />)}
      {os.map((o) => (
        <g key={o.id}>
          <line x1={x(o.seller.lng)} y1={y(o.seller.lat)} x2={x(o.drop.lng)} y2={y(o.drop.lat)} stroke="#FF7A00" strokeDasharray="5 5" strokeWidth="2" />
          <circle cx={x(o.drop.lng)} cy={y(o.drop.lat)} r="7" fill="#1F2937" />
          {o.track.riderPos && <circle cx={x(o.track.riderPos.lng)} cy={y(o.track.riderPos.lat)} r="9" fill="#E23744" stroke="#fff" strokeWidth="3" />}
        </g>
      ))}
      {shops.map((s) => (
        <g key={s.id}>
          <rect x={x(s.lng) - 8} y={y(s.lat) - 8} width="16" height="16" rx="4" fill={['active', 'probation'].includes(s.status) ? '#FF7A00' : '#9CA3AF'} />
          <text x={x(s.lng) + 12} y={y(s.lat) + 4} fontSize="11" fontWeight="700" fill="#1F2937">{s.shopName}{s.status !== 'active' ? ` (${s.status})` : ''}</text>
        </g>
      ))}
      {rs.map((r) => <circle key={r.id} cx={x(r.lng)} cy={y(r.lat)} r="5" fill={r.status === 'OFFLINE' ? '#9CA3AF' : '#16A34A'} />)}
      <g transform={`translate(10 ${H - 70})`} fontSize="11" fill="#1F2937">
        <rect width="150" height="62" rx="8" fill="#fff" opacity=".9" />
        <rect x="10" y="10" width="10" height="10" rx="2" fill="#FF7A00" /><text x="26" y="19">Shop</text>
        <circle cx="15" cy="34" r="5" fill="#16A34A" /><text x="26" y="38">Rider (online)</text>
        <circle cx="15" cy="51" r="5" fill="#E23744" /><text x="26" y="55">Rider on an order</text>
      </g>
    </svg>
  );
}

export default LiveOps;
