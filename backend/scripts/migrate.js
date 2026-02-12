// npm run migrate | migrate:down | migrate:status
// Runs as the migrator user. "rollback" undoes every applied migration, so up then down
// returns the schemas to empty (prompt 2.1 done check).
import { loadEnv } from '../src/config/env.js';
import { migratorDb } from '../src/db/connection.js';

const command = process.argv[2] ?? 'latest';
const db = migratorDb(loadEnv());

try {
  if (command === 'latest') {
    const [batch, files] = await db.migrate.latest();
    console.log(files.length ? `batch ${batch}: applied ${files.length}\n  ${files.join('\n  ')}` : 'already up to date');
  } else if (command === 'rollback') {
    const [, files] = await db.migrate.rollback(undefined, true);
    console.log(files.length ? `rolled back ${files.length}\n  ${files.join('\n  ')}` : 'nothing to roll back');
  } else if (command === 'status') {
    const [done, pending] = await db.migrate.list();
    console.log(`applied: ${done.length}, pending: ${pending.length}`);
    for (const m of pending) console.log(`  pending ${m.file}`);
  } else {
    throw new Error(`Unknown command "${command}". Use latest, rollback or status.`);
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
