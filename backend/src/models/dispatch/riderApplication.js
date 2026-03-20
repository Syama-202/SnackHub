// dispatch.rider_applications: a person's request to deliver, from DRAFT to a decision, with
// the reviewer's checks and the reason for every decision (shared/domain/verification.js). A
// rider row in dispatch.riders exists only once an application has been approved.
import { applicationTable } from '../verification.js';

const TABLE = 'rider_applications';

export const riderApplicationModel = applicationTable(TABLE);
