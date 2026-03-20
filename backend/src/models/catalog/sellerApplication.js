// catalog.seller_applications: a person's request to sell, from DRAFT to a decision, with the
// reviewer's manual checks and the reason for every decision (shared/domain/verification.js).
// The shop row (seller_id) is made when the application is first submitted.
import { applicationTable } from '../verification.js';

const TABLE = 'seller_applications';

export const sellerApplicationModel = {
  ...applicationTable(TABLE),
  setSeller: (db, id, sellerId) => db(TABLE).where({ id }).update({ seller_id: sellerId }),
};
