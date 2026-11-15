// npm run search:reindex
// Rebuilds the snack search index from PostgreSQL: a new index with the current mappings and
// synonyms, every listed snack in it, then the alias moves to it in one step and the old index
// goes. Run it after `npm run search:up` the first time, after changing the mappings or the
// synonyms, or after Elasticsearch was down for a while. Without ELASTICSEARCH_URL there is
// nothing to do: search runs on PostgreSQL.
import { loadEnv } from '../src/config/env.js';
import { moduleDbs } from '../src/db/connection.js';
import { createElastic } from '../src/utils/elastic.js';
import { searchDocs } from '../src/utils/searchSync.js';
import { searchSynonymModel } from '../src/models/catalog/searchSynonym.js';

const env = loadEnv();
const elastic = createElastic(env);
if (!elastic.enabled) {
  console.log('ELASTICSEARCH_URL is not set: search runs on PostgreSQL, nothing to index.');
  process.exit(0);
}
const dbs = moduleDbs(env);
try {
  const started = Date.now();
  const [{ docs }, groups] = await Promise.all([searchDocs(dbs.catalog), searchSynonymModel.groups(dbs.catalog)]);
  const out = await elastic.reindex({ docs, groups });
  console.log(`Indexed ${out.documents} snacks into ${out.index} (alias ${elastic.alias}) with ${groups.length} synonym groups in ${Date.now() - started} ms.`);
  if (out.replaced.length) console.log(`Removed the old index: ${out.replaced.join(', ')}`);
} catch (err) {
  console.error(`Reindex failed: ${err.message}. Is Elasticsearch running (npm run search:up)?`);
  process.exitCode = 1;
} finally {
  await Promise.all(Object.values(dbs).map((d) => d.destroy()));
}
