// Identity module: accounts and saved addresses (doc 12.1, 12.1b).
// Foreign keys stay inside a module. A reference to another module's row (for example
// sellers.user_id) is a plain id that the owning module checks, so modules can later be
// split into services without untangling constraints.
import { runAll, dropAll, outbox, latLngChecks } from '../src/db/ddl.js';

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE identity.users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      google_sub VARCHAR(64) NULL,
      name VARCHAR(120) NOT NULL,
      role ENUM('customer','seller','rider','admin') NOT NULL DEFAULT 'customer',
      status ENUM('active','blocked') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_email (email),
      UNIQUE KEY uq_google_sub (google_sub),
      CONSTRAINT ck_users_email CHECK (email LIKE '%_@_%')
    ) ENGINE=InnoDB`,
    `CREATE TABLE identity.addresses (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      label VARCHAR(30) NOT NULL,
      line VARCHAR(255) NOT NULL,
      city VARCHAR(40) NULL,
      lat DECIMAL(9,6) NOT NULL,
      lng DECIMAL(9,6) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_user (user_id),
      CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      ${latLngChecks('addresses')}
    ) ENGINE=InnoDB`,
    outbox('identity'),
  ]);
}

export async function down(knex) {
  await dropAll(knex, 'identity', ['outbox', 'addresses', 'users']);
}
