// Order module: orders and their history, the delivery policy versions, reviews, and
// complaints with fines and credits (doc 12.1, 10.7, 10.9, 16.4).
import { runAll, dropAll, outbox, latLngChecks } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    // every order keeps the policy version it was promised under (doc 10.3)
    `CREATE TABLE ordering.delivery_policy (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      effective_from DATETIME NOT NULL,
      config JSON NOT NULL,
      KEY ix_effective (effective_from)
    ) ENGINE=InnoDB`,
    // 12.1 orders with the 10.9 payment changes (PENDING_PAYMENT, ONLINE) and the 10.7
    // pickup_sealed column
    `CREATE TABLE ordering.orders (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL,
      seller_id BIGINT UNSIGNED NOT NULL,
      rider_id BIGINT UNSIGNED NULL,
      status ENUM('PENDING_PAYMENT','PLACED','ACCEPTED','PACKING','PACKED','PICKED_UP','ON_THE_WAY','ARRIVED','DELIVERED','CANCELLED','REJECTED') NOT NULL,
      temp_class ENUM('HOT','AMBIENT') NOT NULL,
      total_paise INT UNSIGNED NOT NULL,
      payment_mode ENUM('ONLINE','COD') NOT NULL,
      collected_paise INT UNSIGNED NULL,
      address_text VARCHAR(255) NOT NULL,
      drop_lat DECIMAL(9,6) NOT NULL,
      drop_lng DECIMAL(9,6) NOT NULL,
      distance_m INT UNSIGNED NOT NULL,
      otp_hash CHAR(64) NOT NULL,
      idem_key VARCHAR(64) NOT NULL,
      policy_id BIGINT UNSIGNED NOT NULL,
      pickup_sealed BOOLEAN NULL,
      placed_at DATETIME(3) NOT NULL,
      promised_at DATETIME(3) NOT NULL,
      accepted_at DATETIME(3) NULL,
      packed_at DATETIME(3) NULL,
      picked_at DATETIME(3) NULL,
      arrived_at DATETIME(3) NULL,
      delivered_at DATETIME(3) NULL,
      UNIQUE KEY uq_idem (customer_id, idem_key),
      KEY ix_seller (seller_id, status, placed_at),
      KEY ix_rider (rider_id, status),
      KEY ix_customer (customer_id, placed_at),
      KEY ix_status (status, placed_at),
      CONSTRAINT fk_orders_policy FOREIGN KEY (policy_id) REFERENCES ordering.delivery_policy(id),
      ${latLngChecks('orders', 'drop_lat', 'drop_lng')},
      CONSTRAINT ck_orders_total CHECK (total_paise > 0),
      CONSTRAINT ck_orders_promise CHECK (promised_at >= placed_at),
      -- only pay-on-delivery orders record cash collected
      CONSTRAINT ck_orders_collected CHECK (collected_paise IS NULL OR payment_mode = 'COD'),
      CONSTRAINT ck_orders_otp CHECK (CHAR_LENGTH(otp_hash) = 64)
    ) ENGINE=InnoDB`,
    `CREATE TABLE ordering.order_items (
      order_id BIGINT UNSIGNED NOT NULL,
      product_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(160) NOT NULL,
      unit_price_paise INT UNSIGNED NOT NULL,
      qty SMALLINT UNSIGNED NOT NULL,
      PRIMARY KEY (order_id, product_id),
      CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES ordering.orders(id),
      CONSTRAINT ck_items_qty CHECK (qty >= 1),
      CONSTRAINT ck_items_price CHECK (unit_price_paise > 0)
    ) ENGINE=InnoDB`,
    `CREATE TABLE ordering.order_events (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      from_status VARCHAR(20) NULL,
      to_status VARCHAR(20) NOT NULL,
      actor_id BIGINT UNSIGNED NULL,
      actor_role VARCHAR(10) NULL,
      at DATETIME(3) NOT NULL,
      KEY ix_order (order_id, at),
      CONSTRAINT fk_events_order FOREIGN KEY (order_id) REFERENCES ordering.orders(id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE ordering.order_reviews (
      order_id BIGINT UNSIGNED PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL,
      rating TINYINT UNSIGNED NOT NULL,
      tags JSON NULL,
      comment VARCHAR(500) NULL,
      created_at DATETIME NOT NULL,
      CONSTRAINT fk_reviews_order FOREIGN KEY (order_id) REFERENCES ordering.orders(id),
      CONSTRAINT ck_reviews_rating CHECK (rating BETWEEN 1 AND 5)
    ) ENGINE=InnoDB`,
    // 16.4 complaints with the 10.7 triage columns and states. kind is the original
    // food-quality detail and is empty for delivery complaints.
    `CREATE TABLE ordering.complaints (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      seller_id BIGINT UNSIGNED NOT NULL,
      customer_id BIGINT UNSIGNED NOT NULL,
      rider_id BIGINT UNSIGNED NULL,
      category ENUM('FOOD_QUALITY','DELIVERY','OTHER') NOT NULL DEFAULT 'FOOD_QUALITY',
      subtype VARCHAR(30) NOT NULL DEFAULT 'OTHER',
      kind ENUM('STALE','COLD','WRONG_ITEM','PACKAGING','SAFETY') NULL,
      description VARCHAR(500) NULL,
      photo_key VARCHAR(255) NULL,
      status ENUM('SUBMITTED','TRIAGED','IN_REVIEW','RESOLVED','APPEALED','CLOSED') NOT NULL DEFAULT 'SUBMITTED',
      classification ENUM('DELIVERY','FOOD_QUALITY','BOTH','UNCLEAR','INVALID') NULL,
      confidence DECIMAL(3,2) NULL,
      rider_share_pct TINYINT NULL,
      seller_share_pct TINYINT NULL,
      auto_decided BOOLEAN NOT NULL DEFAULT FALSE,
      resolved_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL,
      -- one complaint per category per order
      UNIQUE KEY uq_order_category (order_id, category),
      KEY ix_status (status, created_at),
      KEY ix_seller (seller_id, created_at),
      KEY ix_rider (rider_id, created_at),
      CONSTRAINT fk_complaints_order FOREIGN KEY (order_id) REFERENCES ordering.orders(id),
      CONSTRAINT ck_complaints_confidence CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
      CONSTRAINT ck_complaints_rider_share CHECK (rider_share_pct IS NULL OR rider_share_pct BETWEEN 0 AND 100),
      CONSTRAINT ck_complaints_seller_share CHECK (seller_share_pct IS NULL OR seller_share_pct BETWEEN 0 AND 100),
      CONSTRAINT ck_complaints_shares CHECK (COALESCE(rider_share_pct, 0) + COALESCE(seller_share_pct, 0) <= 100)
    ) ENGINE=InnoDB`,
    `CREATE TABLE ordering.complaint_evidence (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      complaint_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('PHOTO','SYSTEM_TIMELINE','NOTE') NOT NULL,
      storage_key VARCHAR(255) NULL,
      sha256 CHAR(64) NULL,
      content JSON NULL,
      created_at DATETIME NOT NULL,
      KEY ix_complaint (complaint_id),
      CONSTRAINT fk_evidence_complaint FOREIGN KEY (complaint_id) REFERENCES ordering.complaints(id),
      -- a photo is a stored file with its hash; other evidence is JSON content
      CONSTRAINT ck_evidence_shape CHECK (
        (kind = 'PHOTO' AND storage_key IS NOT NULL AND sha256 IS NOT NULL) OR (kind <> 'PHOTO' AND content IS NOT NULL)
      )
    ) ENGINE=InnoDB`,
    `CREATE TABLE ordering.fines (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      complaint_id BIGINT UNSIGNED NULL,
      order_id BIGINT UNSIGNED NOT NULL,
      target_type ENUM('RIDER','SELLER') NOT NULL,
      target_id BIGINT UNSIGNED NOT NULL,
      reason VARCHAR(200) NOT NULL,
      amount_paise INT UNSIGNED NOT NULL,
      status ENUM('PROPOSED','APPLIED','APPEALED','REVERSED') NOT NULL,
      decided_by BIGINT UNSIGNED NULL,
      created_at DATETIME NOT NULL,
      KEY ix_target (target_type, target_id, created_at),
      CONSTRAINT fk_fines_order FOREIGN KEY (order_id) REFERENCES ordering.orders(id),
      CONSTRAINT fk_fines_complaint FOREIGN KEY (complaint_id) REFERENCES ordering.complaints(id),
      CONSTRAINT ck_fines_amount CHECK (amount_paise > 0),
      CONSTRAINT ck_fines_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0)
    ) ENGINE=InnoDB`,
    `CREATE TABLE ordering.customer_credits (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL,
      complaint_id BIGINT UNSIGNED NULL,
      amount_paise INT UNSIGNED NOT NULL,
      expires_at DATE NOT NULL,
      used_order_id BIGINT UNSIGNED NULL,
      KEY ix_customer (customer_id, expires_at),
      CONSTRAINT fk_credits_complaint FOREIGN KEY (complaint_id) REFERENCES ordering.complaints(id),
      CONSTRAINT fk_credits_used_order FOREIGN KEY (used_order_id) REFERENCES ordering.orders(id),
      CONSTRAINT ck_credits_amount CHECK (amount_paise > 0)
    ) ENGINE=InnoDB`,
    outbox('ordering'),
  ]);
}

export async function down(knex) {
  await dropAll(knex, 'ordering', [
    'outbox', 'customer_credits', 'fines', 'complaint_evidence', 'complaints', 'order_reviews', 'order_events', 'order_items', 'orders', 'delivery_policy',
  ]);
}
