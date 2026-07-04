// Admin operations (doc 11.4, 8.4a): the live board, the SLA numbers, cash reconciliation,
// rider pay disputes and the versioned delivery policy. Admin only, on the admin host, with a
// second factor in the last 8 hours; changing money or the policy needs one in the last 5.
//   GET  /admin/metrics/sla              today's numbers
//   GET  /admin/orders                   the latest orders with the server's tracking
//   GET  /admin/riders, /admin/sellers   who is where (for the live map)
//   GET  /admin/reconciliation           pay-on-delivery cash against the order totals
//   GET  /admin/earnings                 rider pay rows, disputed ones first
//   POST /admin/earnings/:id/resolve     give a lateness cut back or keep it (fresh code)
//   GET  /admin/policy, PUT /admin/policy  the current version, history, and a new version
import { cashInHand, cashLimitOf, recordDeposit, reverseDeposit } from '../utils/cash.js';
import { AppError } from '../utils/AppError.js';
import { currentPolicy, inbox, policyOf, trackState, viewOrders } from '../utils/orders.js';
import { realtime } from '../utils/realtime.js';
import { WITH_RIDER } from '../models/ordering/order.js';
import { sellerModel } from '../models/catalog/seller.js';
import { riderModel } from '../models/dispatch/rider.js';
import { auditLogModel } from '../models/identity/auditLog.js';
import { CITIES } from '../../../shared/domain/cities.js';
import { DEFAULT_POLICY } from '../../../shared/domain/policy.js';
import { riderSilent } from '../../../shared/domain/riderSilence.js';

const ms = (d) => (d ? new Date(d).getTime() : null);
const cityId = (name) => CITIES.find((c) => c.name.toLowerCase() === String(name).toLowerCase())?.id ?? String(name).toLowerCase();
const startOfDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// an order that has not finished: waiting for payment, or anywhere from placed to the door
const OPEN_STATES = ['PENDING_PAYMENT', 'PLACED', ...WITH_RIDER];
// the most shops or riders the operations map draws at once
const MAP_MAX = 2000;

