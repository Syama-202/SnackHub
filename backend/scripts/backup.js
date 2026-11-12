// npm run backup (local) | npm run backup:hosted (Neon)
// Saves the module schemas (tables and rows) and the migration records as one compressed
// pg_dump file in backend/backups/, which git ignores. The file holds real personal data: keep
// it private and off shared drives.
//
// Restore into an empty database prepared with db:local or db:hosted:
//   pg_restore --no-owner --role=sh_migrator -d <database> <file>
// Needs pg_dump, which comes with PostgreSQL's command line tools (version 17 or newer for a
// version 17 server). Set PG_DUMP to its full path if it is not on the PATH. Runs as the
// migrator role, which owns every table, and only reads. Passwords are passed to pg_dump in its
// environment, never on the command line or the screen.
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { loadDbEnv } from '../src/config/env.js';
import { MODULES, META_SCHEMA } from '../src/config/database.js';

function findPgDump() {
  if (process.env.PG_DUMP) return process.env.PG_DUMP;
  if (process.platform === 'win32') {
    for (const v of [18, 17, 16]) {
      const p = `C:\\Program Files\\PostgreSQL\\${v}\\bin\\pg_dump.exe`;
      if (existsSync(p)) return p;
    }
  }
  return 'pg_dump';
}

const env = loadDbEnv();
const dir = path.resolve('backups');
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const file = path.join(dir, `snackhub-${env.NODE_ENV}-${stamp}.dump`);
await mkdir(dir, { recursive: true });

// pg_dump checks the server's certificate against a file of trusted CAs, written to a temporary
// file and removed afterwards: DB_SSL_CA when it is set, or else the CAs Node trusts, which are
// the ones the API checks the same server with (Neon needs no DB_SSL_CA). pg_dump's own
// "system" store is empty in the Windows build, so it cannot be used there.
let caFile = null;
if (env.DB_SSL) {
  caFile = path.join(os.tmpdir(), `snackhub-ca-${process.pid}.pem`);
  writeFileSync(caFile, env.DB_SSL_CA ? env.DB_SSL_CA.replace(/\\n/g, '\n') : tls.rootCertificates.join('\n'), { mode: 0o600 });
}

const schemas = [META_SCHEMA, ...Object.values(MODULES).map((m) => m.schema)];
const args = ['--format=custom', '--compress=9', '--no-owner', '--no-privileges', `--file=${file}`, ...schemas.map((s) => `--schema=${s}`)];
const child = spawn(findPgDump(), args, {
  stdio: ['ignore', 'inherit', 'inherit'],
  env: {
    ...process.env,
    PGHOST: env.DB_HOST,
    PGPORT: String(env.DB_PORT),
    PGDATABASE: env.DB_NAME,
    PGUSER: env.DB_MIGRATOR_USER,
    PGPASSWORD: env.DB_MIGRATOR_PASSWORD,
    ...(env.DB_SSL ? { PGSSLMODE: 'verify-full', PGSSLROOTCERT: caFile } : {}),
  },
});
const code = await new Promise((resolve) => {
  child.on('error', (err) => {
    console.error(err.code === 'ENOENT' ? 'pg_dump was not found. Install PostgreSQL\'s command line tools, or set PG_DUMP to the full path of pg_dump.' : err.message);
    resolve(1);
  });
  child.on('close', resolve);
});
if (caFile) rmSync(caFile, { force: true });
if (code !== 0) {
  rmSync(file, { force: true });
  console.error('The backup failed; nothing was saved.');
  process.exit(1);
}
const { size } = await stat(file);
console.log(`Saved the ${schemas.length} schemas (${(size / 1024).toFixed(0)} KB) to\n  ${file}\nThis file holds personal data. Keep it private.`);
