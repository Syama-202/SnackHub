// Makes every brand file from the SnackHub logo artwork: assets/brand/logo-source.png (the
// wordmark with snacks, shop, scooter and home on plain orange). Run: npm run assets:icons.
// The logo is a full circle cut around the artwork's centre, so the wordmark and every snack
// fit inside it; the plain background is mirrored where the circle passes the image edge.
// Writes the round logo, the favicon, the app icons (32, 192, 512, an Apple touch icon and a
// maskable icon with the safe zone) and marks the logo and app-icon entries ready in
// assets/manifest.json.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const pub = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));
const source = fileURLToPath(new URL('../assets/brand/logo-source.png', import.meta.url));
const manifestUrl = new URL('../assets/manifest.json', import.meta.url);

// the circle in the source image: centre and diameter in source pixels
const CIRCLE = { cx: 503.5, cy: 208, d: 420 };
// the artwork's plain background, for the square and maskable icons
const BACKGROUND = '#D28B1F';
const PAD = 60;

const ring = (size) =>
  Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - size / 64}" fill="none" stroke="#fff" stroke-width="${size / 64}" opacity=".9"/></svg>`);
const disc = (size) => Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);

/** The square around the circle, at `size` px, background mirrored past the image edges. */
async function square(size) {
  const extended = await sharp(source).removeAlpha().extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, extendWith: 'mirror' }).toBuffer();
  return sharp(extended)
    .extract({ left: Math.round(CIRCLE.cx - CIRCLE.d / 2) + PAD, top: Math.round(CIRCLE.cy - CIRCLE.d / 2) + PAD, width: CIRCLE.d, height: CIRCLE.d })
    .resize(size, size, { kernel: 'lanczos3' })
    .toBuffer();
}

/** The round logo with a thin white ring, transparent outside the circle. */
const round = async (size) => sharp(await square(size)).composite([{ input: ring(size) }, { input: disc(size), blend: 'dest-in' }]).png({ compressionLevel: 9 }).toBuffer();

const out = (file, buf) => writeFileSync(pub(file), buf);

const logo512 = await round(512);
out('assets/brand/logo-round.png', logo512);
out('assets/brand/logo-round.webp', await sharp(logo512).webp({ quality: 88 }).toBuffer());
out('assets/brand/icon-512.png', logo512);
out('assets/brand/icon-192.png', await round(192));
out('assets/brand/icon-32.png', await round(32));
// Apple rounds the corners itself, so its icon is the full square
out('assets/brand/apple-touch-icon.png', await sharp(await square(180)).png().toBuffer());
// maskable: the circle inside the central 80 percent, background to the edges
out('assets/brand/maskable-512.png', await sharp({ create: { width: 512, height: 512, channels: 4, background: BACKGROUND } }).composite([{ input: await round(410), left: 51, top: 51 }]).png().toBuffer());
// favicon.svg wraps a 64 px copy, so the tab icon is the same round logo
const fav = (await round(64)).toString('base64');
writeFileSync(pub('favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64"><image width="64" height="64" xlink:href="data:image/png;base64,${fav}"/></svg>\n`);
// the earlier drawn wordmark logo is replaced by the round logo
if (existsSync(pub('assets/brand/logo.svg'))) rmSync(pub('assets/brand/logo.svg'));

const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
const files = { logo: 'brand/logo-round.webp', 'app-icon-512': 'brand/icon-512.png', 'app-icon-192': 'brand/icon-192.png', 'app-icon-32': 'brand/icon-32.png' };
for (const a of manifest.assets) {
  const file = files[a.id];
  if (!file) continue;
  const buf = readFileSync(pub(`assets/${file}`));
  Object.assign(a, { status: 'ready', file, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), credit: 'SnackHub logo artwork (AI image supplied by the owner), cut to a circle' });
}
writeFileSync(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Brand files written to public/assets/brand and public/favicon.svg');
