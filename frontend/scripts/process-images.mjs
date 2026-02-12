// Turns generated images into web files (doc 6.2, 22.8). Run: npm run assets:process
// For each crop in assets/crops.json: cut the box out of the source in assets/raw, write
// <name>-400/-800/-1200.webp plus <name>.webp to public/assets, then mark the asset
// ready in assets/manifest.json with its size and checksum and refresh src/assets/ready.json.
// A source that is missing locally is skipped, so the files already in public/assets stay.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { crops, credit } = JSON.parse(readFileSync(root('assets/crops.json'), 'utf8'));
const manifestPath = root('assets/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const byId = new Map(manifest.assets.map((a) => [a.id, a]));
const WIDTHS = [400, 800, 1200];

let done = 0;
for (const c of crops) {
  const asset = byId.get(c.id);
  if (!asset) throw new Error(`${c.id} is not in assets/manifest.json (run npm run assets:manifest)`);
  const src = root(`assets/raw/${c.src}`);
  if (!existsSync(src)) {
    console.warn(`skip ${c.id}: ${c.src} is not in assets/raw on this machine`);
    continue;
  }
  const [x0, y0, x1, y1] = c.box;
  const cut = () => sharp(src).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 });
  const base = root(`public${manifest.base}/${c.out}`);
  mkdirSync(dirname(base), { recursive: true });
  for (const w of WIDTHS) {
    await cut().resize({ width: w, kernel: 'lanczos3' }).webp({ quality: 80, effort: 5 }).toFile(base.replace(/\.webp$/, `-${w}.webp`));
  }
  const main = await cut().resize({ width: 1200, kernel: 'lanczos3' }).webp({ quality: 80, effort: 5 }).toBuffer();
  writeFileSync(base, main);
  Object.assign(asset, { status: 'ready', file: c.out, bytes: main.length, sha256: createHash('sha256').update(main).digest('hex'), credit });
  done++;
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const index = Object.fromEntries(manifest.assets.filter((a) => a.status === 'ready' && a.file).map((a) => [a.id, a.file]));
writeFileSync(root('src/assets/ready.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`processed ${done} of ${crops.length} crops; ${Object.keys(index).length} assets ready`);
