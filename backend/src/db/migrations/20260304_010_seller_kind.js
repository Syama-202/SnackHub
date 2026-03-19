// What kind of seller a shop is (doc 11.2, 16.4: home and small sellers): a shop, a street
// stall (a cart, bandi or kadai) or a home kitchen. Customers see it as a badge and filter.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [`ALTER TABLE catalog.sellers ADD COLUMN kind ENUM('shop','stall','home') NOT NULL DEFAULT 'shop' AFTER shop_name`]);
}

export async function down(knex) {
  await runAll(knex, ['ALTER TABLE catalog.sellers DROP COLUMN kind']);
}
