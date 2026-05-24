// Saved addresses with the details a rider needs, and a frozen copy on every order (doc 11.1):
// - addresses: a kind (home, hostel, college, office, other), flat or house, floor, landmark
//   and instructions for the rider; one default per customer, kept unique by MySQL through a
//   generated column that is NULL for every other row
// - orders.address_detail: the address as it was at checkout (kind, label, flat, floor,
//   landmark, instructions). With address_text and the drop pin it never changes after the
//   order is written, which a trigger enforces, so editing or deleting a saved address
//   never moves an order.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `ALTER TABLE identity.addresses
      ADD COLUMN kind ENUM('HOME','HOSTEL','COLLEGE','OFFICE','OTHER') NOT NULL DEFAULT 'HOME' AFTER user_id,
      ADD COLUMN house VARCHAR(80) NULL AFTER line,
      ADD COLUMN floor VARCHAR(20) NULL AFTER house,
      ADD COLUMN landmark VARCHAR(120) NULL AFTER floor,
      ADD COLUMN instructions VARCHAR(200) NULL AFTER landmark,
      ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE AFTER lng,
      ADD COLUMN default_owner BIGINT UNSIGNED AS (IF(is_default, user_id, NULL)) STORED AFTER is_default,
      ADD COLUMN updated_at DATETIME(3) NULL AFTER created_at,
      ADD UNIQUE KEY uq_default (default_owner)`,
    // every customer who already has addresses gets their oldest one as the default
    `UPDATE identity.addresses a JOIN (SELECT MIN(id) AS id FROM identity.addresses GROUP BY user_id) first ON first.id = a.id
      SET a.is_default = TRUE`,
    'ALTER TABLE ordering.orders ADD COLUMN address_detail JSON NULL AFTER address_text',
    `CREATE TRIGGER ordering.orders_address_frozen BEFORE UPDATE ON ordering.orders
      FOR EACH ROW BEGIN
        IF NOT (NEW.address_text <=> OLD.address_text AND NEW.address_detail <=> OLD.address_detail
                AND NEW.drop_lat <=> OLD.drop_lat AND NEW.drop_lng <=> OLD.drop_lng) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'an order keeps the address it was placed with';
        END IF;
      END`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    'DROP TRIGGER IF EXISTS ordering.orders_address_frozen',
    'ALTER TABLE ordering.orders DROP COLUMN address_detail',
    `ALTER TABLE identity.addresses DROP INDEX uq_default, DROP COLUMN updated_at, DROP COLUMN default_owner, DROP COLUMN is_default,
      DROP COLUMN instructions, DROP COLUMN landmark, DROP COLUMN floor, DROP COLUMN house, DROP COLUMN kind`,
  ]);
}
