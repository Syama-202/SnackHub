// Seller payouts (doc 8.5, shared/domain/payouts.js): a statement per shop and run of orders.
// - payouts: the totals, the commission rate used, and the state: PENDING (drafted), PAID
//   (with the bank transfer reference) or CANCELLED (its orders become payable again)
// - payout_lines: every order, fine and returned fine on a statement. The unique key on
//   (kind, ref_id) is what stops an order or a fine from being paid or deducted twice; a
//   cancelled statement's lines are removed so they can go on the next one.
// Money is recorded, not moved: the transfer is made from the bank and its reference noted.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE payment.payouts (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      seller_id BIGINT UNSIGNED NOT NULL,
      status ENUM('PENDING','PAID','CANCELLED') NOT NULL DEFAULT 'PENDING',
      commission_pct DECIMAL(5,2) NOT NULL,
      orders_count INT UNSIGNED NOT NULL,
      gross_paise INT UNSIGNED NOT NULL,
      commission_paise INT UNSIGNED NOT NULL,
      fines_paise INT UNSIGNED NOT NULL,
      returned_paise INT UNSIGNED NOT NULL,
      net_paise INT NOT NULL,
      first_delivered_at DATETIME(3) NULL,
      last_delivered_at DATETIME(3) NULL,
      reference VARCHAR(60) NULL,
      cancel_reason VARCHAR(200) NULL,
      created_by BIGINT UNSIGNED NOT NULL,
      closed_by BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      closed_at DATETIME(3) NULL,
      KEY ix_seller (seller_id, created_at),
      KEY ix_status (status, created_at),
      CONSTRAINT ck_payouts_net CHECK (net_paise = gross_paise - commission_paise - fines_paise + returned_paise),
      CONSTRAINT ck_payouts_paid CHECK (status <> 'PAID' OR reference IS NOT NULL),
      CONSTRAINT ck_payouts_cancel CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL),
      CONSTRAINT ck_payouts_pct CHECK (commission_pct BETWEEN 0 AND 50)
    ) ENGINE=InnoDB`,
    `CREATE TABLE payment.payout_lines (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      payout_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('ORDER','FINE','FINE_RETURNED') NOT NULL,
      ref_id BIGINT UNSIGNED NOT NULL,
      gross_paise INT UNSIGNED NOT NULL DEFAULT 0,
      commission_paise INT UNSIGNED NOT NULL DEFAULT 0,
      amount_paise INT UNSIGNED NOT NULL DEFAULT 0,
      UNIQUE KEY uq_once (kind, ref_id),
      KEY ix_payout (payout_id),
      CONSTRAINT fk_lines_payout FOREIGN KEY (payout_id) REFERENCES payment.payouts(id)
    ) ENGINE=InnoDB`,
  ]);
}

export async function down(knex) {
  await runAll(knex, ['DROP TABLE IF EXISTS payment.payout_lines', 'DROP TABLE IF EXISTS payment.payouts']);
}
