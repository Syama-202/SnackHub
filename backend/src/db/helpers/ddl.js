// Helpers shared by the migrations. Statements run one at a time (no multi-statement
// strings), so a failure points at the exact table.
export async function runAll(knex, statements) {
  for (const sql of statements) await knex.raw(sql);
}

export const dropAll = (knex, schema, tables) =>
  runAll(knex, tables.map((t) => `DROP TABLE IF EXISTS \`${schema}\`.\`${t}\``));

// Transactional outbox, one per module schema: a write that must notify others inserts
// here in the same transaction; the relay claims rows with FOR UPDATE SKIP LOCKED (doc 12.1).
export const outbox = (schema) => `
  CREATE TABLE ${schema}.outbox (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(60) NOT NULL,
    payload JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    published_at DATETIME(3) NULL,
    attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    KEY ix_unpub (published_at, id)
  ) ENGINE=InnoDB`;

// Latitude and longitude stay plain DECIMAL columns (doc 12.1); these keep them on the globe.
export const latLngChecks = (name, lat = 'lat', lng = 'lng') =>
  `CONSTRAINT ck_${name}_lat CHECK (${lat} BETWEEN -90 AND 90), CONSTRAINT ck_${name}_lng CHECK (${lng} BETWEEN -180 AND 180)`;
