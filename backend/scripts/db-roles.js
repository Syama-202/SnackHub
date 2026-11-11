// The roles, schemas and permissions SnackHub needs in PostgreSQL, shared by the local setup
// (local-db-init.js), the hosted one (hosted-db-init.js) and CI, so all three are the same:
//
//   sh_migrator  owns the database's module schemas and every table in them (runs migrations
//                and the seed only)
//   sh_identity, sh_catalog, sh_order, sh_dispatch, sh_payment, sh_notify
//                one per module: read and write rows in its own schema, nothing else, not
//                even the right to see another module's schema
//
// Passwords go in as escaped literals (CREATE ROLE cannot take a bind parameter) and are never
// printed. Every statement is safe to run again.
import pg from 'pg';
import { MODULES, META_SCHEMA } from '../src/config/database.js';

const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error(`Unexpected name "${name}"`);
  return name;
};

/** Creates or updates one login role with this password. */
export async function ensureRole(client, role, password) {
  ident(role);
  const { rowCount } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  const literal = client.escapeLiteral(password);
  await client.query(rowCount ? `ALTER ROLE ${role} WITH LOGIN PASSWORD ${literal}` : `CREATE ROLE ${role} WITH LOGIN PASSWORD ${literal}`);
}

/** The migrator and the six module roles. */
export async function ensureRoles(client, { migrator, migratorPassword, modulePassword }) {
  await ensureRole(client, migrator, migratorPassword);
  for (const { user } of Object.values(MODULES)) await ensureRole(client, user, modulePassword);
}

/**
 * Inside the database (connected to it as its owner or a superuser): the schemas, owned by
 * the migrator, and each module role's rights on its own schema, for the tables there now
 * and the ones later migrations create.
 */
export async function ensureSchemas(client, { database, migrator }) {
  ident(database);
  ident(migrator);
  // on a hosted server the admin is not a superuser: it needs the migrator's rights to hand
  // schemas to it and to set the migrator's default privileges
  await client.query(`GRANT ${migrator} TO CURRENT_USER`).catch(() => {});
  await client.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${database} TO ${migrator}`);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${META_SCHEMA} AUTHORIZATION ${migrator}`);
  for (const { user, schema } of Object.values(MODULES)) {
    ident(user);
    ident(schema);
    const run = (sql) => client.query(sql);
    await run(`GRANT CONNECT ON DATABASE ${database} TO ${user}`);
    await run(`CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${migrator}`);
    await run(`ALTER SCHEMA ${schema} OWNER TO ${migrator}`);
    await run(`REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC`);
    await run(`GRANT USAGE ON SCHEMA ${schema} TO ${user}`);
    await run(`ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator} IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${user}`);
    await run(`ALTER DEFAULT PRIVILEGES FOR ROLE ${migrator} IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${user}`);
    // tables that already exist (running this again after migrations changes nothing)
    await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${user}`);
    await run(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${user}`);
    await run(`ALTER ROLE ${user} SET search_path = ${schema}`);
    await run(`ALTER ROLE ${user} SET timezone = 'UTC'`);
  }
  await client.query(`ALTER ROLE ${migrator} SET timezone = 'UTC'`);
}

/** A pg client from plain settings; ssl as in the API (certificate always checked). */
export function adminClient({ host, port, user, password, database, ssl, ca }) {
  return new pg.Client({ host, port, user, password, database, ssl: ssl ? { rejectUnauthorized: true, ...(ca && { ca: ca.replace(/\\n/g, '\n') }) } : undefined, connectionTimeoutMillis: 15_000 });
}
