// Dispatch module: riders, offers, the GPS trail and rider pay (doc 12.1, 12.1b, 10.7).
import { runAll, dropAll, outbox, latLngChecks } from '../src/db/ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE dispatch.riders (
      id BIGINT UNSIGNED PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(120) NOT NULL,
      city VARCHAR(40) NOT NULL,
      vehicle VARCHAR(20) NOT NULL,
      status ENUM('OFFLINE','ONLINE','BUSY') NOT NULL DEFAULT 'OFFLINE',
      last_lat DECIMAL(9,6) NULL,
      last_lng DECIMAL(9,6) NULL,
      last_seen_at DATETIME(3) NULL,
      UNIQUE KEY uq_user (user_id),
      KEY ix_city_status (city, status),
      ${latLngChecks('riders', 'last_lat', 'last_lng')},
      -- a position is both coordinates or neither
      CONSTRAINT ck_riders_position CHECK ((last_lat IS NULL) = (last_lng IS NULL))
    ) ENGINE=InnoDB`,
    `CREATE TABLE dispatch.assignments (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      rider_id BIGINT UNSIGNED NOT NULL,
      status ENUM('OFFERED','ACCEPTED','DECLINED','EXPIRED') NOT NULL,
      offered_at DATETIME(3) NOT NULL,
      responded_at DATETIME(3) NULL,
      -- at most one accepted rider per order, enforced by the database
      accepted_order_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'ACCEPTED', order_id, NULL)) STORED,
      KEY ix_order (order_id),
      KEY ix_rider (rider_id, status),
      UNIQUE KEY uq_one_accepted (accepted_order_id),
      CONSTRAINT fk_assignments_rider FOREIGN KEY (rider_id) REFERENCES dispatch.riders(id)
    ) ENGINE=InnoDB`,
    `CREATE TABLE dispatch.rider_trail (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      rider_id BIGINT UNSIGNED NOT NULL,
      lat DECIMAL(9,6) NOT NULL,
      lng DECIMAL(9,6) NOT NULL,
      at DATETIME(3) NOT NULL,
      KEY ix_order_at (order_id, at),
      KEY ix_at (at),
      CONSTRAINT fk_trail_rider FOREIGN KEY (rider_id) REFERENCES dispatch.riders(id),
      ${latLngChecks('trail')}
    ) ENGINE=InnoDB`,
    // rider pay: never below zero, lateness cut capped by the order's policy (doc 10.3)
    `CREATE TABLE dispatch.rider_earnings (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      rider_id BIGINT UNSIGNED NOT NULL,
      base_paise INT NOT NULL,
      distance_paise INT NOT NULL,
      bonus_paise INT NOT NULL DEFAULT 0,
      penalty_paise INT NOT NULL DEFAULT 0,
      complaint_penalty_paise INT NOT NULL DEFAULT 0,
      late_min SMALLINT NOT NULL DEFAULT 0,
      seller_delay_min SMALLINT NOT NULL DEFAULT 0,
      net_paise INT NOT NULL,
      status ENUM('OK','DISPUTED','ADJUSTED') NOT NULL DEFAULT 'OK',
      created_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_order (order_id),
      KEY ix_rider (rider_id, created_at),
      CONSTRAINT fk_earnings_rider FOREIGN KEY (rider_id) REFERENCES dispatch.riders(id),
      CONSTRAINT ck_earnings_parts CHECK (base_paise >= 0 AND distance_paise >= 0 AND bonus_paise >= 0 AND penalty_paise >= 0 AND complaint_penalty_paise >= 0),
      CONSTRAINT ck_earnings_minutes CHECK (late_min >= 0 AND seller_delay_min >= 0),
      CONSTRAINT ck_earnings_net CHECK (net_paise >= 0)
    ) ENGINE=InnoDB`,
    outbox('dispatch'),
  ]);
}

export async function down(knex) {
  await dropAll(knex, 'dispatch', ['outbox', 'rider_earnings', 'rider_trail', 'assignments', 'riders']);
}
