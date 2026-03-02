// Identity sign-in sessions and the audit log (doc 16.1, 16.3, prompt 2.3).
// One refresh token per device, stored only as a SHA-256 hash and rotated on every use.
// Each sign-in starts a family; if a used token comes back, the whole family is revoked
// (reuse detection). The audit log is append only, like the payment ledger.
import { runAll, dropAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE identity.refresh_tokens (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      family_id CHAR(36) NOT NULL,
      device_id VARCHAR(64) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      used_at DATETIME(3) NULL,
      revoked_at DATETIME(3) NULL,
      UNIQUE KEY uq_hash (token_hash),
      KEY ix_user_device (user_id, device_id),
      KEY ix_family (family_id),
      KEY ix_expires (expires_at),
      CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      CONSTRAINT ck_refresh_hash CHECK (CHAR_LENGTH(token_hash) = 64),
      CONSTRAINT ck_refresh_expiry CHECK (expires_at > created_at)
    ) ENGINE=InnoDB`,
    `CREATE TABLE identity.audit_log (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      actor_id BIGINT UNSIGNED NULL,
      action VARCHAR(60) NOT NULL,
      target VARCHAR(80) NULL,
      before_state JSON NULL,
      after_state JSON NULL,
      at DATETIME(3) NOT NULL,
      KEY ix_actor (actor_id, at),
      KEY ix_action (action, at)
    ) ENGINE=InnoDB`,
    `CREATE TRIGGER identity.audit_no_update BEFORE UPDATE ON identity.audit_log
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append only'`,
    `CREATE TRIGGER identity.audit_no_delete BEFORE DELETE ON identity.audit_log
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log is append only'`,
  ]);
}

export async function down(knex) {
  await runAll(knex, ['DROP TRIGGER IF EXISTS identity.audit_no_delete', 'DROP TRIGGER IF EXISTS identity.audit_no_update']);
  await dropAll(knex, 'identity', ['audit_log', 'refresh_tokens']);
}
