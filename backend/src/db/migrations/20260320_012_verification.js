// Seller and rider verification (multi-role onboarding):
// - applications start as DRAFT and follow shared/domain/verification.js; NEEDS_INFO becomes
//   ACTION_REQUIRED, and SUSPENDED is new. One application in progress or approved per person.
// - the business behind a shop (catalog.seller_businesses) and a rider's profile and vehicle
//   (dispatch.rider_profiles, dispatch.rider_vehicles) hold the draft answers; the public
//   shop row is made only when the application is submitted
// - documents are versioned, with their file in private storage (only a random key here),
//   the number encrypted and its last four digits for display, and their own review status
// - which documents apply is data an admin can change (document_requirements)
// - every submission and review decision is kept in an append-only history (seller_reviews,
//   rider_reviews): who (actor_id), what, from which status to which, and why
// - docs_valid_until on a shop or rider is the earliest expiry among its required approved
//   documents: past it, the shop disappears from listings and the rider cannot go online
import { runAll } from '../ddl.js';
import { DEFAULT_REQUIREMENTS } from '../../../../shared/domain/documents.js';

const STATUSES_OLD_NEW = "ENUM('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_INFO','ACTION_REQUIRED','APPROVED','REJECTED','SUSPENDED')";
const STATUSES = "ENUM('DRAFT','SUBMITTED','UNDER_REVIEW','ACTION_REQUIRED','APPROVED','REJECTED','SUSPENDED')";
const DECIDED = "('APPROVED','REJECTED','ACTION_REQUIRED','SUSPENDED')";
// a person has at most one application that is not rejected
const OPEN = "IF(status = 'REJECTED', NULL, user_id)";

const documents = (schema, table, application) => `
  CREATE TABLE ${schema}.${table} (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    application_id BIGINT UNSIGNED NOT NULL,
    doc_type VARCHAR(30) NOT NULL,
    version SMALLINT UNSIGNED NOT NULL,
    number_enc VARCHAR(255) NULL,
    number_last4 VARCHAR(4) NULL,
    issuer VARCHAR(120) NULL,
    issued_on DATE NULL,
    expires_on DATE NULL,
    storage_key CHAR(32) NOT NULL,
    mime VARCHAR(40) NOT NULL,
    size_bytes INT UNSIGNED NOT NULL,
    sha256 CHAR(64) NOT NULL,
    scan_status ENUM('not_scanned','clean','infected','error') NOT NULL DEFAULT 'not_scanned',
    status ENUM('PENDING','APPROVED','REJECTED','SUPERSEDED') NOT NULL DEFAULT 'PENDING',
    reviewer_id BIGINT UNSIGNED NULL,
    reviewer_remarks VARCHAR(500) NULL,
    rejection_reason VARCHAR(500) NULL,
    reviewed_at DATETIME(3) NULL,
    reminded_days SMALLINT NULL,
    uploaded_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_storage (storage_key),
    UNIQUE KEY uq_version (user_id, doc_type, version),
    KEY ix_application (application_id),
    KEY ix_status (status, uploaded_at),
    KEY ix_expiry (expires_on, status),
    CONSTRAINT fk_${table}_application FOREIGN KEY (application_id) REFERENCES ${schema}.${application}(id),
    CONSTRAINT ck_${table}_rejected CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL),
    CONSTRAINT ck_${table}_mime CHECK (mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
    CONSTRAINT ck_${table}_size CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    CONSTRAINT ck_${table}_dates CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on > issued_on),
    CONSTRAINT ck_${table}_last4 CHECK ((number_enc IS NULL) = (number_last4 IS NULL))
  ) ENGINE=InnoDB`;

const requirements = (schema, typesColumn) => `
  CREATE TABLE ${schema}.document_requirements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doc_type VARCHAR(30) NOT NULL,
    mode ENUM('required','optional') NOT NULL,
    ${typesColumn} JSON NULL,
    states JSON NULL,
    updated_by BIGINT UNSIGNED NULL,
    updated_at DATETIME(3) NOT NULL,
    KEY ix_doc (doc_type)
  ) ENGINE=InnoDB`;

