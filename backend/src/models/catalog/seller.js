// catalog.sellers: shops, their delivery radius, opening hours, pincodes and verification
// state (doc 12.1, 16.4).
import { scheduleOf, openState, hoursLabel } from '../../../../shared/domain/hours.js';

const TABLE = 'sellers';
// states a customer can order from; draft, pending, suspended and rejected shops stay hidden
export const VISIBLE_STATUSES = ['active', 'probation', 'warned'];

/** Whether the shop is listed at all: approved, not paused, documents valid. */
export const isListed = (row) =>
  Boolean(row) && VISIBLE_STATUSES.includes(row.status) && !row.paused && (!row.docs_valid_until || new Date(row.docs_valid_until).toISOString().slice(0, 10) >= new Date().toISOString().slice(0, 10));

const json = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);

/** The shop's week, holidays and pincodes, from its row. */
export const hoursOf = (row) => ({
  schedule: scheduleOf({ weeklyHours: json(row.weekly_hours), openHours: row.open_hours }),
  weeklyHours: json(row.weekly_hours),
  closedDates: json(row.closed_dates) ?? [],
  pincodes: json(row.pincodes) ?? [],
});

/** Open or closed right now in India time, and when that changes. */
export const shopOpenState = (row, now = Date.now()) => {
  const h = hoursOf(row);
  return openState(h.schedule, h.closedDates, now);
};

/** Whether a customer can order from this shop right now (the same rules as the listings). */
export const isOpenForOrders = (row, now = Date.now()) => isListed(row) && shopOpenState(row, now).open;

/** Why an order cannot go to this shop now, for the customer; null when it can. */
export function closedReason(row, now = Date.now()) {
  if (!isListed(row)) return 'This shop is not taking orders right now';
  const st = shopOpenState(row, now);
  return st.open ? null : `${row.shop_name} is closed now. ${hoursLabel(st, now)}.`;
}

/**
 * Metres along the earth from the row's lat/lng to a point (bindings: lat, lat, lng): the
 * haversine formula on the sphere MySQL's ST_Distance_Sphere used (radius 6,370,986 m).
 */
export const DISTANCE_SQL = '2 * 6370986 * asin(sqrt(power(sin(radians(lat - ?) / 2), 2) + cos(radians(?)) * cos(radians(lat)) * power(sin(radians(lng - ?) / 2), 2)))';

export const sellerModel = {
  findById: (db, id) => db(TABLE).where({ id }).first(),
  findByUser: (db, userId) => db(TABLE).where({ user_id: userId }).first(),
  /**
   * Shops that can reach a point (doc 12.1, query 2): a bounding box on the lat/lng index
   * first, then the exact great-circle distance (haversine, on the same sphere MySQL's
   * ST_Distance_Sphere used, radius 6,370,986 m); the tests check it with two known cities.
   */
  listServiceable: (db, { lat, lng, maxKm }) => {
    const dLat = maxKm / 111;
    const dLng = maxKm / (111 * Math.cos((lat * Math.PI) / 180));
    // the distance is worked out in an inner query, so the outer one can filter and sort on it
    const near = db
      .select('*', db.raw(`${DISTANCE_SQL} AS distance_m`, [lat, lat, lng]))
      .from(TABLE)
      .whereIn('status', VISIBLE_STATUSES)
      .andWhere('paused', false)
      // a shop whose required licence has expired drops out until the renewal is approved
      .andWhere((q) => q.whereNull('docs_valid_until').orWhere('docs_valid_until', '>=', new Date().toISOString().slice(0, 10)))
      .whereBetween('lat', [lat - dLat, lat + dLat])
      .whereBetween('lng', [lng - dLng, lng + dLng])
      .as('near');
    return db.select('*').from(near).whereRaw('distance_m <= LEAST(radius_km * 1000, ?)', [maxKm * 1000]).orderBy('distance_m');
  },
  /**
   * The public shop row from a submitted application's business details: hidden from
   * customers (pending) until a reviewer approves it. A resubmission updates the same row.
   * licence_no keeps only the last four digits of the FSSAI number, for display.
   */
  upsertFromBusiness: async (db, userId, b, { region = null, licenceLast4 = null, licenceExpiresOn = null } = {}) => {
    const row = { shop_name: b.shopName, kind: b.kind ?? 'shop', city: b.city, region, lat: b.lat, lng: b.lng, radius_km: b.radiusKm, open_hours: b.openHours, licence_no: licenceLast4 ? `••••${licenceLast4}` : null, licence_expires_on: licenceExpiresOn };
    const existing = await db(TABLE).where({ user_id: userId }).first('id', 'status');
    if (existing) {
      await db(TABLE).where({ id: existing.id }).update({ ...row, status: ['active', 'probation', 'warned'].includes(existing.status) ? existing.status : 'pending' });
      return existing.id;
    }
    const [{ id }] = await db(TABLE).insert({ user_id: userId, ...row, status: 'pending' }).returning('id');
    return id;
  },
  setDocsValidUntil: (db, id, date) => db(TABLE).where({ id }).update({ docs_valid_until: date }),
  setStatus: (db, id, status) => db(TABLE).where({ id }).update({ status }),
  markVerified: (db, id, status) => db(TABLE).where({ id }).update({ status, verified_at: new Date() }),
  setPaused: (db, id, paused) => db(TABLE).where({ id }).update({ paused }),
  setBusyExtra: (db, id, minutes) => db(TABLE).where({ id }).update({ busy_extra_min: minutes }),
  /** Weekly hours (null: back to the daily window), holidays and pincodes; only the keys given. */
  setHoursAndArea: (db, id, { weeklyHours, closedDates, pincodes }) => {
    const set = {};
    if (weeklyHours !== undefined) set.weekly_hours = weeklyHours === null ? null : JSON.stringify(weeklyHours);
    if (closedDates !== undefined) set.closed_dates = JSON.stringify([...new Set(closedDates)].sort());
    if (pincodes !== undefined) set.pincodes = pincodes.length ? JSON.stringify([...new Set(pincodes)].sort()) : null;
    return Object.keys(set).length ? db(TABLE).where({ id }).update(set) : Promise.resolve(0);
  },
  listByIds: (db, ids) => (ids.length ? db(TABLE).whereIn('id', ids) : Promise.resolve([])),
};
