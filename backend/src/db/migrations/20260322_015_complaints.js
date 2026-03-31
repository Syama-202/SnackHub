// Complaints, credits, fines, pay disputes and policy versions on MySQL (doc 10.7, 8.4a, 10.3):
// - complaints: the items it is about, the decision and its reason, the credit given, the
//   safety flag, and when it was resolved
// - orders.credit_paise: app credit used on a pay-on-delivery order
// - fines: why one was reversed, and by whom
// - rider_earnings: the rider's dispute, the decision on it and any money given back
// - delivery_policy: who made each version
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `ALTER TABLE ordering.complaints
      ADD COLUMN item_ids JSON NULL AFTER description,
      ADD COLUMN safety BOOLEAN NOT NULL DEFAULT FALSE AFTER auto_decided,
      ADD COLUMN resolution ENUM('VALID','PARTLY_VALID','INVALID') NULL AFTER safety,
      ADD COLUMN decision_reason VARCHAR(300) NULL AFTER resolution,
      ADD COLUMN credit_paise INT UNSIGNED NULL AFTER decision_reason,
      ADD COLUMN late_already_cut BOOLEAN NOT NULL DEFAULT FALSE AFTER credit_paise,
      ADD COLUMN resolved_at DATETIME NULL AFTER resolved_by,
      ADD CONSTRAINT ck_complaints_decision CHECK (resolution IS NULL OR decision_reason IS NOT NULL)`,
    'ALTER TABLE ordering.orders ADD COLUMN credit_paise INT UNSIGNED NOT NULL DEFAULT 0 AFTER delivery_fee_paise',
    `ALTER TABLE ordering.fines
      ADD COLUMN reversed_by BIGINT UNSIGNED NULL AFTER decided_by,
      ADD COLUMN reverse_reason VARCHAR(200) NULL AFTER reversed_by`,
    `ALTER TABLE dispatch.rider_earnings
      ADD COLUMN dispute_reason VARCHAR(300) NULL AFTER status,
      ADD COLUMN disputed_at DATETIME(3) NULL AFTER dispute_reason,
      ADD COLUMN adjustment_paise INT NOT NULL DEFAULT 0 AFTER disputed_at,
      ADD COLUMN resolution_reason VARCHAR(300) NULL AFTER adjustment_paise,
      ADD COLUMN resolved_by BIGINT UNSIGNED NULL AFTER resolution_reason,
      ADD CONSTRAINT ck_earnings_adjustment CHECK (adjustment_paise >= 0)`,
    'ALTER TABLE ordering.delivery_policy ADD COLUMN changed_by BIGINT UNSIGNED NULL AFTER config',
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    'ALTER TABLE ordering.delivery_policy DROP COLUMN changed_by',
    `ALTER TABLE dispatch.rider_earnings DROP CHECK ck_earnings_adjustment, DROP COLUMN resolved_by, DROP COLUMN resolution_reason,
      DROP COLUMN adjustment_paise, DROP COLUMN disputed_at, DROP COLUMN dispute_reason`,
    'ALTER TABLE ordering.fines DROP COLUMN reverse_reason, DROP COLUMN reversed_by',
    'ALTER TABLE ordering.orders DROP COLUMN credit_paise',
    `ALTER TABLE ordering.complaints DROP CHECK ck_complaints_decision, DROP COLUMN resolved_at, DROP COLUMN late_already_cut,
      DROP COLUMN credit_paise, DROP COLUMN decision_reason, DROP COLUMN resolution, DROP COLUMN safety, DROP COLUMN item_ids`,
  ]);
}
