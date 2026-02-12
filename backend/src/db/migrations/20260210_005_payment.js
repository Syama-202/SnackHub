// Payment module: Razorpay payments, verified webhooks, refunds and the ledger (doc 10.9).
import { runAll, dropAll, outbox } from '../helpers/ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE payment.payments (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      method ENUM('RAZORPAY','COD') NOT NULL,
      provider_order_id VARCHAR(40) NULL,
      provider_payment_id VARCHAR(40) NULL,
      amount_paise INT UNSIGNED NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      status ENUM('CREATED','CAPTURED','FAILED','EXPIRED','REFUND_PENDING','PARTIALLY_REFUNDED','REFUNDED','COD_PENDING','COD_COLLECTED') NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_order (order_id),
      UNIQUE KEY uq_provider_order (provider_order_id),
      UNIQUE KEY uq_provider_payment (provider_payment_id),
      KEY ix_status (status, created_at),
      CONSTRAINT ck_payments_amount CHECK (amount_paise > 0),
      CONSTRAINT ck_payments_currency CHECK (currency = 'INR'),
      -- cash states belong to cash payments, provider states to Razorpay
      CONSTRAINT ck_payments_method_status CHECK (
        (method = 'COD' AND status IN ('COD_PENDING','COD_COLLECTED','FAILED')) OR
        (method = 'RAZORPAY' AND status NOT IN ('COD_PENDING','COD_COLLECTED'))
      )
    ) ENGINE=InnoDB`,
    // the primary key on the provider's event id is the de-duplication (doc 10.9)
    `CREATE TABLE payment.webhook_events (
      event_id VARCHAR(64) PRIMARY KEY,
      type VARCHAR(60) NOT NULL,
      payload JSON NOT NULL,
      received_at DATETIME(3) NOT NULL,
      processed_at DATETIME(3) NULL
    ) ENGINE=InnoDB`,
    `CREATE TABLE payment.refunds (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      payment_id BIGINT UNSIGNED NOT NULL,
      complaint_id BIGINT UNSIGNED NULL,
      amount_paise INT UNSIGNED NOT NULL,
      provider_refund_id VARCHAR(40) NULL,
      status ENUM('PENDING','PROCESSED','FAILED') NOT NULL,
      created_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_provider_refund (provider_refund_id),
      KEY ix_payment (payment_id),
      CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payment.payments(id),
      CONSTRAINT ck_refunds_amount CHECK (amount_paise > 0)
    ) ENGINE=InnoDB`,
    `CREATE TABLE payment.ledger_entries (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      payment_id BIGINT UNSIGNED NOT NULL,
      entry_type ENUM('CHARGE','REFUND') NOT NULL,
      amount_paise INT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL,
      KEY ix_payment (payment_id),
      CONSTRAINT fk_ledger_payment FOREIGN KEY (payment_id) REFERENCES payment.payments(id),
      CONSTRAINT ck_ledger_amount CHECK (amount_paise > 0)
    ) ENGINE=InnoDB`,
    // append only, for every database user: corrections are new rows, never edits
    `CREATE TRIGGER payment.ledger_no_update BEFORE UPDATE ON payment.ledger_entries
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_entries is append only'`,
    `CREATE TRIGGER payment.ledger_no_delete BEFORE DELETE ON payment.ledger_entries
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ledger_entries is append only'`,
    outbox('payment'),
  ]);
}

export async function down(knex) {
  await runAll(knex, ['DROP TRIGGER IF EXISTS payment.ledger_no_delete', 'DROP TRIGGER IF EXISTS payment.ledger_no_update']);
  await dropAll(knex, 'payment', ['outbox', 'ledger_entries', 'refunds', 'webhook_events', 'payments']);
}
