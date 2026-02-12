// Validates the media in public/assets against assets/manifest.json (doc 6.2, 22.8).
// Run: npm run assets:check. Fails when a file marked ready is missing, too large,
// or byte-identical to another asset (the "49 snacks, 18 images" problem).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8'));
const LIMITS = { catalogue: 800_000, cutout: 40_000, video: 2_000_000, model: 1_500_000 };
const problems = [];
const seen = new Map();

for (const a of manifest.assets) {
  if (a.status !== 'ready') continue;
  const path = new URL(`../public${manifest.base}/${a.file}`, import.meta.url);
  if (!a.file || !existsSync(path)) {
    problems.push(`${a.id}: marked ready but ${a.file || '(no file)'} is missing`);
    continue;
  }
  const bytes = statSync(path).size;
  const limit = LIMITS[a.role] || LIMITS[a.kind];
  if (limit && bytes > limit) problems.push(`${a.id}: ${bytes} bytes, over the ${limit} byte budget`);
  const sha = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (seen.has(sha)) problems.push(`${a.id}: same file as ${seen.get(sha)} (one image per slug)`);
  seen.set(sha, a.id);
  if (a.sha256 && a.sha256 !== sha) problems.push(`${a.id}: checksum changed; give a new cut a new file name (doc 22.8)`);
}

const slugs = manifest.assets.filter((a) => a.role === 'catalogue');
const ready = slugs.filter((a) => a.status === 'ready').length;
console.log(`${manifest.assets.length} assets in the manifest; catalogue images ready for ${ready} of ${slugs.length} snacks`);
if (problems.length) {
  console.error(problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('No problems found.');