const reviews = (schema, table, application, docs) => [
  `CREATE TABLE ${schema}.${table} (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    application_id BIGINT UNSIGNED NOT NULL,
    document_id BIGINT UNSIGNED NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(30) NOT NULL,
    from_status VARCHAR(20) NULL,
    to_status VARCHAR(20) NULL,
    reason VARCHAR(500) NULL,
    at DATETIME(3) NOT NULL,
    KEY ix_application (application_id, at),
    KEY ix_actor (actor_id, at),
    CONSTRAINT fk_${table}_application FOREIGN KEY (application_id) REFERENCES ${schema}.${application}(id),
    CONSTRAINT fk_${table}_document FOREIGN KEY (document_id) REFERENCES ${schema}.${docs}(id)
  ) ENGINE=InnoDB`,
  `CREATE TRIGGER ${schema}.${table}_no_update BEFORE UPDATE ON ${schema}.${table}
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${table} is append only'`,
  `CREATE TRIGGER ${schema}.${table}_no_delete BEFORE DELETE ON ${schema}.${table}
    FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '${table} is append only'`,
];

const bank = `
    bank_holder VARCHAR(120) NULL,
    bank_ifsc CHAR(11) NULL,
    bank_account_enc VARCHAR(255) NULL,
    bank_account_last4 CHAR(4) NULL`;

