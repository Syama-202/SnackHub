// The customer's saved delivery addresses (doc 11.1). Every query is scoped to the account in
// the token, so nobody reads, changes or deletes another person's address.
//   GET    /me/addresses           the list, default first
//   POST   /me/addresses           add one (the first is the default)
//   PATCH  /me/addresses/:id       change any fields, or { isDefault: true }
//   DELETE /me/addresses/:id       remove one (the oldest left becomes the default)
//   POST   /me/places/search       { q } -> up to five places in India, for the map pin
//   POST   /me/places/reverse      { lat, lng } -> a street line for a pin
// Orders keep their own copy of the address, so edits and deletes never change an order.
import { AppError } from '../utils/AppError.js';
import { addressModel } from '../models/identity/address.js';
import { KIND_LABEL } from '../../../shared/domain/addresses.js';

export const MAX_ADDRESSES = 10;

export const viewAddress = (a) => ({
  id: a.id,
  kind: a.kind,
  label: a.label,
  line: a.line,
  pincode: a.pincode,
  house: a.house,
  floor: a.floor,
  landmark: a.landmark,
  instructions: a.instructions,
  cityId: a.city,
  lat: Number(a.lat),
  lng: Number(a.lng),
  isDefault: Boolean(a.is_default),
});

// the body's names to the table's; a missing label takes the kind's name
const fieldsOf = (b) => ({
  kind: b.kind,
  label: b.label ?? (b.kind && b.kind !== 'OTHER' ? KIND_LABEL[b.kind] : undefined),
  line: b.line,
  pincode: b.pincode,
  house: b.house,
  floor: b.floor,
  landmark: b.landmark,
  instructions: b.instructions,
  city: b.cityId,
  lat: b.lat,
  lng: b.lng,
});

export function addressesController({ dbs, geocoder }) {
  async function list(req, res) {
    res.json((await addressModel.listByUser(dbs.identity, req.user.userId)).map(viewAddress));
  }

  async function create(req, res) {
    const userId = req.user.userId;
    const id = await addressModel.create(dbs.identity, userId, fieldsOf(req.body), { max: MAX_ADDRESSES, makeItDefault: req.body.isDefault === true });
    if (!id) throw new AppError(409, 'TOO_MANY_ADDRESSES', `Keep up to ${MAX_ADDRESSES} addresses; delete one first`);
    res.status(201).json(viewAddress(await addressModel.findForUser(dbs.identity, id, userId)));
  }

  async function update(req, res) {
    const userId = req.user.userId;
    const ok = await addressModel.update(dbs.identity, req.params.id, userId, fieldsOf(req.body), { makeItDefault: req.body.isDefault === true });
    if (!ok) throw new AppError(404, 'NOT_FOUND', 'Address not found');
    res.json((await addressModel.listByUser(dbs.identity, userId)).map(viewAddress));
  }

  async function remove(req, res) {
    const n = await addressModel.removeForUser(dbs.identity, req.params.id, req.user.userId);
    if (!n) throw new AppError(404, 'NOT_FOUND', 'Address not found');
    res.json({ deleted: true });
  }

  async function search(req, res) {
    res.set('Cache-Control', 'no-store').json(await geocoder.search(req.body.q));
  }

  async function reverse(req, res) {
    res.set('Cache-Control', 'no-store').json(await geocoder.reverse(req.body));
  }

  return { list, create, update, remove, search, reverse };
}
