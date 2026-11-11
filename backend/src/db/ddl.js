// Helpers shared by the migrations. Statements run one at a time (no multi-statement
// strings), so a failure points at the exact table. PostgreSQL runs schema changes inside the
// migration's transaction, so a migration that fails part-way leaves nothing behind.
export async function runAll(knex, statements) {
  for (const sql of statements) await knex.raw(sql);
}

export const dropAll = (knex, schema, tables) => runAll(knex, tables.map((t) => `DROP TABLE IF EXISTS ${schema}.${t} CASCADE`));
