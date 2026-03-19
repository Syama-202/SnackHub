// Makes the missing snack photos with FLUX.1-schnell on Hugging Face (doc 25.6), one per slug.
// Run: npm run assets:generate [-- slug ...] [-- --seed=7]. Reads HF_TOKEN from frontend/.env.local. With no slugs, every catalogue
// image that is not ready and has no file in assets/raw/flux yet is made. Naming slugs makes
// those again (after a bad image). Each prompt is the snack's look from assets/looks.json plus
// the house style. Images go to assets/raw/flux (not committed) and a full-frame crop is added
// to assets/crops.json; then run npm run assets:process and check every image by eye.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SPACE = 'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api';
const CREDIT = 'AI image (FLUX.1-schnell on Hugging Face)';
const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { style, looks } = JSON.parse(readFileSync(root('assets/looks.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(root('assets/manifest.json'), 'utf8'));
const cropsFile = JSON.parse(readFileSync(root('assets/crops.json'), 'utf8'));

const args = process.argv.slice(2);
const seedArg = Number(args.find((a) => a.startsWith('--seed='))?.slice(7));
const named = args.filter((a) => !a.startsWith('--'));
const rawPath = (slug) => root(`assets/raw/flux/${slug}.webp`);
const todo = named.length
  ? named
  : manifest.assets.filter((a) => a.role === 'catalogue' && a.status !== 'ready' && !existsSync(rawPath(a.slug))).map((a) => a.slug);

// same seed for a slug every time, so a run can be repeated
const seedFor = (slug) => (Number.isFinite(seedArg) ? seedArg : [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 1_000_000);

// With HF_TOKEN (a read token, kept in frontend/.env.local and never printed) the Space runs
// on the account's free daily GPU time; without one, on the small anonymous allowance.
const TOKEN = process.env.HF_TOKEN;
const auth = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

async function generate(prompt, seed) {
  const start = await fetch(`${SPACE}/call/infer`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [prompt, seed, false, 1024, 1024, 4] }),
  });
  if (!start.ok) throw new Error(`start failed: HTTP ${start.status}`);
  const { event_id: id } = await start.json();
  const stream = await (await fetch(`${SPACE}/call/infer/${id}`, { headers: auth })).text();
  const event = /event: (\w+)/.exec(stream)?.[1];
  const data = /data: (.*)/.exec(stream)?.[1];
  // the Space reports a used-up GPU quota as an error with no message
  if (event !== 'complete') throw new Error(data && data !== 'null' ? `model said ${event}: ${data}` : TOKEN ? 'free GPU quota used up for now; it refills within a day, run again later' : 'free GPU quota used up (add HF_TOKEN for a bigger daily allowance)');
  const [file] = JSON.parse(data);
  const img = await fetch(file.url, { headers: auth });
  if (!img.ok) throw new Error(`download failed: HTTP ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

mkdirSync(root('assets/raw/flux'), { recursive: true });
let made = 0;
for (const slug of todo) {
  const look = looks[slug];
  const asset = manifest.assets.find((a) => a.id === `snack-${slug}`);
  if (!look || !asset) {
    console.warn(`skip ${slug}: no look in assets/looks.json or not in the manifest`);
    continue;
  }
  const prompt = `${look}. ${style}.`;
  try {
    const image = await generate(prompt, seedFor(slug));
    writeFileSync(rawPath(slug), await sharp(image).webp({ quality: 92 }).toBuffer());
  } catch (err) {
    console.error(`${slug}: ${err.message}`);
    if (/quota|exceeded|429|402/i.test(err.message)) break; // free GPU time or credits used up; run again later
    continue;
  }
  asset.prompt = prompt;
  asset.tool = 'FLUX.1-schnell on Hugging Face (doc 25.6)';
  const crop = { id: asset.id, src: `flux/${slug}.webp`, box: [0, 0, 1024, 1024], out: `snacks/${slug}.webp`, credit: CREDIT };
  cropsFile.crops = cropsFile.crops.filter((c) => c.id !== asset.id).concat(crop);
  made++;
  console.log(`${slug}: done`);
}

writeFileSync(root('assets/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
// one crop per line, as the file was written by hand
const { crops, ...head } = cropsFile;
const line = (c) => `    ${JSON.stringify(c).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/,(\d)/g, ', $1')}`;
writeFileSync(root('assets/crops.json'), `${JSON.stringify(head, null, 2).slice(0, -2)},\n  "crops": [\n${crops.map(line).join(',\n')}\n  ]\n}\n`);
console.log(`made ${made} of ${todo.length}; check each by eye, then npm run assets:process`);
