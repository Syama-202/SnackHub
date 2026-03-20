// Delivering emails and texts from the outbox (jobs/outboxRelay.js):
// - dedupe_key: a retried request or a job that runs twice cannot queue the same message
//   twice (for example "application 12 approved" or "licence expires in 7 days")
// - available_at: a failed send waits longer after each try instead of hammering the provider
import { runAll } from '../ddl.js';

const SCHEMAS = ['identity', 'catalog', 'dispatch'];

export async function up(knex) {
  await runAll(
    knex,
    SCHEMAS.map(
      (s) => `ALTER TABLE ${s}.outbox
        ADD COLUMN dedupe_key VARCHAR(120) NULL AFTER type,
        ADD COLUMN available_at DATETIME(3) NULL AFTER published_at,
        ADD UNIQUE KEY uq_dedupe (dedupe_key),
        ADD KEY ix_type_unpub (type, published_at, id)`,
    ),
  );
}

export async function down(knex) {
  await runAll(knex, SCHEMAS.map((s) => `ALTER TABLE ${s}.outbox DROP KEY ix_type_unpub, DROP KEY uq_dedupe, DROP COLUMN available_at, DROP COLUMN dedupe_key`));
}
