// What approved sellers and riders do, behind the eligibility check: signing in proves who
// someone is, this decides whether they may trade or deliver right now.
//   GET  /seller/products               the shop's own menu (any seller, even before approval)
//   POST /seller/products/:id/publish   show a product to customers (approved, valid documents)
//   POST /seller/products/:id/unpublish hide it (always allowed)
//   POST /rider/availability            ONLINE needs an approved rider with valid documents;
//                                       OFFLINE is always allowed. BUSY is set by dispatch only.
import { AppError } from '../utils/AppError.js';
import { loadApplicant, eligibilityOf } from '../utils/applicants.js';
import { productModel } from '../models/catalog/product.js';
import { sellerModel } from '../models/catalog/seller.js';
import { riderModel } from '../models/dispatch/rider.js';
import { auditLogModel } from '../models/identity/auditLog.js';

const refuse = (verdict) => new AppError(403, 'NOT_ELIGIBLE', verdict.reasons[0]?.message ?? 'Not allowed yet', { reasons: verdict.reasons });

export function workController({ dbs }) {
  async function ownShop(userId) {
    const shop = await sellerModel.findByUser(dbs.catalog, userId);
    if (!shop) throw new AppError(404, 'NO_SHOP', 'Submit your seller application first');
    return shop;
  }

  async function products(req, res) {
    const shop = await ownShop(req.user.userId);
    const list = await productModel.listBySeller(dbs.catalog, shop.id, { activeOnly: false });
    res.json(list.map((p) => ({ id: p.id, title: p.title, pricePaise: p.price_paise, active: Boolean(p.active) })));
  }

  const setPublished = (active) => async (req, res) => {
    const userId = req.user.userId;
    const shop = await ownShop(userId);
    if (active) {
      const verdict = eligibilityOf('seller', await loadApplicant(dbs, 'seller', userId));
      if (!verdict.ok) throw refuse(verdict);
    }
    // the product id is only accepted together with the caller's own shop id
    const product = await productModel.findById(dbs.catalog, req.params.id);
    if (!product || product.seller_id !== shop.id) throw new AppError(404, 'NOT_FOUND', 'No such product in your shop');
    await productModel.updateForSeller(dbs.catalog, product.id, shop.id, { active });
    await auditLogModel.append(dbs.identity, { actorId: userId, action: active ? 'product.publish' : 'product.unpublish', target: `product:${product.id}` });
    res.json({ id: product.id, active });
  };

  async function availability(req, res) {
    const userId = req.user.userId;
    const rider = await riderModel.findByUser(dbs.dispatch, userId);
    if (!rider) throw new AppError(403, 'NOT_ELIGIBLE', 'Your rider application has not been approved yet', { reasons: [{ code: 'NOT_APPROVED', message: 'Your rider application has not been approved yet' }] });
    if (req.body.status === 'ONLINE') {
      const verdict = eligibilityOf('rider', await loadApplicant(dbs, 'rider', userId));
      // being online never overrides a missing or expired licence or insurance
      if (!verdict.ok) throw refuse(verdict);
    }
    if (rider.status === 'BUSY' && req.body.status === 'OFFLINE') throw new AppError(409, 'ON_A_DELIVERY', 'Finish the delivery you are on before going offline');
    await riderModel.setStatus(dbs.dispatch, rider.id, req.body.status);
    await auditLogModel.append(dbs.identity, { actorId: userId, action: 'rider.availability', target: `rider:${rider.id}`, before: { status: rider.status }, after: { status: req.body.status } });
    res.json({ status: req.body.status });
  }

  return { products, publish: setPublished(true), unpublish: setPublished(false), availability };
}
