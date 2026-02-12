// Load api/.env for the database tests when it exists (created by `npm run setup`).
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // no .env: the database tests skip themselves
}
