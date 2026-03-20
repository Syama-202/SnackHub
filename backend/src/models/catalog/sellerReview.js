// catalog.seller_reviews: the append-only history of a seller application: submissions,
// document reviews and decisions, with who, from which status to which, and why.
import { reviewTable } from '../verification.js';

export const sellerReviewModel = reviewTable('seller_reviews');
