// npm run seed: loads the demo data into PostgreSQL as the migrator role.
import { loadDbEnv as loadEnv } from '../src/config/env.js';
import { migratorDb } from '../src/db/connection.js';
import { seed } from '../src/db/seeds/demo.js';

const db = migratorDb(loadEnv());
try {
  const counts = await seed(db);
  for (const [table, n] of Object.entries(counts)) console.log(`${table.padEnd(26)} ${n}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
