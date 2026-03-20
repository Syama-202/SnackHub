// dispatch.document_requirements: which documents riders must or may upload, by delivery mode
// and state. A bicycle rider is never asked for a licence, RC, insurance or PUC.
import { requirementTable } from '../verification.js';

export const riderRequirementModel = requirementTable('vehicle_types');
