// Builds assets/manifest.json: every image, video and 3D model the UI needs (doc 22.7, 22.8, 25).
// Run: npm run assets:manifest. Existing status, file and checksum fields (and the prompt of an
// image already made) are kept, so the manifest can be regenerated after the catalogue changes
// without losing progress.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { buildSeed } from '../../shared/seed/seed.js';

const OUT = new URL('../assets/manifest.json', import.meta.url);
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { assets: [] };
const keep = new Map(previous.assets.map((a) => [a.id, a]));

const BRAND = 'SnackHub brand brief (doc 25.2): sun yellow #FFC300, orange #FF7A00, red #E23744, white, greys #F3F4F6 and #1F2937. No real brands, no people, no text.';
const snackPrompt = (title, region, temp) =>
  `Studio photo of ${title}, ${region} style, on a steel plate, 45-degree angle, soft window light, plain warm background, no text, no people. (${temp === 'HOT' ? 'hot fried' : 'sweet or dry'} snack, doc 6 and 25.4)`;

const assets = [];
const add = (a) => {
  const old = keep.get(a.id);
  assets.push({
    status: 'needed', // needed -> generated -> processed -> ready
    file: null,
    bytes: null,
    sha256: null,
    credit: 'AI illustration',
    ...a,
    ...(old ? { status: old.status, file: old.file, bytes: old.bytes, sha256: old.sha256, credit: old.credit } : {}),
    // an image already made keeps the prompt and tool it was made with
    ...(old && old.status !== 'needed' ? { prompt: old.prompt, tool: old.tool } : {}),
  });
};

// Brand (doc 25.3)
add({ id: 'logo', kind: 'image', usedBy: ['Navbar', 'Footer', 'ConsoleLayout'], target: 'SVG, recreated as vector', tool: 'ChatGPT image, then vector redraw', prompt: 'doc 25.3 logo prompt' });
for (const s of [512, 192, 32]) add({ id: `app-icon-${s}`, kind: 'image', usedBy: ['manifest.webmanifest'], target: `${s} px PNG`, tool: 'from logo', prompt: 'doc 25.3 app icon prompt' });

// One catalogue image per snack slug (doc 6.2: exactly one per slug, >= 1200 px, < 800 KB, no duplicates)
// plus a transparent cut-out for the pop-up animation (doc 25.4: about 300 px WebP, < 40 KB)
const { products } = buildSeed();
const firstBySlug = new Map();
for (const p of products) if (!firstBySlug.has(p.slug)) firstBySlug.set(p.slug, p);
for (const [slug, p] of [...firstBySlug].sort()) {
  add({ id: `snack-${slug}`, kind: 'image', role: 'catalogue', slug, usedBy: ['ProductCard', 'ProductModal', 'CartDrawer', 'Checkout', 'SellerProducts', 'Navbar search'], target: '>= 1200 px wide, WebP, < 800 KB; served at 400/800/1200', tool: 'Google Whisk or Freepik (doc 25.6)', prompt: snackPrompt(p.title, p.region, p.servingTemp), alt: `${p.title}, ${p.region} style` });
  add({ id: `cutout-${slug}`, kind: 'image', role: 'cutout', slug, usedBy: ['Hero pop-ups', 'VariantPicker'], target: 'about 300 px WebP, transparent, < 40 KB', tool: 'Whisk render + background remover', prompt: 'doc 25.4 cut-out prompt', alt: p.title });
}

