// Failed refunds an admin has dealt with (doc 10.9): a refund PhonePe refused stays FAILED as
// the record of what happened; when an admin sends it again, the new refund's id is kept on
// the failed one, so the admin queue shows only refunds nobody has picked up yet.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `ALTER TABLE payment.refunds
      ADD COLUMN retried_by BIGINT UNSIGNED NULL AFTER failure_code,
      ADD KEY ix_status_retried (status, retried_by)`,
  ]);
}

export async function down(knex) {
  await runAll(knex, ['ALTER TABLE payment.refunds DROP KEY ix_status_retried, DROP COLUMN retried_by']);
}
