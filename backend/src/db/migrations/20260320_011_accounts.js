// Accounts for every role (multi-role sign-up and sign-in):
// - one account per email can hold several roles (identity.user_roles); the single
//   users.role column goes, and so does "blocked", replaced by "suspended" with a reason
// - passwords live apart from the profile (identity.credentials), Argon2id only
// - email and mobile verification times, and a verified mobile is unique
// - one-time links and codes (identity.account_tokens), stored only as HMACs
// - the admin second factor becomes everyone's: mfa_totp, recovery_codes, mfa_setups and
//   short-lived, single-use sign-in challenges (identity.mfa_challenges)
// - sessions remember the portal they belong to, the device's browser and how the person
//   signed in, so the security page can list them and a refresh never changes the role
import { runAll } from '../ddl.js';

const ROLE = "ENUM('customer','seller','rider','reviewer','admin')";

export async function up(knex) {
  await runAll(knex, [
    `CREATE TABLE identity.user_roles (
      user_id BIGINT UNSIGNED NOT NULL,
      role ${ROLE} NOT NULL,
      status ENUM('active','suspended') NOT NULL DEFAULT 'active',
      status_reason VARCHAR(500) NULL,
      granted_at DATETIME(3) NOT NULL,
      granted_by BIGINT UNSIGNED NULL,
      PRIMARY KEY (user_id, role),
      KEY ix_role_status (role, status),
      CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      CONSTRAINT ck_user_roles_reason CHECK (status = 'active' OR status_reason IS NOT NULL)
    ) ENGINE=InnoDB`,
    // every existing account keeps its role; sellers and riders were customers first
    `INSERT INTO identity.user_roles (user_id, role, granted_at) SELECT id, role, created_at FROM identity.users`,
    `INSERT IGNORE INTO identity.user_roles (user_id, role, granted_at) SELECT id, 'customer', created_at FROM identity.users WHERE role IN ('seller','rider')`,

    `ALTER TABLE identity.refresh_tokens
      ADD COLUMN portal ${ROLE} NULL AFTER kind,
      ADD COLUMN amr VARCHAR(40) NULL AFTER mfa_at,
      ADD COLUMN user_agent VARCHAR(160) NULL AFTER device_id`,
    `UPDATE identity.refresh_tokens t JOIN identity.users u ON u.id = t.user_id SET t.portal = u.role`,
    `ALTER TABLE identity.refresh_tokens MODIFY portal ${ROLE} NOT NULL, ADD KEY ix_user_live (user_id, revoked_at)`,

    `ALTER TABLE identity.users MODIFY status ENUM('active','blocked','suspended') NOT NULL DEFAULT 'active'`,
    `UPDATE identity.users SET status = 'suspended' WHERE status = 'blocked'`,
    `ALTER TABLE identity.users
      DROP COLUMN role,
      MODIFY status ENUM('active','suspended') NOT NULL DEFAULT 'active',
      ADD COLUMN status_reason VARCHAR(500) NULL AFTER status,
      ADD COLUMN email_verified_at DATETIME(3) NULL AFTER email,
      ADD COLUMN mobile VARCHAR(16) NULL AFTER email_verified_at,
      ADD COLUMN mobile_verified_at DATETIME(3) NULL AFTER mobile,
      ADD COLUMN verified_mobile VARCHAR(16) AS (IF(mobile_verified_at IS NULL, NULL, mobile)) STORED AFTER mobile_verified_at,
      ADD COLUMN terms_version VARCHAR(20) NULL,
      ADD COLUMN terms_accepted_at DATETIME(3) NULL,
      ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      ADD UNIQUE KEY uq_verified_mobile (verified_mobile),
      ADD CONSTRAINT ck_users_mobile CHECK (mobile IS NULL OR mobile REGEXP '^[+][1-9][0-9]{7,14}$'),
      ADD CONSTRAINT ck_users_status_reason CHECK (status = 'active' OR status_reason IS NOT NULL)`,
    // accounts so far came from Google, which only gives verified emails, or from the demo seed
    `UPDATE identity.users SET email_verified_at = created_at`,
    `UPDATE identity.users SET status_reason = 'Suspended before reasons were recorded' WHERE status = 'suspended' AND status_reason IS NULL`,

    `CREATE TABLE identity.credentials (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      password_hash VARCHAR(255) NOT NULL,
      changed_at DATETIME(3) NOT NULL,
      failed_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
      locked_until DATETIME(3) NULL,
      CONSTRAINT fk_credentials_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      CONSTRAINT ck_credentials_argon2id CHECK (password_hash LIKE '$argon2id$%'),
      CONSTRAINT ck_credentials_failed CHECK (failed_count <= 10)
    ) ENGINE=InnoDB`,

    `CREATE TABLE identity.account_tokens (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      purpose ENUM('email_verify','password_reset','mobile_verify') NOT NULL,
      token_hash CHAR(64) NOT NULL,
      target VARCHAR(255) NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      used_at DATETIME(3) NULL,
      UNIQUE KEY uq_token (token_hash),
      KEY ix_user_purpose (user_id, purpose, created_at),
      CONSTRAINT fk_account_tokens_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      CONSTRAINT ck_account_tokens_expiry CHECK (expires_at > created_at),
      CONSTRAINT ck_account_tokens_attempts CHECK (attempts <= 10)
    ) ENGINE=InnoDB`,

    `RENAME TABLE identity.admin_mfa TO identity.mfa_totp, identity.admin_recovery_codes TO identity.recovery_codes`,
    `ALTER TABLE identity.mfa_totp
      DROP FOREIGN KEY fk_admin_mfa_user,
      DROP CHECK ck_admin_mfa_failed,
      ADD CONSTRAINT fk_mfa_totp_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      ADD CONSTRAINT ck_mfa_totp_failed CHECK (failed_count <= 5)`,

    `CREATE TABLE identity.mfa_setups (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      secret_enc VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      CONSTRAINT fk_mfa_setups_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      CONSTRAINT ck_mfa_setups_expiry CHECK (expires_at > created_at)
    ) ENGINE=InnoDB`,

    `CREATE TABLE identity.mfa_challenges (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      portal ${ROLE} NOT NULL,
      purpose ENUM('verify','enrol') NOT NULL,
      first_factor ENUM('pwd','google') NOT NULL,
      token_hash CHAR(64) NOT NULL,
      device_id VARCHAR(64) NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      used_at DATETIME(3) NULL,
      UNIQUE KEY uq_token (token_hash),
      KEY ix_user (user_id, created_at),
      CONSTRAINT fk_mfa_challenges_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      CONSTRAINT ck_mfa_challenges_expiry CHECK (expires_at > created_at),
      CONSTRAINT ck_mfa_challenges_attempts CHECK (attempts <= 5)
    ) ENGINE=InnoDB`,
  ]);
}

