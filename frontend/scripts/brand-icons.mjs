// Makes every brand file from the one logo mark (doc 25.3): public/assets/brand/mark.svg.
// Run: npm run assets:icons. Writes the favicon, the full logo with the wordmark, the app
// icons (32, 192, 512, an Apple touch icon and a maskable icon with the safe zone) and marks
// the logo and app-icon entries ready in assets/manifest.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const pub = (p) => new URL(`../public/${p}`, import.meta.url);
const manifestUrl = new URL('../assets/manifest.json', import.meta.url);
const mark = readFileSync(pub('assets/brand/mark.svg'), 'utf8');
const inner = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

// full logo: the mark and the wordmark, "Snack" in the brand gradient and "Hub" in grey 800
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 248 64">
  <defs><linearGradient id="sh-word" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF9A00"/><stop offset=".6" stop-color="#FF7A00"/><stop offset="1" stop-color="#E23744"/></linearGradient></defs>
  <svg viewBox="0 0 64 64" width="64" height="64">${inner}</svg>
  <text x="76" y="44" font-family="Outfit, Inter, 'Segoe UI', Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="-1"><tspan fill="url(#sh-word)">Snack</tspan><tspan fill="#1F2937">Hub</tspan></text>
</svg>
`;

// maskable: square, gradient to the edges, the drawing inside the central 80 percent
const maskable = mark
  .replace('<rect width="64" height="64" rx="18" fill="url(#sh-bg)"/>', '<rect width="64" height="64" fill="url(#sh-bg)"/><g transform="translate(6.4 6.4) scale(.8)">')
  .replace(/<\/svg>\s*$/, '</g></svg>\n');
const square = mark.replace('rx="18" fill="url(#sh-bg)"', 'fill="url(#sh-bg)"');

writeFileSync(pub('favicon.svg'), mark);
writeFileSync(pub('assets/brand/logo.svg'), logo);

const png = (svg, size, file) => sharp(Buffer.from(svg), { density: Math.ceil((size / 64) * 72 * 2) }).resize(size, size).png({ compressionLevel: 9 }).toFile(fileURLToPath(pub(`assets/brand/${file}`)));
await Promise.all([
  png(mark, 32, 'icon-32.png'),
  png(mark, 192, 'icon-192.png'),
  png(mark, 512, 'icon-512.png'),
  png(square, 180, 'apple-touch-icon.png'),
  png(maskable, 512, 'maskable-512.png'),
]);

const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
const files = { logo: 'brand/logo.svg', 'app-icon-512': 'brand/icon-512.png', 'app-icon-192': 'brand/icon-192.png', 'app-icon-32': 'brand/icon-32.png' };
for (const a of manifest.assets) {
  const file = files[a.id];
  if (!file) continue;
  const buf = readFileSync(pub(`assets/${file}`));
  Object.assign(a, { status: 'ready', file, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), credit: 'Vector drawing (SnackHub brand)' });
}
writeFileSync(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Brand files written to public/assets/brand and public/favicon.svg');
