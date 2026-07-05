// The announcement shown across the top of the shop ("Closed on 12 November for Diwali").
// Every change is a new row, so the table is also the history of what was shown and who set
// it; the newest row is the current one, and an empty message means no announcement.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE notify.site_notices (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      message VARCHAR(200) NOT NULL,
      tone ENUM('info','warning') NOT NULL DEFAULT 'info',
      ends_at DATETIME(3) NULL,
      changed_by BIGINT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`,
  ]);
}

export async function down(knex) {
  await runAll(knex, ['DROP TABLE IF EXISTS notify.site_notices']);
}