export async function down(knex) {
  await runAll(knex, [
    'DROP TABLE IF EXISTS identity.mfa_challenges',
    'DROP TABLE IF EXISTS identity.mfa_setups',
    `ALTER TABLE identity.mfa_totp
      DROP FOREIGN KEY fk_mfa_totp_user,
      DROP CHECK ck_mfa_totp_failed,
      ADD CONSTRAINT fk_admin_mfa_user FOREIGN KEY (user_id) REFERENCES identity.users(id),
      ADD CONSTRAINT ck_admin_mfa_failed CHECK (failed_count <= 5)`,
    'RENAME TABLE identity.mfa_totp TO identity.admin_mfa, identity.recovery_codes TO identity.admin_recovery_codes',
    'DROP TABLE IF EXISTS identity.account_tokens',
    'DROP TABLE IF EXISTS identity.credentials',
    `ALTER TABLE identity.users
      DROP CHECK ck_users_status_reason,
      DROP CHECK ck_users_mobile,
      DROP KEY uq_verified_mobile,
      DROP COLUMN updated_at, DROP COLUMN terms_accepted_at, DROP COLUMN terms_version,
      DROP COLUMN verified_mobile, DROP COLUMN mobile_verified_at, DROP COLUMN mobile,
      DROP COLUMN email_verified_at, DROP COLUMN status_reason,
      MODIFY status ENUM('active','blocked','suspended') NOT NULL DEFAULT 'active',
      ADD COLUMN role ENUM('customer','seller','rider','admin') NOT NULL DEFAULT 'customer' AFTER name`,
    `UPDATE identity.users SET status = 'blocked' WHERE status = 'suspended'`,
    `ALTER TABLE identity.users MODIFY status ENUM('active','blocked') NOT NULL DEFAULT 'active'`,
    // the strongest role each account held comes back as its one role
    `UPDATE identity.users u JOIN (
        SELECT user_id, ELT(MAX(FIELD(role,'customer','rider','seller','admin')),'customer','rider','seller','admin') AS r
        FROM identity.user_roles WHERE role <> 'reviewer' GROUP BY user_id
      ) x ON x.user_id = u.id SET u.role = x.r`,
    'ALTER TABLE identity.refresh_tokens DROP KEY ix_user_live, DROP COLUMN user_agent, DROP COLUMN amr, DROP COLUMN portal',
    'DROP TABLE IF EXISTS identity.user_roles',
  ]);
}
