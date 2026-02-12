#!/bin/bash
# Runs once, on the first start of the MySQL container (docker-entrypoint-initdb.d).
# One schema per module and one user per module that can only touch its own schema
# (doc 12: "separate schemas and separate database users"). The migrator user owns
# DDL on all module schemas; the API's module users get DML on their own schema only.
set -euo pipefail

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS identity  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS catalog   CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS ordering  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS dispatch  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS payment   CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS notify    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'sh_migrator'@'%' IDENTIFIED BY '${MIGRATOR_PASSWORD}';
GRANT ALL PRIVILEGES ON identity.* TO 'sh_migrator'@'%';
GRANT ALL PRIVILEGES ON catalog.*  TO 'sh_migrator'@'%';
GRANT ALL PRIVILEGES ON ordering.* TO 'sh_migrator'@'%';
GRANT ALL PRIVILEGES ON dispatch.* TO 'sh_migrator'@'%';
GRANT ALL PRIVILEGES ON payment.*  TO 'sh_migrator'@'%';
GRANT ALL PRIVILEGES ON notify.*   TO 'sh_migrator'@'%';
-- the migration bookkeeping table lives in the default database
GRANT ALL PRIVILEGES ON snackhub.* TO 'sh_migrator'@'%';

CREATE USER IF NOT EXISTS 'sh_identity'@'%' IDENTIFIED BY '${MODULE_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'sh_catalog'@'%'  IDENTIFIED BY '${MODULE_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'sh_order'@'%'    IDENTIFIED BY '${MODULE_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'sh_dispatch'@'%' IDENTIFIED BY '${MODULE_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'sh_payment'@'%'  IDENTIFIED BY '${MODULE_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'sh_notify'@'%'   IDENTIFIED BY '${MODULE_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.* TO 'sh_identity'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog.*  TO 'sh_catalog'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON ordering.* TO 'sh_order'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON dispatch.* TO 'sh_dispatch'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON payment.*  TO 'sh_payment'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON notify.*   TO 'sh_notify'@'%';
FLUSH PRIVILEGES;
SQL
