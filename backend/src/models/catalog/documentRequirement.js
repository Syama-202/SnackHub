// catalog.document_requirements: which documents sellers must or may upload, by business type
// and state (shared/domain/documents.js requirementsFor). Admins edit these rows.
import { requirementTable } from '../verification.js';

export const sellerRequirementModel = requirementTable('business_types');
