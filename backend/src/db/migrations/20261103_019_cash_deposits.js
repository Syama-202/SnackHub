// Cash in hand (doc 8.5, 10.9): riders collect pay-on-delivery cash and hand it in. A
// rider's cash in hand is what they recorded at the door (ordering.orders.collected_paise on
// their delivered orders) minus their deposits here. The table is append only, for every
// database user: a deposit recorded by mistake is cancelled by a REVERSAL row pointing at it,
// at most one per deposit.
import { runAll } from '../ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE dispatch.cash_deposits (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      rider_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('DEPOSIT','REVERSAL') NOT NULL DEFAULT 'DEPOSIT',
      amount_paise INT UNSIGNED NOT NULL,
      reverses_id BIGINT UNSIGNED NULL,
      received_by BIGINT UNSIGNED NOT NULL,
      note VARCHAR(200) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_rider (rider_id, created_at),
      UNIQUE KEY uq_reverses (reverses_id),
      CONSTRAINT fk_cash_rider FOREIGN KEY (rider_id) REFERENCES dispatch.riders(id),
      CONSTRAINT fk_cash_reverses FOREIGN KEY (reverses_id) REFERENCES dispatch.cash_deposits(id),
      CONSTRAINT ck_cash_amount CHECK (amount_paise > 0),
      CONSTRAINT ck_cash_reversal CHECK ((kind = 'REVERSAL') = (reverses_id IS NOT NULL))
    ) ENGINE=InnoDB`,
    `CREATE TRIGGER dispatch.cash_deposits_no_update BEFORE UPDATE ON dispatch.cash_deposits
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cash_deposits is append only'`,
    `CREATE TRIGGER dispatch.cash_deposits_no_delete BEFORE DELETE ON dispatch.cash_deposits
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'cash_deposits is append only'`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    'DROP TRIGGER IF EXISTS dispatch.cash_deposits_no_delete',
    'DROP TRIGGER IF EXISTS dispatch.cash_deposits_no_update',
    'DROP TABLE IF EXISTS dispatch.cash_deposits',
  ]);
}
