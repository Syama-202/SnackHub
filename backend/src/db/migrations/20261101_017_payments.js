// Online payments through a provider (PhonePe Standard Checkout, sandbox), cash on delivery
// recorded the same way, and refunds with their own ids (doc 10.9):
// - payments: the provider, the pay-page link to send the customer back to, when the
//   attempt expires, when the provider was last asked, how it was paid (UPI intent, QR,
//   card), and why it failed
// - refunds: our own refund id (sent to the provider, so a retried refund is never doubled),
//   the reason, and when it last changed
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    'ALTER TABLE payment.payments DROP CHECK ck_payments_method_status',
    `ALTER TABLE payment.payments
      MODIFY method ENUM('RAZORPAY','COD','PHONEPE') NOT NULL,
      ADD COLUMN redirect_url VARCHAR(1024) NULL AFTER provider_payment_id,
      ADD COLUMN expires_at DATETIME(3) NULL AFTER redirect_url,
      ADD COLUMN checked_at DATETIME(3) NULL AFTER expires_at,
      ADD COLUMN pay_mode VARCHAR(30) NULL AFTER checked_at,
      ADD COLUMN failure_code VARCHAR(60) NULL AFTER pay_mode,
      ADD CONSTRAINT ck_payments_method_status CHECK (
        (method = 'COD' AND status IN ('COD_PENDING','COD_COLLECTED','FAILED')) OR
        (method <> 'COD' AND status NOT IN ('COD_PENDING','COD_COLLECTED'))
      )`,
    `ALTER TABLE payment.refunds
      ADD COLUMN merchant_refund_id VARCHAR(63) NULL AFTER payment_id,
      ADD COLUMN reason VARCHAR(200) NULL AFTER amount_paise,
      ADD COLUMN failure_code VARCHAR(60) NULL AFTER status,
      ADD COLUMN updated_at DATETIME(3) NULL AFTER created_at,
      ADD UNIQUE KEY uq_merchant_refund (merchant_refund_id)`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    'ALTER TABLE payment.refunds DROP INDEX uq_merchant_refund, DROP COLUMN updated_at, DROP COLUMN failure_code, DROP COLUMN reason, DROP COLUMN merchant_refund_id',
    'ALTER TABLE payment.payments DROP CHECK ck_payments_method_status',
    `ALTER TABLE payment.payments DROP COLUMN failure_code, DROP COLUMN pay_mode, DROP COLUMN checked_at, DROP COLUMN expires_at, DROP COLUMN redirect_url,
      MODIFY method ENUM('RAZORPAY','COD') NOT NULL,
      ADD CONSTRAINT ck_payments_method_status CHECK (
        (method = 'COD' AND status IN ('COD_PENDING','COD_COLLECTED','FAILED')) OR
        (method = 'RAZORPAY' AND status NOT IN ('COD_PENDING','COD_COLLECTED'))
      )`,
  ]);
}
