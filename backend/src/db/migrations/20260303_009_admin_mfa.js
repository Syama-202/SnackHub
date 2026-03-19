// Admin second factor (doc 16.3): a TOTP secret per admin, encrypted with AES-GCM; ten
// single-use recovery codes stored as hashes; one-time enrolment links that expire in 15
// minutes. Admin sessions use the same refresh-token table with kind = 'admin', and keep
// the time the second factor was passed, so a refreshed token never looks fresher than it is.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `ALTER TABLE identity.refresh_tokens
      ADD COLUMN kind ENUM('web','admin') NOT NULL DEFAULT 'web' AFTER id,
      ADD COLUMN mfa_at DATETIME(3) NULL AFTER revoked_at`,
    `CREATE TABLE identity.admin_mfa (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      secret_enc VARCHAR(255) NOT NULL,
      enrolled_at DATETIME(3) NOT NULL,
      last_step BIGINT UNSIGNED NULL,
      failed_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
      locked_until DATETIME(3) NULL,
      CONSTRAINT fk_admin_mfa_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      CONSTRAINT ck_admin_mfa_failed CHECK (failed_count <= 5)
    ) ENGINE=InnoDB`,
    `CREATE TABLE identity.admin_recovery_codes (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      code_hash CHAR(64) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      used_at DATETIME(3) NULL,
      UNIQUE KEY uq_code (code_hash),
      KEY ix_user (user_id),
      CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES identity.users(id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE identity.admin_enrolments (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      secret_enc VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      used_at DATETIME(3) NULL,
      UNIQUE KEY uq_token (token_hash),
      KEY ix_user (user_id),
      CONSTRAINT fk_enrolment_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      CONSTRAINT ck_enrolment_expiry CHECK (expires_at > created_at)
    ) ENGINE=InnoDB`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    'DROP TABLE IF EXISTS identity.admin_enrolments',
    'DROP TABLE IF EXISTS identity.admin_recovery_codes',
    'DROP TABLE IF EXISTS identity.admin_mfa',
    'ALTER TABLE identity.refresh_tokens DROP COLUMN mfa_at, DROP COLUMN kind',
  ]);
}
