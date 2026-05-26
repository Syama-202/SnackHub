// Opening hours and delivery pincodes (doc 12.1):
// - sellers.weekly_hours: up to two windows a day in India time (shared/domain/hours.js);
//   NULL falls back to open_hours ('HH:MM-HH:MM' every day), and both NULL means always open
// - sellers.closed_dates: holidays ('YYYY-MM-DD'), up to 30
// - sellers.pincodes: the pincodes a shop delivers to, on top of its radius; NULL or empty
//   means distance alone decides
// - addresses.pincode: the six-digit Indian pincode of a saved address
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `ALTER TABLE catalog.sellers
      ADD COLUMN weekly_hours JSON NULL AFTER open_hours,
      ADD COLUMN closed_dates JSON NULL AFTER weekly_hours,
      ADD COLUMN pincodes JSON NULL AFTER closed_dates,
      ADD CONSTRAINT ck_sellers_pincodes CHECK (pincodes IS NULL OR JSON_TYPE(pincodes) = 'ARRAY'),
      ADD CONSTRAINT ck_sellers_closed CHECK (closed_dates IS NULL OR JSON_TYPE(closed_dates) = 'ARRAY'),
      ADD CONSTRAINT ck_sellers_hours CHECK (weekly_hours IS NULL OR JSON_TYPE(weekly_hours) = 'OBJECT')`,
    `ALTER TABLE identity.addresses
      ADD COLUMN pincode CHAR(6) NULL AFTER line,
      ADD CONSTRAINT ck_addresses_pincode CHECK (pincode IS NULL OR pincode REGEXP '^[1-9][0-9]{5}$')`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    'ALTER TABLE identity.addresses DROP CHECK ck_addresses_pincode, DROP COLUMN pincode',
    `ALTER TABLE catalog.sellers DROP CHECK ck_sellers_hours, DROP CHECK ck_sellers_closed, DROP CHECK ck_sellers_pincodes,
      DROP COLUMN pincodes, DROP COLUMN closed_dates, DROP COLUMN weekly_hours`,
  ]);
}
