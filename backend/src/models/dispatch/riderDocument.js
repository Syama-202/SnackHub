// dispatch.rider_documents: identity, licence and vehicle documents, versioned, each with its
// own review; files live in private storage under a random key.
import { documentTable } from '../verification.js';

export const riderDocumentModel = documentTable('rider_documents');