// Landing (doc 22.4, 22.9)
add({ id: 'hero-poster', kind: 'image', usedBy: ['Hero'], target: 'WebP, about 80 KB; first paint and WebGL/reduced-motion fallback', tool: 'render of the 3D scene', prompt: 'doc 22.9 poster' });
// Stills for the landing scenes until the videos exist (doc 22.4: poster image as the fallback)
add({ id: 'showcase-hot-still', kind: 'image', usedBy: ['ScrollStory (hot)'], target: '1200 px WebP, < 220 KB', tool: 'Whisk', prompt: 'hot snack serving scene, doc 25.4' });
add({ id: 'showcase-sweet-still', kind: 'image', usedBy: ['ScrollStory (sweet)'], target: '1200 px WebP, < 220 KB', tool: 'Whisk', prompt: 'sweets and dry snacks spread, doc 25.4' });
add({ id: 'shops-kitchen', kind: 'image', usedBy: ['ProductHotspots'], target: '1200 px WebP, < 220 KB', tool: 'Whisk', prompt: 'clean shop kitchen frying snacks, no real brands' });
add({ id: 'hero-loop', kind: 'video', usedBy: ['Hero (optional)'], target: 'MP4 + WebM, 1280 px, 24 fps, no audio, < 2 MB, with poster', tool: 'Google Flow (Veo)', prompt: 'doc 25.5 box-opens loop, 16:9' });
add({ id: 'hero-loop-mobile', kind: 'video', usedBy: ['Hero (optional)'], target: 'MP4 + WebM, 720 px, 9:16, < 2 MB', tool: 'Google Flow (Veo)', prompt: 'doc 25.5 vertical variant' });
add({ id: 'packet-turntable', kind: 'video', usedBy: ['ScrollStory'], target: 'all-keyframe MP4 or 60-90 WebP frames for scroll scrubbing', tool: 'Flow / Whisk Animate', prompt: 'doc 25.7 hero packet turntable' });
add({ id: 'showcase-mixture', kind: 'video', usedBy: ['ScrollStory (hot)'], target: '8 s, scroll-scrub, still-frame fallback', tool: 'Flow', prompt: 'doc 25.7 showcase 1, serving scene' });
add({ id: 'showcase-sweet', kind: 'video', usedBy: ['ScrollStory (sweet)'], target: '8 s, scroll-scrub, still-frame fallback', tool: 'Flow', prompt: 'doc 25.7 showcase 2, traditional sweet' });
add({ id: 'delivery-story', kind: 'video', usedBy: ['DeliveryStory'], target: '8 s illustrated loop, no maps, no live tracking', tool: 'Flow', prompt: 'doc 25.7 25-minute delivery story' });
add({ id: 'rider-pass-by', kind: 'video', usedBy: ['LanePreview (decorative)'], target: '6 s, < 2 MB', tool: 'Flow', prompt: 'doc 25.5 rider pass-by' });

const REGIONS = ['andhra-pradesh', 'telangana', 'tamil-nadu', 'karnataka', 'maharashtra', 'gujarat', 'rajasthan', 'west-bengal', 'delhi'];
for (const r of REGIONS) add({ id: `region-${r}`, kind: 'image', usedBy: ['RegionalDiscovery'], target: '1200x800 WebP, < 200 KB', tool: 'Whisk', prompt: `Regional snack spread for ${r.replace(/-/g, ' ')}; food only, no stereotypes (master prompt 5)` });
const MOODS = ['spicy', 'sweet', 'tea', 'movie', 'childhood', 'new'];
for (const m of MOODS) add({ id: `mood-${m}`, kind: 'video', usedBy: ['MoodTiles'], target: '3 s loop, < 600 KB, with poster', tool: 'Whisk Animate', prompt: 'doc 25.7 mood tile loop' });
for (const s of ['andhra-bold-flavours', 'art-of-murukku', 'regional-mixtures', 'festival-snacks']) add({ id: `story-${s}`, kind: 'image', usedBy: ['Editorial'], target: '1200x900 WebP, < 220 KB', tool: 'Whisk', prompt: 'editorial food photo, doc 22.7 part 11' });

// 3D models (doc 22.9a): placeholders are primitives in code today
add({ id: 'model-snack-box', kind: 'model', usedBy: ['HeroScene'], target: 'GLB, meshopt, <= 1.5 MB, textures <= 1024 px', tool: 'Blender or image-to-3D', prompt: 'glossy SnackHub box with hinged lid', credit: 'MODEL_CREDITS.md' });
add({ id: 'model-rider-scooter', kind: 'model', usedBy: ['LaneScene'], target: 'GLB, meshopt, about 1 MB', tool: 'Kenney / Quaternius (CC0) or Blender', prompt: 'low-poly rider on an orange scooter', credit: 'MODEL_CREDITS.md' });

mkdirSync(new URL('../assets/', import.meta.url), { recursive: true });
writeFileSync(OUT, JSON.stringify({ version: 1, brand: BRAND, base: '/assets', assets }, null, 2) + '\n');
// The app only needs to know which files are ready; the prompts never ship in the bundle
const index = Object.fromEntries(assets.filter((a) => a.status === 'ready' && a.file).map((a) => [a.id, a.file]));
writeFileSync(new URL('../src/assets/ready.json', import.meta.url), JSON.stringify(index, null, 2) + '\n');
const count = (k) => assets.filter((a) => a.kind === k).length;
console.log(`assets/manifest.json: ${assets.length} entries (${count('image')} images, ${count('video')} videos, ${count('model')} models); ${assets.filter((a) => a.status === 'ready').length} ready`);
