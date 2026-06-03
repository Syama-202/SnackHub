// Error monitoring (shared/domain/errors.js): one row per bug, kept with the audit log as a
// platform record. Text is scrubbed of personal data before it gets here. A resolved error
// that happens again reopens; regressed_at says when.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE identity.error_groups (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      fingerprint CHAR(64) NOT NULL,
      source ENUM('api','job','web','admin') NOT NULL,
      kind VARCHAR(80) NOT NULL,
      message VARCHAR(300) NOT NULL,
      where_at VARCHAR(200) NOT NULL,
      status ENUM('open','resolved','ignored') NOT NULL DEFAULT 'open',
      seen INT UNSIGNED NOT NULL DEFAULT 1,
      first_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      regressed_at DATETIME(3) NULL,
      stack TEXT NULL,
      context JSON NULL,
      last_request_id VARCHAR(64) NULL,
      release_tag VARCHAR(40) NULL,
      resolved_by BIGINT UNSIGNED NULL,
      resolved_at DATETIME(3) NULL,
      UNIQUE KEY uq_fingerprint (fingerprint),
      KEY ix_status_seen (status, last_seen),
      KEY ix_source (source, last_seen)
    ) ENGINE=InnoDB`,
  ]);
}

export async function down(knex) {
  await runAll(knex, ['DROP TABLE IF EXISTS identity.error_groups']);
}
