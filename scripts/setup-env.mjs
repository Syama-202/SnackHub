// Creates infra/.env and backend/.env with random local passwords if they do not exist yet,
// and adds any key introduced later (for example JWT_SECRET) to an existing backend/.env.
// Never prints a secret and never changes a key that is already set (doc 0.3: secrets live
// only in env files).
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const secret = (bytes = 18) => randomBytes(bytes).toString('base64url');
const keysOf = (path) =>
  new Set(readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => l.slice(0, l.indexOf('='))));

function write(path, content) {
  if (existsSync(path)) {
    console.log(`${fileURLToPath(path)} already exists, left unchanged`);
    return false;
  }
  writeFileSync(path, content, { mode: 0o600 });
  console.log(`${fileURLToPath(path)} created`);
  return true;
}

const infraPath = new URL('../infra/.env', import.meta.url);
const backendEnvPath = new URL('../backend/.env', import.meta.url);

let migrator, modules;
if (existsSync(infraPath)) {
  // Reuse the database passwords already set for the containers
  const env = Object.fromEntries(readFileSync(infraPath, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  migrator = env.MIGRATOR_PASSWORD;
  modules = env.MODULE_DB_PASSWORD;
  console.log(`${fileURLToPath(infraPath)} already exists, its passwords are reused`);
} else {
  migrator = secret();
  modules = secret();
  write(infraPath, [
    '# Local only. Created by `npm run setup`.',
    `MYSQL_ROOT_PASSWORD=${secret()}`,
    `MIGRATOR_PASSWORD=${migrator}`,
    `MODULE_DB_PASSWORD=${modules}`,
    'MINIO_ROOT_USER=snackhub',
    `MINIO_ROOT_PASSWORD=${secret()}`,
    '',
  ].join('\n'));
}

// Keys added after the first setup, with how to fill each one
const LATER_KEYS = () => [
  ['JWT_SECRET', secret(48)],
  // paste the Web client ID from Google Cloud (see README, "Google sign-in")
  ['GOOGLE_CLIENT_ID', ''],
  ['COOKIE_SECURE', 'false'],
  // encrypts the admin TOTP secrets (doc 16.3): 32 random bytes
  ['MFA_KEY', randomBytes(32).toString('base64url')],
];

const created = write(backendEnvPath, [
  '# Local only. Created by `npm run setup`. See backend/.env.example for every key.',
  'NODE_ENV=development',
  'PORT=4000',
  'LOG_LEVEL=info',
  'CORS_ORIGINS=http://localhost:5180,http://localhost:5181',
  'DB_HOST=127.0.0.1',
  'DB_PORT=3307',
  'DB_MIGRATOR_USER=sh_migrator',
  `DB_MIGRATOR_PASSWORD=${migrator}`,
  `DB_MODULE_PASSWORD=${modules}`,
  ...LATER_KEYS().map(([k, v]) => `${k}=${v}`),
  '',
].join('\n'));

if (!created) {
  const have = keysOf(backendEnvPath);
  const missing = LATER_KEYS().filter(([k]) => !have.has(k));
  if (missing.length) {
    const text = readFileSync(backendEnvPath, 'utf8');
    appendFileSync(backendEnvPath, (text.endsWith('\n') ? '' : '\n') + missing.map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
    console.log(`${fileURLToPath(backendEnvPath)}: added ${missing.map(([k]) => k).join(', ')}`);
  }
}