export async function up(knex) {
  await runAll(knex, [
    // ---------- catalog: sellers
    `ALTER TABLE catalog.seller_applications
      ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER id,
      MODIFY seller_id BIGINT UNSIGNED NULL,
      MODIFY status ${STATUSES_OLD_NEW} NOT NULL DEFAULT 'DRAFT',
      MODIFY submitted_at DATETIME NULL,
      ADD COLUMN submit_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      ADD COLUMN review_started_at DATETIME NULL,
      ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`,
    `UPDATE catalog.seller_applications a JOIN catalog.sellers s ON s.id = a.seller_id SET a.user_id = s.user_id`,
    `UPDATE catalog.seller_applications SET status = 'ACTION_REQUIRED' WHERE status = 'NEEDS_INFO'`,
    `UPDATE catalog.seller_applications SET submit_count = 1 WHERE submitted_at IS NOT NULL`,
    `UPDATE catalog.seller_applications SET review_started_at = submitted_at WHERE status = 'UNDER_REVIEW'`,
    `ALTER TABLE catalog.seller_applications
      MODIFY user_id BIGINT UNSIGNED NOT NULL,
      MODIFY status ${STATUSES} NOT NULL DEFAULT 'DRAFT',
      DROP CHECK ck_applications_reason,
      ADD COLUMN open_user BIGINT UNSIGNED AS (${OPEN}) STORED,
      ADD UNIQUE KEY uq_open_user (open_user),
      ADD KEY ix_user (user_id, created_at),
      ADD CONSTRAINT ck_seller_applications_reason CHECK (status NOT IN ${DECIDED} OR decision_reason IS NOT NULL),
      ADD CONSTRAINT ck_seller_applications_submitted CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL),
      ADD CONSTRAINT ck_seller_applications_shop CHECK (status = 'DRAFT' OR seller_id IS NOT NULL)`,

    `CREATE TABLE catalog.seller_businesses (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      owner_legal_name VARCHAR(120) NULL,
      business_type ENUM('individual','sole_proprietorship','partnership','company') NULL,
      business_email VARCHAR(255) NULL,
      business_phone VARCHAR(16) NULL,
      shop_name VARCHAR(120) NULL,
      kind ENUM('shop','stall','home') NULL,
      address_line VARCHAR(255) NULL,
      state VARCHAR(40) NULL,
      city VARCHAR(40) NULL,
      pin CHAR(6) NULL,
      lat DECIMAL(9,6) NULL,
      lng DECIMAL(9,6) NULL,
      radius_km DECIMAL(3,1) NULL,
      open_hours VARCHAR(20) NULL,
      ${bank},
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT ck_seller_businesses_pin CHECK (pin IS NULL OR pin REGEXP '^[1-9][0-9]{5}$'),
      CONSTRAINT ck_seller_businesses_ifsc CHECK (bank_ifsc IS NULL OR bank_ifsc REGEXP '^[A-Z]{4}0[A-Z0-9]{6}$'),
      CONSTRAINT ck_seller_businesses_lat CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
      CONSTRAINT ck_seller_businesses_lng CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
      CONSTRAINT ck_seller_businesses_radius CHECK (radius_km IS NULL OR (radius_km > 0 AND radius_km <= 10)),
      CONSTRAINT ck_seller_businesses_bank CHECK ((bank_account_enc IS NULL) = (bank_account_last4 IS NULL))
    ) ENGINE=InnoDB`,

    // nothing ever wrote the old table; documents now belong to an application and a version
    `DROP TABLE catalog.seller_documents`,
    documents('catalog', 'seller_documents', 'seller_applications'),
    requirements('catalog', 'business_types'),
    ...reviews('catalog', 'seller_reviews', 'seller_applications', 'seller_documents'),
    `ALTER TABLE catalog.sellers ADD COLUMN docs_valid_until DATE NULL AFTER licence_expires_on`,

    // ---------- dispatch: riders
    `CREATE TABLE dispatch.rider_profiles (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      legal_name VARCHAR(120) NULL,
      dob DATE NULL,
      address_line VARCHAR(255) NULL,
      state VARCHAR(40) NULL,
      city VARCHAR(40) NULL,
      pin CHAR(6) NULL,
      emergency_name VARCHAR(120) NULL,
      emergency_phone VARCHAR(16) NULL,
      background_consent_at DATETIME(3) NULL,
      ${bank},
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT ck_rider_profiles_pin CHECK (pin IS NULL OR pin REGEXP '^[1-9][0-9]{5}$'),
      CONSTRAINT ck_rider_profiles_ifsc CHECK (bank_ifsc IS NULL OR bank_ifsc REGEXP '^[A-Z]{4}0[A-Z0-9]{6}$'),
      CONSTRAINT ck_rider_profiles_bank CHECK ((bank_account_enc IS NULL) = (bank_account_last4 IS NULL))
    ) ENGINE=InnoDB`,
    `CREATE TABLE dispatch.rider_vehicles (
      user_id BIGINT UNSIGNED PRIMARY KEY,
      mode ENUM('motorcycle','scooter','ev_scooter','bicycle') NOT NULL,
      registration_no VARCHAR(12) NULL,
      make_model VARCHAR(60) NULL,
      owned_by_rider BOOLEAN NOT NULL DEFAULT TRUE,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT ck_rider_vehicles_bicycle CHECK (mode <> 'bicycle' OR registration_no IS NULL),
      CONSTRAINT ck_rider_vehicles_reg CHECK (registration_no IS NULL OR registration_no REGEXP '^[A-Z0-9]{4,12}$')
    ) ENGINE=InnoDB`,
    // the answers on old applications move to the profile and the vehicle
    `INSERT INTO dispatch.rider_profiles (user_id, legal_name, city)
      SELECT user_id, name, city FROM dispatch.rider_applications a
      WHERE a.id = (SELECT MAX(b.id) FROM dispatch.rider_applications b WHERE b.user_id = a.user_id)`,
    `INSERT INTO dispatch.rider_vehicles (user_id, mode, registration_no)
      SELECT user_id,
        CASE vehicle WHEN 'Bicycle' THEN 'bicycle' WHEN 'EV scooter' THEN 'ev_scooter' WHEN 'Motorbike' THEN 'motorcycle' ELSE 'scooter' END,
        IF(vehicle = 'Bicycle', NULL, LEFT(REGEXP_REPLACE(UPPER(vehicle_no), '[^A-Z0-9]', ''), 12))
      FROM dispatch.rider_applications a
      WHERE a.id = (SELECT MAX(b.id) FROM dispatch.rider_applications b WHERE b.user_id = a.user_id)`,
    `ALTER TABLE dispatch.rider_applications
      DROP CHECK ck_rider_applications_reason,
      DROP CHECK ck_rider_applications_rider,
      MODIFY status ${STATUSES_OLD_NEW} NOT NULL DEFAULT 'DRAFT',
      MODIFY submitted_at DATETIME NULL,
      ADD COLUMN submit_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
      ADD COLUMN review_started_at DATETIME NULL,
      ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`,
    `UPDATE dispatch.rider_applications SET status = 'ACTION_REQUIRED' WHERE status = 'NEEDS_INFO'`,
    `UPDATE dispatch.rider_applications SET submit_count = 1 WHERE submitted_at IS NOT NULL`,
    `ALTER TABLE dispatch.rider_applications
      DROP COLUMN name, DROP COLUMN city, DROP COLUMN vehicle, DROP COLUMN vehicle_no, DROP COLUMN licence_no,
      MODIFY status ${STATUSES} NOT NULL DEFAULT 'DRAFT',
      ADD COLUMN open_user BIGINT UNSIGNED AS (${OPEN}) STORED,
      ADD UNIQUE KEY uq_open_user (open_user),
      ADD CONSTRAINT ck_rider_applications_reason CHECK (status NOT IN ${DECIDED} OR decision_reason IS NOT NULL),
      ADD CONSTRAINT ck_rider_applications_submitted CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL),
      -- a rider row exists once an application has been approved, and stays while suspended
      ADD CONSTRAINT ck_rider_applications_rider CHECK ((status IN ('APPROVED','SUSPENDED')) = (rider_id IS NOT NULL))`,
    documents('dispatch', 'rider_documents', 'rider_applications'),
    requirements('dispatch', 'vehicle_types'),
    ...reviews('dispatch', 'rider_reviews', 'rider_applications', 'rider_documents'),
    `ALTER TABLE dispatch.riders ADD COLUMN docs_valid_until DATE NULL AFTER status`,
  ]);

  const now = new Date();
  const rows = (list, typesColumn) => list.map((r) => ({ doc_type: r.docType, mode: r.mode, [typesColumn]: r.types ? JSON.stringify(r.types) : null, states: r.states ? JSON.stringify(r.states) : null, updated_at: now }));
  await knex('catalog.document_requirements').insert(rows(DEFAULT_REQUIREMENTS.seller, 'business_types'));
  await knex('dispatch.document_requirements').insert(rows(DEFAULT_REQUIREMENTS.rider, 'vehicle_types'));
}

