// The customer order flow on MySQL (doc 10.1 to 10.8, 11.1 to 11.3):
// - ordering.carts and cart_items: the server cart, one shop per cart (Redis later)
// - orders: the money split, the promised window, the cancel reason and the delivery-code
//   state (revealed at 500 m, tries, lock), plus order_key, the stock hold of the checkout
// - ordering.outbox gets the dedupe key and retry time the other outboxes have (migration 13)
// - catalog.stock_adjustments: every stock change a seller makes, with its reason
// - is_demo on shops and riders: the seeded demo shops and riders take no real orders, and
//   real orders are never offered to a demo rider
import { runAll } from '../ddl.js';
import { buildSeed } from '../../../../shared/seed/seed.js';

const seed = buildSeed();
const ids = (rows) => rows.map((r) => Number(r.id)).filter(Number.isInteger).join(',') || '0';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE ordering.carts (
      customer_id BIGINT UNSIGNED PRIMARY KEY,
      seller_id BIGINT UNSIGNED NOT NULL,
      updated_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB`,
    `CREATE TABLE ordering.cart_items (
      customer_id BIGINT UNSIGNED NOT NULL,
      product_id BIGINT UNSIGNED NOT NULL,
      qty SMALLINT UNSIGNED NOT NULL,
      added_at DATETIME(3) NOT NULL,
      PRIMARY KEY (customer_id, product_id),
      CONSTRAINT fk_cart_items_cart FOREIGN KEY (customer_id) REFERENCES ordering.carts(customer_id) ON DELETE CASCADE,
      CONSTRAINT ck_cart_items_qty CHECK (qty BETWEEN 1 AND 20)
    ) ENGINE=InnoDB`,
    `ALTER TABLE ordering.orders
      ADD COLUMN order_key CHAR(64) NULL AFTER idem_key,
      ADD COLUMN subtotal_paise INT UNSIGNED NOT NULL DEFAULT 0 AFTER temp_class,
      ADD COLUMN delivery_fee_paise INT UNSIGNED NOT NULL DEFAULT 0 AFTER subtotal_paise,
      ADD COLUMN promise_lo_min TINYINT UNSIGNED NULL AFTER promised_at,
      ADD COLUMN promise_hi_min TINYINT UNSIGNED NULL AFTER promise_lo_min,
      ADD COLUMN cancel_reason VARCHAR(200) NULL,
      ADD COLUMN seller_delay_min SMALLINT UNSIGNED NULL,
      ADD COLUMN ride_started_at DATETIME(3) NULL AFTER picked_at,
      ADD COLUMN closed_at DATETIME(3) NULL AFTER delivered_at,
      ADD COLUMN otp_revealed_at DATETIME(3) NULL,
      ADD COLUMN otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      ADD COLUMN otp_locked_at DATETIME(3) NULL,
      ADD UNIQUE KEY uq_order_key (order_key),
      ADD CONSTRAINT ck_orders_otp_attempts CHECK (otp_attempts <= 10),
      ADD CONSTRAINT ck_orders_promise_window CHECK (promise_lo_min IS NULL OR promise_lo_min <= promise_hi_min)`,
    `ALTER TABLE ordering.outbox
      ADD COLUMN dedupe_key VARCHAR(120) NULL AFTER type,
      ADD COLUMN available_at DATETIME(3) NULL AFTER published_at,
      ADD UNIQUE KEY uq_dedupe (dedupe_key),
      ADD KEY ix_type_unpub (type, published_at, id)`,
    `CREATE TABLE catalog.stock_adjustments (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id BIGINT UNSIGNED NOT NULL,
      delta INT NOT NULL,
      reason VARCHAR(60) NOT NULL,
      actor_id BIGINT UNSIGNED NULL,
      at DATETIME(3) NOT NULL,
      KEY ix_product (product_id, at),
      CONSTRAINT fk_adjustments_product FOREIGN KEY (product_id) REFERENCES catalog.products(id),
      CONSTRAINT ck_adjustments_delta CHECK (delta <> 0),
      CONSTRAINT ck_adjustments_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0)
    ) ENGINE=InnoDB`,
    'ALTER TABLE catalog.sellers ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE',
    'ALTER TABLE dispatch.riders ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE',
    // the shops and riders the demo seed made before this column existed
    `UPDATE catalog.sellers SET is_demo = TRUE WHERE id IN (${ids(seed.sellers)})`,
    `UPDATE dispatch.riders SET is_demo = TRUE WHERE id IN (${ids(seed.riders)})`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    'ALTER TABLE dispatch.riders DROP COLUMN is_demo',
    'ALTER TABLE catalog.sellers DROP COLUMN is_demo',
    'DROP TABLE IF EXISTS catalog.stock_adjustments',
    'ALTER TABLE ordering.outbox DROP KEY ix_type_unpub, DROP KEY uq_dedupe, DROP COLUMN available_at, DROP COLUMN dedupe_key',
    `ALTER TABLE ordering.orders
      DROP CHECK ck_orders_promise_window,
      DROP CHECK ck_orders_otp_attempts,
      DROP KEY uq_order_key,
      DROP COLUMN otp_locked_at,
      DROP COLUMN otp_attempts,
      DROP COLUMN otp_revealed_at,
      DROP COLUMN closed_at,
      DROP COLUMN ride_started_at,
      DROP COLUMN seller_delay_min,
      DROP COLUMN cancel_reason,
      DROP COLUMN promise_hi_min,
      DROP COLUMN promise_lo_min,
      DROP COLUMN delivery_fee_paise,
      DROP COLUMN subtotal_paise,
      DROP COLUMN order_key`,
    'DROP TABLE IF EXISTS ordering.cart_items',
    'DROP TABLE IF EXISTS ordering.carts',
  ]);
}
