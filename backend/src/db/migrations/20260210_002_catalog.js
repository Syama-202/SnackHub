// Catalog module: shops, products, stock and stock holds (doc 12.1, 12.1b, 10.8),
// plus shop verification (doc 16.4).
import { runAll, dropAll, outbox, latLngChecks } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    // 12.1 sellers with the 16.4 changes folded in: the verification states, licence
    // number and expiry, verified_at and quality_score
    `CREATE TABLE catalog.sellers (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      shop_name VARCHAR(120) NOT NULL,
      city VARCHAR(40) NOT NULL,
      region VARCHAR(40) NULL,
      lat DECIMAL(9,6) NOT NULL,
      lng DECIMAL(9,6) NOT NULL,
      radius_km DECIMAL(3,1) NOT NULL DEFAULT 3.0,
      busy_extra_min SMALLINT NOT NULL DEFAULT 0,
      paused BOOLEAN NOT NULL DEFAULT FALSE,
      open_hours VARCHAR(20) NULL,
      status ENUM('draft','pending','probation','active','warned','suspended','rejected') NOT NULL DEFAULT 'draft',
      licence_no VARCHAR(40) NULL,
      licence_expires_on DATE NULL,
      verified_at DATETIME NULL,
      quality_score DECIMAL(5,2) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_user (user_id),
      KEY ix_geo (lat, lng),
      KEY ix_status (status),
      ${latLngChecks('sellers')},
      CONSTRAINT ck_sellers_radius CHECK (radius_km > 0 AND radius_km <= 10),
      CONSTRAINT ck_sellers_busy CHECK (busy_extra_min BETWEEN 0 AND 60),
      CONSTRAINT ck_sellers_quality CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100)
    ) ENGINE=InnoDB`,
    `CREATE TABLE catalog.products (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      seller_id BIGINT UNSIGNED NOT NULL,
      slug VARCHAR(120) NOT NULL,
      title VARCHAR(160) NOT NULL,
      description VARCHAR(500) NULL,
      category ENUM('sweet','fried','baked','namkeen') NOT NULL,
      region VARCHAR(40) NULL,
      serving_temp ENUM('HOT','AMBIENT') NOT NULL,
      prep_minutes TINYINT UNSIGNED NOT NULL,
      price_paise INT UNSIGNED NOT NULL,
      mrp_paise INT UNSIGNED NULL,
      image_path VARCHAR(255) NULL,
      attrs JSON NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      -- 12.1b: index one field inside the JSON column
      spice VARCHAR(10) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(attrs, '$.spice'))) STORED,
      UNIQUE KEY uq_seller_slug (seller_id, slug),
      KEY ix_spice (spice),
      KEY ix_active_temp (active, serving_temp),
      CONSTRAINT fk_products_seller FOREIGN KEY (seller_id) REFERENCES catalog.sellers(id),
      CONSTRAINT ck_products_price CHECK (price_paise > 0),
      CONSTRAINT ck_products_mrp CHECK (mrp_paise IS NULL OR mrp_paise >= price_paise),
      CONSTRAINT ck_products_prep CHECK (prep_minutes BETWEEN 1 AND 60)
    ) ENGINE=InnoDB`,
    `CREATE TABLE catalog.stock (
      product_id BIGINT UNSIGNED PRIMARY KEY,
      qty INT NOT NULL,
      CONSTRAINT fk_stock_product FOREIGN KEY (product_id) REFERENCES catalog.products(id),
      CONSTRAINT ck_stock_qty CHECK (qty >= 0)
    ) ENGINE=InnoDB`,
    // 10.8: stock is held only at checkout, inside one transaction; a retry of the same
    // order finds its hold already there (INSERT IGNORE)
    `CREATE TABLE catalog.stock_holds (
      order_key VARCHAR(64) NOT NULL,
      product_id BIGINT UNSIGNED NOT NULL,
      qty SMALLINT UNSIGNED NOT NULL,
      status ENUM('HELD','COMMITTED','RELEASED') NOT NULL DEFAULT 'HELD',
      expires_at DATETIME(3) NOT NULL,
      PRIMARY KEY (order_key, product_id),
      KEY ix_exp (status, expires_at),
      CONSTRAINT fk_holds_product FOREIGN KEY (product_id) REFERENCES catalog.products(id),
      CONSTRAINT ck_holds_qty CHECK (qty > 0)
    ) ENGINE=InnoDB`,
    `CREATE TABLE catalog.seller_applications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      seller_id BIGINT UNSIGNED NOT NULL,
      status ENUM('SUBMITTED','UNDER_REVIEW','NEEDS_INFO','APPROVED','REJECTED') NOT NULL,
      reviewer_id BIGINT UNSIGNED NULL,
      decision_reason VARCHAR(500) NULL,
      submitted_at DATETIME NOT NULL,
      decided_at DATETIME NULL,
      KEY ix_seller (seller_id),
      KEY ix_status (status, submitted_at),
      CONSTRAINT fk_applications_seller FOREIGN KEY (seller_id) REFERENCES catalog.sellers(id),
      -- a decision always carries a reason (doc 16.4)
      CONSTRAINT ck_applications_reason CHECK (status NOT IN ('APPROVED','REJECTED','NEEDS_INFO') OR decision_reason IS NOT NULL)
    ) ENGINE=InnoDB`,
    `CREATE TABLE catalog.seller_documents (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      application_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('LICENCE','OWNER_ID','KITCHEN_PHOTO','MENU') NOT NULL,
      storage_key VARCHAR(255) NOT NULL,
      sha256 CHAR(64) NOT NULL,
      uploaded_at DATETIME NOT NULL,
      KEY ix_application (application_id),
      CONSTRAINT fk_documents_application FOREIGN KEY (application_id) REFERENCES catalog.seller_applications(id)
    ) ENGINE=InnoDB`,
    outbox('catalog'),
  ]);
}

export async function down(knex) {
  await dropAll(knex, 'catalog', ['outbox', 'seller_documents', 'seller_applications', 'stock_holds', 'stock', 'products', 'sellers']);
}