export async function down(knex) {
  await runAll(knex, [
    'ALTER TABLE dispatch.riders DROP COLUMN docs_valid_until',
    'DROP TRIGGER IF EXISTS dispatch.rider_reviews_no_delete',
    'DROP TRIGGER IF EXISTS dispatch.rider_reviews_no_update',
    'DROP TABLE IF EXISTS dispatch.rider_reviews',
    'DROP TABLE IF EXISTS dispatch.document_requirements',
    'DROP TABLE IF EXISTS dispatch.rider_documents',
    `ALTER TABLE dispatch.rider_applications
      DROP CHECK ck_rider_applications_rider, DROP CHECK ck_rider_applications_submitted, DROP CHECK ck_rider_applications_reason,
      DROP KEY uq_open_user, DROP COLUMN open_user,
      DROP COLUMN updated_at, DROP COLUMN created_at, DROP COLUMN review_started_at, DROP COLUMN submit_count,
      MODIFY status ${STATUSES_OLD_NEW} NOT NULL DEFAULT 'SUBMITTED',
      ADD COLUMN name VARCHAR(120) NOT NULL DEFAULT '' AFTER user_id,
      ADD COLUMN city VARCHAR(40) NOT NULL DEFAULT '' AFTER name,
      ADD COLUMN vehicle VARCHAR(20) NOT NULL DEFAULT 'Scooter' AFTER city,
      ADD COLUMN vehicle_no VARCHAR(16) NOT NULL DEFAULT '' AFTER vehicle,
      ADD COLUMN licence_no VARCHAR(30) NOT NULL DEFAULT '' AFTER vehicle_no`,
    `UPDATE dispatch.rider_applications a LEFT JOIN dispatch.rider_profiles p ON p.user_id = a.user_id LEFT JOIN dispatch.rider_vehicles v ON v.user_id = a.user_id
      SET a.name = COALESCE(p.legal_name, ''), a.city = COALESCE(p.city, ''),
          a.vehicle = CASE v.mode WHEN 'bicycle' THEN 'Bicycle' WHEN 'ev_scooter' THEN 'EV scooter' WHEN 'motorcycle' THEN 'Motorbike' ELSE 'Scooter' END,
          a.vehicle_no = COALESCE(v.registration_no, '')`,
    `UPDATE dispatch.rider_applications SET status = 'NEEDS_INFO' WHERE status = 'ACTION_REQUIRED'`,
    `DELETE FROM dispatch.rider_applications WHERE status IN ('DRAFT','SUSPENDED')`,
    `ALTER TABLE dispatch.rider_applications
      MODIFY status ENUM('SUBMITTED','UNDER_REVIEW','NEEDS_INFO','APPROVED','REJECTED') NOT NULL DEFAULT 'SUBMITTED',
      MODIFY submitted_at DATETIME NOT NULL,
      ADD CONSTRAINT ck_rider_applications_reason CHECK (status NOT IN ('APPROVED','REJECTED','NEEDS_INFO') OR decision_reason IS NOT NULL),
      ADD CONSTRAINT ck_rider_applications_rider CHECK ((status = 'APPROVED') = (rider_id IS NOT NULL))`,
    'DROP TABLE IF EXISTS dispatch.rider_vehicles',
    'DROP TABLE IF EXISTS dispatch.rider_profiles',

    'ALTER TABLE catalog.sellers DROP COLUMN docs_valid_until',
    'DROP TRIGGER IF EXISTS catalog.seller_reviews_no_delete',
    'DROP TRIGGER IF EXISTS catalog.seller_reviews_no_update',
    'DROP TABLE IF EXISTS catalog.seller_reviews',
    'DROP TABLE IF EXISTS catalog.document_requirements',
    'DROP TABLE IF EXISTS catalog.seller_documents',
    `CREATE TABLE catalog.seller_documents (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      application_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('LICENCE','OWNER_ID','KITCHEN_PHOTO','MENU') NOT NULL,
      storage_key VARCHAR(255) NOT NULL,
      sha256 CHAR(64) NOT NULL,
      uploaded_at DATETIME NOT NULL,
      KEY ix_application (application_id),
      CONSTRAINT fk_documents_application FOREIGN KEY (application_id) REFERENCES catalog.seller_applications(id)
    ) ENGINE=InnoDB`,
    'DROP TABLE IF EXISTS catalog.seller_businesses',
    `DELETE FROM catalog.seller_applications WHERE status IN ('DRAFT','SUSPENDED') OR seller_id IS NULL`,
    `UPDATE catalog.seller_applications SET status = 'NEEDS_INFO' WHERE status = 'ACTION_REQUIRED'`,
    // MySQL will not make a foreign-key column NOT NULL while the key exists
    `ALTER TABLE catalog.seller_applications DROP FOREIGN KEY fk_applications_seller`,
    `ALTER TABLE catalog.seller_applications
      DROP CHECK ck_seller_applications_shop, DROP CHECK ck_seller_applications_submitted, DROP CHECK ck_seller_applications_reason,
      DROP KEY ix_user, DROP KEY uq_open_user, DROP COLUMN open_user,
      DROP COLUMN updated_at, DROP COLUMN created_at, DROP COLUMN review_started_at, DROP COLUMN submit_count,
      MODIFY status ENUM('SUBMITTED','UNDER_REVIEW','NEEDS_INFO','APPROVED','REJECTED') NOT NULL,
      MODIFY submitted_at DATETIME NOT NULL,
      MODIFY seller_id BIGINT UNSIGNED NOT NULL,
      DROP COLUMN user_id,
      ADD CONSTRAINT ck_applications_reason CHECK (status NOT IN ('APPROVED','REJECTED','NEEDS_INFO') OR decision_reason IS NOT NULL)`,
    `ALTER TABLE catalog.seller_applications ADD CONSTRAINT fk_applications_seller FOREIGN KEY (seller_id) REFERENCES catalog.sellers(id)`,
  ]);
}
