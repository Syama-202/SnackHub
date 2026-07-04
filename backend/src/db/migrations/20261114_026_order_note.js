// A short note from the customer to the shop, written at checkout ("less spicy", "no onion").
// It is part of the order as placed. Where to leave the parcel belongs to the address
// (its instructions), which the rider sees; this note is for the kitchen.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, ['ALTER TABLE ordering.orders ADD COLUMN note VARCHAR(200) NULL AFTER address_detail']);
}

export async function down(knex) {
  await runAll(knex, ['ALTER TABLE ordering.orders DROP COLUMN note']);
}
