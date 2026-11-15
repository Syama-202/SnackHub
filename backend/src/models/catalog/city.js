// catalog.cities: the cities SnackHub serves (a label and a starting point for browsing; an
// address is served only when a shop's own range reaches it). Adding a row adds a city.
const TABLE = 'cities';

const view = (r) => ({ id: r.id, name: r.name, state: r.state, lat: Number(r.lat), lng: Number(r.lng), timezone: r.timezone, radiusKm: Number(r.radius_km) });

export const cityModel = {
  listActive: (db) => db(TABLE).where({ active: true }).orderBy([{ column: 'position' }, { column: 'name' }]).then((rows) => rows.map(view)),
  findById: (db, id) => db(TABLE).where({ id, active: true }).first().then((r) => (r ? view(r) : null)),
};
