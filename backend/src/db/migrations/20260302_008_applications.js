// Seller and rider applications (doc 11.2 to 11.4, 16.4): the admin's checklist is kept with
// each seller application, and riders get their own application table. A rider row in
// dispatch.riders exists only once an admin has approved the application.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `ALTER TABLE catalog.seller_applications ADD COLUMN checks JSON NULL AFTER status`,
    `CREATE TABLE dispatch.rider_applications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(120) NOT NULL,
      city VARCHAR(40) NOT NULL,
      vehicle VARCHAR(20) NOT NULL,
      vehicle_no VARCHAR(16) NOT NULL,
      licence_no VARCHAR(30) NOT NULL,
      status ENUM('SUBMITTED','UNDER_REVIEW','NEEDS_INFO','APPROVED','REJECTED') NOT NULL DEFAULT 'SUBMITTED',
      checks JSON NULL,
      reviewer_id BIGINT UNSIGNED NULL,
      decision_reason VARCHAR(500) NULL,
      rider_id BIGINT UNSIGNED NULL,
      submitted_at DATETIME NOT NULL,
      decided_at DATETIME NULL,
      KEY ix_user (user_id),
      KEY ix_status (status, submitted_at),
      CONSTRAINT fk_rider_applications_rider FOREIGN KEY (rider_id) REFERENCES dispatch.riders(id),
      -- a decision always carries a reason, and only an approval links a rider (doc 16.4)
      CONSTRAINT ck_rider_applications_reason CHECK (status NOT IN ('APPROVED','REJECTED','NEEDS_INFO') OR decision_reason IS NOT NULL),
      CONSTRAINT ck_rider_applications_rider CHECK ((status = 'APPROVED') = (rider_id IS NOT NULL))
    ) ENGINE=InnoDB`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [`DROP TABLE IF EXISTS dispatch.rider_applications`, `ALTER TABLE catalog.seller_applications DROP COLUMN checks`]);
}
