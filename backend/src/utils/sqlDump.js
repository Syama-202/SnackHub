// Writes rows as SQL text for the backup command (scripts/backup.js). Values are escaped by
// the MySQL driver itself, with dates in UTC to match the connection.
import mysql from 'mysql2';

const id = (name) => mysql.escapeId(name);

/** One value as SQL: JSON columns arrive as objects and go back as JSON text. */
export function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (v instanceof Date || Buffer.isBuffer(v)) return mysql.escape(v, false, 'Z');
  if (typeof v === 'object') return mysql.escape(JSON.stringify(v));
  return mysql.escape(v);
}

/** INSERT statements for some rows of one table, a few hundred rows per statement. */
export function insertSql(database, table, columns, rows, perStatement = 200) {
  const out = [];
  const head = `INSERT INTO ${id(database)}.${id(table)} (${columns.map(id).join(', ')}) VALUES\n`;
  for (let i = 0; i < rows.length; i += perStatement) {
    out.push(`${head}${rows.slice(i, i + perStatement).map((r) => `(${columns.map((c) => sqlValue(r[c])).join(', ')})`).join(',\n')};\n`);
  }
  return out.join('');
}
