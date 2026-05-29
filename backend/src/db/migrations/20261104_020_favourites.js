// Favourites (doc 11.1): snacks a customer saved, kept on the account so they follow the
// person across devices. A product id from the catalog module, checked by the API (no
// foreign key across modules).
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE ordering.favourites (
      customer_id BIGINT UNSIGNED NOT NULL,
      product_id BIGINT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (customer_id, product_id),
      KEY ix_product (product_id)
    ) ENGINE=InnoDB`,
  ]);
}

export async function down(knex) {
  await runAll(knex, ['DROP TABLE IF EXISTS ordering.favourites']);
}
