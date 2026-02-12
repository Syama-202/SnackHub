// Notification inbox (doc 12.1b). The unique key makes a re-delivered event harmless.
import { runAll, dropAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE notify.notifications (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      order_id BIGINT UNSIGNED NULL,
      type VARCHAR(40) NOT NULL,
      body VARCHAR(300) NOT NULL,
      read_at DATETIME NULL,
      created_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_order_type_user (order_id, type, user_id),
      KEY ix_user (user_id, created_at),
      KEY ix_created (created_at)
    ) ENGINE=InnoDB`,
  ]);
}

export async function down(knex) {
  await dropAll(knex, 'notify', ['notifications']);
}