export function operationsController({ dbs }) {
  async function sla(req, res) {
    const db = dbs.ordering;
    const since = new Date(Date.now() - 7 * 86_400_000);
    const delivered = await db('orders').where({ status: 'DELIVERED' }).andWhere('delivered_at', '>=', since).select('placed_at', 'promised_at', 'delivered_at');
    const onTime = delivered.filter((o) => new Date(o.delivered_at) <= new Date(o.promised_at)).length;
    const mins = delivered.map((o) => (new Date(o.delivered_at) - new Date(o.placed_at)) / 60_000).sort((a, b) => a - b);
    const [[active], [today], [online], [complaints], [mismatches]] = await Promise.all([
      db('orders').whereIn('status', ['PLACED', ...WITH_RIDER]).count({ n: '*' }),
      db('orders').where({ status: 'DELIVERED' }).andWhere('delivered_at', '>=', startOfDay()).count({ n: '*' }),
      dbs.dispatch('riders').whereIn('status', ['ONLINE', 'BUSY']).where({ is_demo: false }).count({ n: '*' }),
      db('complaints').where({ status: 'IN_REVIEW' }).count({ n: '*' }),
      // within the window the board reports, so the count does not read every delivery ever made
      db('orders').where({ payment_mode: 'COD', status: 'DELIVERED' }).andWhere('delivered_at', '>=', since).whereRaw('collected_paise <> total_paise').count({ n: '*' }),
    ]);
    res.json({
      activeOrders: Number(active.n),
      deliveredToday: Number(today.n),
      onTimeRate: delivered.length ? onTime / delivered.length : 1,
      p90DeliveryMin: mins.length ? Math.round(mins[Math.floor(0.9 * (mins.length - 1))] * 10) / 10 : 0,
      lateOrders: delivered.length - onTime,
      ridersOnline: Number(online.n),
      openComplaints: Number(complaints.n),
      cashMismatches: Number(mismatches.n),
      window: 'last 7 days',
    });
  }

  async function orders(req, res) {
    const { q, status } = req.query;
    const size = req.query.limit ?? 60;
    const table = () => dbs.ordering('orders');
    let rows;
    if (q || status) {
      // a search: by order number (the primary key), by shop (ix_seller) or by status (ix_status)
      const query = table().orderBy('id', 'desc').limit(size);
      if (status) query.where({ status });
      if (q) {
        // an order number, or part of a shop's name (LIKE wildcards in the text are escaped)
        const number = /^#?(\d{1,15})$/.exec(q)?.[1];
        if (number) query.where({ id: Number(number) });
        else query.whereIn('seller_id', await dbs.catalog('sellers').where('shop_name', 'like', `%${q.replace(/[\\%_]/g, '\\$&')}%`).limit(200).pluck('id'));
      }
      rows = await query;
    } else {
      // The live board: orders still in progress first, so a busy day never pushes one off the
      // list, then the newest finished ones. Two queries that each follow an index (ix_status,
      // then the primary key); one query sorted on "is it open" would read every order.
      rows = await table().whereIn('status', OPEN_STATES).orderBy('placed_at', 'desc').orderBy('id', 'desc').limit(size);
      if (rows.length < size) rows = rows.concat(await table().whereNotIn('status', OPEN_STATES).orderBy('id', 'desc').limit(size - rows.length));
    }
    const views = await viewOrders(dbs, rows, 'admin');
    const sellers = new Map((await sellerModel.listByIds(dbs.catalog, [...new Set(rows.map((o) => o.seller_id))])).map((s) => [s.id, s]));
    const riders = new Map((await riderModel.listByIds(dbs.dispatch, [...new Set(rows.map((o) => o.rider_id).filter(Boolean))])).map((r) => [r.id, r]));
    // emergencies the riders raised on these orders, from the audit log
    const sos = new Set((await dbs.identity('audit_log').where({ action: 'delivery.emergency' }).whereIn('target', rows.map((o) => `order:${o.id}`)).pluck('target')).map((t) => Number(t.split(':')[1])));
    const out = [];
    for (const [i, o] of rows.entries()) {
      const policy = await policyOf(dbs, o);
      out.push({
        ...views[i],
        addressText: o.address_text,
        track: trackState(o, { seller: sellers.get(o.seller_id), rider: riders.get(o.rider_id), policy }),
        emergency: sos.has(o.id) ? { orderId: o.id } : null,
        // the rider holding this order has sent no position for several minutes
        riderSilent: riderSilent({ status: o.status, hasRider: Boolean(o.rider_id), lastSeenAt: riders.get(o.rider_id)?.last_seen_at ? new Date(riders.get(o.rider_id).last_seen_at).getTime() : null }),
        cashMismatch: o.payment_mode === 'COD' && o.collected_paise != null && o.collected_paise !== o.total_paise,
        collectedPaise: o.collected_paise,
      });
    }
    res.json(out);
  }

  async function riders(req, res) {
    // only riders with a position go on the map; the filter runs in MySQL and the list is capped
    const rows = await dbs.dispatch('riders').whereNotNull('last_lat').orderBy('id').limit(MAP_MAX);
    res.json(rows.map((r) => ({ id: r.id, name: r.name, cityId: cityId(r.city), vehicle: r.vehicle, status: r.status, lat: Number(r.last_lat), lng: r.last_lng == null ? null : Number(r.last_lng), lastSeenAt: ms(r.last_seen_at), demo: Boolean(r.is_demo) })));
  }

  async function sellers(req, res) {
    const rows = await dbs.catalog('sellers').orderBy('id').limit(MAP_MAX);
    res.json(rows.map((s) => ({ id: s.id, shopName: s.shop_name, cityId: cityId(s.city), lat: Number(s.lat), lng: Number(s.lng), status: s.status, paused: Boolean(s.paused), qualityScore: s.quality_score == null ? null : Number(s.quality_score), demo: Boolean(s.is_demo) })));
  }

  async function reconciliation(req, res) {
    const rows = await dbs.ordering('orders').where({ payment_mode: 'COD', status: 'DELIVERED' }).orderBy('delivered_at', 'desc').orderBy('id', 'desc').limit(req.query.limit ?? 100);
    res.json(rows.map((o) => ({ orderId: o.id, riderId: o.rider_id, totalPaise: o.total_paise, collectedPaise: o.collected_paise, mismatch: o.collected_paise !== o.total_paise, deliveredAt: ms(o.delivered_at) })));
  }

  // ---------- rider pay disputes
  const earningView = (e) => ({
    id: e.id,
    orderId: e.order_id,
    riderId: e.rider_id,
    basePaise: e.base_paise,
    distancePaise: e.distance_paise,
    bonusPaise: e.bonus_paise,
    penaltyPaise: e.penalty_paise,
    netPaise: e.net_paise,
    lateMin: e.late_min,
    sellerDelayMin: e.seller_delay_min,
    status: e.status,
    disputeReason: e.dispute_reason,
    disputedAt: ms(e.disputed_at),
    adjustmentPaise: e.adjustment_paise,
    resolutionReason: e.resolution_reason,
    createdAt: ms(e.created_at),
  });

  async function earnings(req, res) {
    const rows = await dbs.dispatch('rider_earnings').orderByRaw("status = 'DISPUTED' DESC").orderBy('created_at', 'desc').orderBy('id', 'desc').limit(req.query.limit ?? 100);
    res.json(rows.map(earningView));
  }

  async function resolveEarning(req, res) {
    const staffId = req.user.userId;
    const { reverse, reason } = req.body;
    const e = await dbs.dispatch('rider_earnings').where({ id: req.params.id }).first();
    if (!e) throw new AppError(404, 'NOT_FOUND', 'Pay row not found');
    // giving the cut back raises the pay by exactly the cut; keeping it closes the dispute
    const n = await dbs.dispatch('rider_earnings')
      .where({ id: e.id, status: 'DISPUTED' })
      .update(reverse ? { status: 'ADJUSTED', adjustment_paise: e.penalty_paise, net_paise: e.net_paise + e.penalty_paise, resolution_reason: reason, resolved_by: staffId } : { status: 'OK', resolution_reason: reason, resolved_by: staffId });
    if (!n) throw new AppError(409, 'NOT_DISPUTED', 'Only a disputed pay row can be resolved');
    const rider = await riderModel.findById(dbs.dispatch, e.rider_id);
    if (rider) await dbs.ordering.transaction((trx) => inbox(trx, { userId: rider.user_id, orderId: e.order_id, type: 'delivery.dispute_resolved', body: reverse ? `Your dispute on order #${e.order_id} was upheld: the lateness cut was given back. ${reason}` : `Your dispute on order #${e.order_id} was reviewed and the cut stands. ${reason}` }));
    await auditLogModel.append(dbs.identity, { actorId: staffId, action: 'earning.resolve', target: `earning:${e.id}`, before: { status: 'DISPUTED' }, after: { reverse, reason } });
    realtime.publish([{ userId: rider?.user_id, role: 'rider' }, 'complaints'], 'earning', { orderId: e.order_id });
    res.json(earningView(await dbs.dispatch('rider_earnings').where({ id: e.id }).first()));
  }

  // ---------- the delivery policy: a change is a new version for later orders only
  async function policy(req, res) {
    const { config } = await currentPolicy(dbs);
    const rows = await dbs.ordering('delivery_policy').orderBy('effective_from', 'desc').orderBy('id', 'desc').limit(20);
    res.json({
      current: config,
      history: rows.map((r) => ({ version: (typeof r.config === 'string' ? JSON.parse(r.config) : r.config).version, effectiveFrom: new Date(r.effective_from).toISOString(), changedBy: r.changed_by ? `staff #${r.changed_by}` : 'seed' })),
    });
  }

  async function savePolicy(req, res) {
    const staffId = req.user.userId;
    const { config: before } = await currentPolicy(dbs);
    const merged = { ...DEFAULT_POLICY, ...before, ...req.body, hot: { ...before.hot, ...req.body.hot }, ambient: { ...before.ambient, ...req.body.ambient }, version: before.version + 1 };
    if (merged.hot.maxKm > merged.ambient.maxKm) throw new AppError(422, 'POLICY_INVALID', 'Hot snacks cannot travel further than sweet and dry ones');
    if (merged.arrivalGeofenceM >= merged.otpRevealM) throw new AppError(422, 'POLICY_INVALID', 'The arrival geofence must be smaller than the distance at which the code shows');
    // one second in the past, so the new version is the current one at once
    await dbs.ordering('delivery_policy').insert({ effective_from: new Date(Date.now() - 1000), config: JSON.stringify(merged), changed_by: staffId });
    await auditLogModel.append(dbs.identity, { actorId: staffId, action: 'policy.update', target: `policy:v${merged.version}`, before: { version: before.version }, after: { version: merged.version, changes: req.body } });
    res.json((await currentPolicy(dbs)).config);
  }

  // ---------- cash in hand: riders holding pay-on-delivery cash, and the deposits staff record
  async function cash(req, res) {
    const policy = (await currentPolicy(dbs)).config;
    const limitPaise = cashLimitOf(policy);
    const ids = await dbs.ordering('orders').where({ payment_mode: 'COD', status: 'DELIVERED' }).whereNotNull('rider_id').distinct('rider_id').pluck('rider_id');
    const held = await cashInHand(dbs, ids.map(Number));
    const riders = ids.length ? await riderModel.listByIds(dbs.dispatch, ids) : [];
    const recent = await dbs.dispatch('cash_deposits').orderBy('id', 'desc').limit(30);
    res.json({
      limitPaise,
      riders: riders
        .map((r) => ({ riderId: r.id, name: r.name, cityId: cityId(r.city), ...Object.fromEntries(Object.entries(held.get(r.id)).map(([k, v]) => [`${k}Paise`, v])), overLimit: held.get(r.id).held >= limitPaise }))
        .sort((a, b) => b.heldPaise - a.heldPaise),
      recent: recent.map((d) => ({ id: d.id, riderId: d.rider_id, kind: d.kind, amountPaise: d.amount_paise, reversesId: d.reverses_id, note: d.note, at: ms(d.created_at) })),
    });
  }

  async function recordCash(req, res) {
    const staffId = req.user.userId;
    const { riderId, amountPaise, note } = req.body;
    const done = await recordDeposit(dbs, { riderId, amountPaise, note, staffId });
    const rider = await riderModel.findById(dbs.dispatch, riderId);
    await auditLogModel.append(dbs.identity, { actorId: staffId, action: 'cash.deposit', target: `rider:${riderId}`, before: { heldPaise: done.heldBefore }, after: { heldPaise: done.heldAfter, amountPaise, note } });
    if (rider) await dbs.ordering.transaction((trx) => inbox(trx, { userId: rider.user_id, orderId: null, type: `delivery.cash_deposit.${done.id}`, body: `Cash deposit of Rs ${(amountPaise / 100).toFixed(2)} recorded. You now hold Rs ${(done.heldAfter / 100).toFixed(2)}.` }));
    realtime.publish([{ userId: rider?.user_id, role: 'rider' }], 'earning', {});
    res.status(201).json({ id: done.id, heldPaise: done.heldAfter });
  }

  async function reverseCash(req, res) {
    const staffId = req.user.userId;
    const done = await reverseDeposit(dbs, { depositId: req.params.id, staffId, note: req.body.reason });
    await auditLogModel.append(dbs.identity, { actorId: staffId, action: 'cash.reverse', target: `cash_deposit:${done.deposit.id}`, before: { amountPaise: done.deposit.amount_paise }, after: { reversal: done.id, reason: req.body.reason } });
    const rider = await riderModel.findById(dbs.dispatch, done.deposit.rider_id);
    realtime.publish([{ userId: rider?.user_id, role: 'rider' }], 'earning', {});
    res.status(201).json({ id: done.id });
  }

  return { sla, orders, riders, sellers, reconciliation, earnings, resolveEarning, policy, savePolicy, cash, recordCash, reverseCash };
}

