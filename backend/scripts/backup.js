// npm run backup (local) | npm run backup:hosted (Aiven)
// Saves every table of the six schemas as one compressed SQL file in backend/backups/, which
// git ignores. The file holds real personal data: keep it private and off shared drives.
// Restore into an empty server with:  gunzip -c <file> | mysql -h <host> -u <user> -p
// Runs as the migrator user and only reads.
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { createGzip } from 'node:zlib';
import { loadDbEnv } from '../src/config/env.js';
import { MODULES } from '../src/config/database.js';
import { migratorDb } from '../src/db/connection.js';
import { insertSql } from '../src/utils/sqlDump.js';

const BATCH = 1000;
const env = loadDbEnv();
const db = migratorDb(env);
const dir = path.resolve('backups');
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const file = path.join(dir, `snackhub-${env.NODE_ENV}-${stamp}.sql.gz`);

try {
  await mkdir(dir, { recursive: true });
  const gzip = createGzip({ level: 9 });
  const out = createWriteStream(file, { mode: 0o600 });
  gzip.pipe(out);
  const write = async (text) => {
    if (!gzip.write(text)) await once(gzip, 'drain');
  };

  await write(`-- SnackHub backup, ${new Date().toISOString()} (UTC)\nSET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSET FOREIGN_KEY_CHECKS = 0;\n`);
  let tables = 0;
  let rows = 0;
  for (const { database } of Object.values(MODULES)) {
    const [list] = await db.raw("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", [database]);
    await write(`\nCREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4;\nUSE \`${database}\`;\n`);
    for (const { name } of list) {
      const [[created]] = await db.raw('SHOW CREATE TABLE ??.??', [database, name]);
      // generated columns are worked out by MySQL and cannot be inserted
      const [cols] = await db.raw("SELECT COLUMN_NAME AS name, COLUMN_KEY AS col_key FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND EXTRA NOT LIKE '%GENERATED%' ORDER BY ORDINAL_POSITION", [database, name]);
      const columns = cols.map((c) => c.name);
      const order = cols.filter((c) => c.col_key === 'PRI').map((c) => c.name);
      await write(`\nDROP TABLE IF EXISTS \`${name}\`;\n${created['Create Table']};\n`);
      for (let offset = 0; ; offset += BATCH) {
        const q = db.withSchema(database).from(name).select(columns).limit(BATCH).offset(offset);
        for (const c of order) q.orderBy(c);
        const batch = await q;
        if (batch.length) await write(insertSql(database, name, columns, batch));
        rows += batch.length;
        if (batch.length < BATCH) break;
      }
      tables += 1;
    }
  }
  await write('\nSET FOREIGN_KEY_CHECKS = 1;\n');
  gzip.end();
  await once(out, 'finish');
  const { size } = await stat(file);
  console.log(`Saved ${tables} tables and ${rows} rows (${(size / 1024).toFixed(0)} KB) to\n  ${file}\nThis file holds personal data. Keep it private.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
