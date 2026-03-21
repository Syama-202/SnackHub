// catalog.sellers: shops, their delivery radius and verification state (doc 12.1, 16.4).
const TABLE = 'sellers';
// states a customer can order from; draft, pending, suspended and rejected shops stay hidden
export const VISIBLE_STATUSES = ['active', 'probation', 'warned'];

/** Whether a customer can order from this shop right now (the same rules as the listings). */
export const isOpenForOrders = (row) =>
  Boolean(row) && VISIBLE_STATUSES.includes(row.status) && !row.paused && (!row.docs_valid_until || new Date(row.docs_valid_until).toISOString().slice(0, 10) >= new Date().toISOString().slice(0, 10));

export const sellerModel = {
  findById: (db, id) => db(TABLE).where({ id }).first(),
  findByUser: (db, userId) => db(TABLE).where({ user_id: userId }).first(),
  /**
   * Shops that can reach a point (doc 12.1, query 2): a bounding box on the lat/lng index
   * first, then the exact distance. POINT takes (lng, lat), the axis order
   * ST_Distance_Sphere expects; the tests check it with two known cities.
   */
  listServiceable: (db, { lat, lng, maxKm }) => {
    const dLat = maxKm / 111;
    const dLng = maxKm / (111 * Math.cos((lat * Math.PI) / 180));
    return db
      .select('*', db.raw('ST_Distance_Sphere(POINT(lng, lat), POINT(?, ?)) AS distance_m', [lng, lat]))
      .from(TABLE)
      .whereIn('status', VISIBLE_STATUSES)
      .andWhere('paused', false)
      // a shop whose required licence has expired drops out until the renewal is approved
      .andWhere((q) => q.whereNull('docs_valid_until').orWhere('docs_valid_until', '>=', new Date().toISOString().slice(0, 10)))
      .whereBetween('lat', [lat - dLat, lat + dLat])
      .whereBetween('lng', [lng - dLng, lng + dLng])
      .havingRaw('distance_m <= LEAST(radius_km * 1000, ?)', [maxKm * 1000])
      .orderBy('distance_m');
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
    const [id] = await db(TABLE).insert({ user_id: userId, ...row, status: 'pending' });
    return id;
  },
  setDocsValidUntil: (db, id, date) => db(TABLE).where({ id }).update({ docs_valid_until: date }),
  setStatus: (db, id, status) => db(TABLE).where({ id }).update({ status }),
  markVerified: (db, id, status) => db(TABLE).where({ id }).update({ status, verified_at: new Date() }),
  setPaused: (db, id, paused) => db(TABLE).where({ id }).update({ paused }),
  setBusyExtra: (db, id, minutes) => db(TABLE).where({ id }).update({ busy_extra_min: minutes }),
  listByIds: (db, ids) => (ids.length ? db(TABLE).whereIn('id', ids) : Promise.resolve([])),
};
