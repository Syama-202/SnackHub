// Push notifications (shared/domain/push.js): one row per device and portal that asked for
// them. family_id is the sign-in session that subscribed (identity.refresh_tokens, a plain id
// across modules): messages go only to devices whose session is still live, so signing out,
// "sign out other devices" and a password reset stop them with no extra step. The endpoint
// is a secret address at the push service; only its hash is indexed and it is never logged.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE notify.push_subscriptions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      portal ENUM('customer','seller','rider') NOT NULL,
      family_id CHAR(36) NOT NULL,
      endpoint VARCHAR(1000) NOT NULL,
      endpoint_hash CHAR(64) NOT NULL,
      p256dh VARCHAR(200) NOT NULL,
      auth VARCHAR(50) NOT NULL,
      device VARCHAR(60) NULL,
      failures TINYINT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_sent_at DATETIME(3) NULL,
      UNIQUE KEY uq_endpoint (endpoint_hash),
      KEY ix_user_portal (user_id, portal, created_at)
    ) ENGINE=InnoDB`,
  ]);
}

export async function down(knex) {
  await runAll(knex, ['DROP TABLE IF EXISTS notify.push_subscriptions']);
}
