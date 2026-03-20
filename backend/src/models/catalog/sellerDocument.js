// catalog.seller_documents: each upload is a new version of one document type, with its file
// in private storage (only the random key is here), the number encrypted, and its own review.
import { documentTable } from '../verification.js';

export const sellerDocumentModel = documentTable('seller_documents');
