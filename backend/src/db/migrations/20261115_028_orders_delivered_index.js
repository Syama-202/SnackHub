// The operations board asks three things about delivered orders every few seconds: how many
// were delivered today, the last seven days of delivery times, and the newest pay-on-delivery
// orders for the cash check. Each filters or sorts on delivered_at. The existing index on
// (status, placed_at) only narrows them to "every order ever delivered", which grows for ever;
// this one lets each read just the days it needs.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, ['ALTER TABLE ordering.orders ADD KEY ix_status_delivered (status, delivered_at)']);
}

export async function down(knex) {
  await runAll(knex, ['ALTER TABLE ordering.orders DROP KEY ix_status_delivered']);
}
