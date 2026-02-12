// npm run db:local (from the repo root): prepares the MySQL 8 already installed on this
// machine (port 3306), so the backend runs without Docker. Does the same as
// infra/mysql/init/01-schemas-and-users.sh does for the container: one schema and one
// least-privilege user per module, plus the migrator.
//
// Asks for the MySQL root password once, with hidden input, and never stores or prints it.
// The module passwords come from infra/.env (created by `npm run setup`). Finally points
// backend/.env at port 3306. Safe to run again.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import mysql from 'mysql2/promise';

const SCHEMAS = ['identity', 'catalog', 'ordering', 'dispatch', 'payment', 'notify'];
const MODULE_USERS = { identity: 'sh_identity', catalog: 'sh_catalog', ordering: 'sh_order', dispatch: 'sh_dispatch', payment: 'sh_payment', notify: 'sh_notify' };
const PORT = Number(process.env.LOCAL_MYSQL_PORT ?? 3306);

const infraEnv = new URL('../../infra/.env', import.meta.url);
const apiEnv = new URL('../.env', import.meta.url);
if (!existsSync(infraEnv) || !existsSync(apiEnv)) {
  console.error('Run `npm run setup` first: it creates infra/.env and backend/.env with local passwords.');
  process.exit(1);
}
const parse = (text) => Object.fromEntries(text.split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const { MIGRATOR_PASSWORD, MODULE_DB_PASSWORD } = parse(readFileSync(infraEnv, 'utf8'));

// Reads one line from the keyboard, printing * for each character, never the text itself.
// Falls back to a plain line read when stdin is not a terminal (for example a pipe).
function askHidden(question) {
  process.stdout.write(question);
  const { stdin } = process;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: stdin });
      rl.once('line', (line) => {
        rl.close();
        resolve(line);
      });
    });
  }
  return new Promise((resolve) => {
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const ENTER = ['\r', '\n'];
    const CTRL_C = '\u0003';
    const BACKSPACE = ['\b', '\u007f'];
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ENTER.includes(ch)) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === CTRL_C) {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (BACKSPACE.includes(ch)) {
          if (value.length) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (ch >= ' ') {
          value += ch;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

const rootPassword = await askHidden(`MySQL root password for 127.0.0.1:${PORT} (input hidden): `);
const conn = await mysql.createConnection({ host: '127.0.0.1', port: PORT, user: 'root', password: rootPassword }).catch((err) => {
  console.error(`Could not sign in as root on port ${PORT}: ${err.code ?? err.message}`);
  process.exit(1);
});

try {
  const run = (sql, params = []) => conn.query(sql, params);
  await run('CREATE DATABASE IF NOT EXISTS snackhub CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  for (const s of SCHEMAS) await run(`CREATE DATABASE IF NOT EXISTS \`${s}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);

  // users can only connect from this machine (127.0.0.1)
  await run("CREATE USER IF NOT EXISTS 'sh_migrator'@'127.0.0.1' IDENTIFIED BY ?", [MIGRATOR_PASSWORD]);
  await run("ALTER USER 'sh_migrator'@'127.0.0.1' IDENTIFIED BY ?", [MIGRATOR_PASSWORD]);
  for (const s of ['snackhub', ...SCHEMAS]) await run(`GRANT ALL PRIVILEGES ON \`${s}\`.* TO 'sh_migrator'@'127.0.0.1'`);

  for (const [schema, user] of Object.entries(MODULE_USERS)) {
    await run(`CREATE USER IF NOT EXISTS '${user}'@'127.0.0.1' IDENTIFIED BY ?`, [MODULE_DB_PASSWORD]);
    await run(`ALTER USER '${user}'@'127.0.0.1' IDENTIFIED BY ?`, [MODULE_DB_PASSWORD]);
    await run(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${schema}\`.* TO '${user}'@'127.0.0.1'`);
  }
  // lets the migrator create the append-only ledger triggers while binary logging is on
  await run('SET PERSIST log_bin_trust_function_creators = 1');
  await run('FLUSH PRIVILEGES');
  console.log(`Schemas and users ready on 127.0.0.1:${PORT}: snackhub, ${SCHEMAS.join(', ')}`);
} catch (err) {
  console.error(`Setup failed: ${err.code ?? ''} ${err.message}`);
  process.exitCode = 1;
} finally {
  await conn.end();
}

if (!process.exitCode) {
  // point the API at the local server; only the DB_HOST and DB_PORT lines change
  const text = readFileSync(apiEnv, 'utf8')
    .replace(/^DB_HOST=.*$/m, 'DB_HOST=127.0.0.1')
    .replace(/^DB_PORT=.*$/m, `DB_PORT=${PORT}`);
  writeFileSync(apiEnv, text);
  console.log(`${fileURLToPath(apiEnv)} now uses 127.0.0.1:${PORT}`);
}
