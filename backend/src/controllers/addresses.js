// The customer's saved delivery addresses (doc 11.1). Every query is scoped to the account in
// the token, so nobody reads or deletes another person's address.
//   GET    /me/addresses       the list
//   POST   /me/addresses       add one { label, line, cityId, lat, lng }
//   DELETE /me/addresses/:id   remove one
import { AppError } from '../utils/AppError.js';
import { addressModel } from '../models/identity/address.js';

export const MAX_ADDRESSES = 10;

const view = (a) => ({ id: a.id, label: a.label, line: a.line, cityId: a.city, lat: Number(a.lat), lng: Number(a.lng) });

export function addressesController({ dbs }) {
  async function list(req, res) {
    res.json((await addressModel.listByUser(dbs.identity, req.user.userId)).map(view));
  }

  async function create(req, res) {
    const userId = req.user.userId;
    if ((await addressModel.listByUser(dbs.identity, userId)).length >= MAX_ADDRESSES) throw new AppError(409, 'TOO_MANY_ADDRESSES', `Keep up to ${MAX_ADDRESSES} addresses; delete one first`);
    const { label, line, cityId, lat, lng } = req.body;
    const id = await addressModel.create(dbs.identity, userId, { label, line, city: cityId ?? null, lat, lng });
    res.status(201).json(view(await addressModel.findForUser(dbs.identity, id, userId)));
  }

  async function remove(req, res) {
    const n = await addressModel.removeForUser(dbs.identity, req.params.id, req.user.userId);
    if (!n) throw new AppError(404, 'NOT_FOUND', 'Address not found');
    res.json({ deleted: true });
  }

  return { list, create, remove };
}
