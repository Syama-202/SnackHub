// catalog.sellers: shops, their delivery radius and verification state (doc 12.1, 16.4).
const TABLE = 'sellers';
// states a customer can order from; draft, pending, suspended and rejected shops stay hidden
export const VISIBLE_STATUSES = ['active', 'probation', 'warned'];

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
      .whereBetween('lat', [lat - dLat, lat + dLat])
      .whereBetween('lng', [lng - dLng, lng + dLng])
      .havingRaw('distance_m <= LEAST(radius_km * 1000, ?)', [maxKm * 1000])
      .orderBy('distance_m');
  },
  setStatus: (db, id, status) => db(TABLE).where({ id }).update({ status }),
  setPaused: (db, id, paused) => db(TABLE).where({ id }).update({ paused }),
  setBusyExtra: (db, id, minutes) => db(TABLE).where({ id }).update({ busy_extra_min: minutes }),
};
