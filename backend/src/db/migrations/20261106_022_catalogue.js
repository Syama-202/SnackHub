// The shared product catalogue: one entry per snack that any shop can sell at its own price
// (shared/domain/catalogue.js). A menu row points at its entry; a shop lists each entry once.
// Rows with no entry are a shop's own recipes. The demo shops' snacks are grouped by slug
// into entries here; real shops' products stay their own until an admin links them.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE catalog.catalog_items (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(120) NOT NULL,
      title VARCHAR(160) NOT NULL,
      description VARCHAR(500) NULL,
      category ENUM('sweet','fried','baked','namkeen') NOT NULL,
      serving_temp ENUM('HOT','AMBIENT') NOT NULL,
      attrs JSON NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_slug (slug),
      KEY ix_active_title (active, title)
    ) ENGINE=InnoDB`,
    `ALTER TABLE catalog.products
      ADD COLUMN catalog_item_id BIGINT UNSIGNED NULL AFTER seller_id,
      ADD UNIQUE KEY uq_seller_item (seller_id, catalog_item_id),
      ADD KEY ix_item (catalog_item_id),
      ADD CONSTRAINT fk_products_item FOREIGN KEY (catalog_item_id) REFERENCES catalog.catalog_items(id)`,
    // one entry per demo snack, its details from the first shop that sells it; numbered in the
    // order the seed numbers them, so a later `npm run seed` upserts the same rows
    `INSERT INTO catalog.catalog_items (slug, title, category, serving_temp, attrs)
      SELECT p.slug, p.title, p.category, p.serving_temp,
        JSON_OBJECT('weight', p.attrs->>'$.weight', 'spice', CAST(p.attrs->>'$.spice' AS UNSIGNED), 'vegetarian', p.attrs->'$.vegetarian',
          'allergens', p.attrs->'$.allergens', 'tags', p.attrs->'$.tags', 'collections', p.attrs->'$.collections', 'art', p.attrs->'$.art')
      FROM catalog.products p
      JOIN (SELECT MIN(p2.id) AS id FROM catalog.products p2 JOIN catalog.sellers s ON s.id = p2.seller_id WHERE s.is_demo GROUP BY p2.slug) f ON f.id = p.id
      ORDER BY p.id`,
    `UPDATE catalog.products p
      JOIN catalog.sellers s ON s.id = p.seller_id AND s.is_demo
      JOIN catalog.catalog_items i ON i.slug = p.slug
      SET p.catalog_item_id = i.id`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    'ALTER TABLE catalog.products DROP FOREIGN KEY fk_products_item, DROP INDEX uq_seller_item, DROP INDEX ix_item, DROP COLUMN catalog_item_id',
    'DROP TABLE IF EXISTS catalog.catalog_items',
  ]);
}
