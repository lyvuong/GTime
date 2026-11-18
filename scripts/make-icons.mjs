// Draws the GTime icon (a guitar pick with a G, inside a clock ring: "Guitar Time") and writes every size the app needs.
// Run with: node scripts/make-icons.mjs
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public');

// `scale` shrinks the artwork towards the middle (maskable icons keep it inside the safe zone);
// `rounded` gives the corners the app-icon squircle; iOS wants a full square and rounds it itself.
function art({ scale = 1, rounded = true, ring = true } = {}) {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const major = i % 3 === 0;
    const a = (i * Math.PI) / 6;
    const r1 = major ? 392 : 410;
    const r2 = 452;
    const x = (r) => (512 + Math.sin(a) * r).toFixed(1);
    const y = (r) => (512 - Math.cos(a) * r).toFixed(1);
    const hot = i === 0;
    return `<line x1="${x(r1)}" y1="${y(r1)}" x2="${x(r2)}" y2="${y(r2)}" stroke="#ffffff" stroke-opacity="${hot ? 1 : major ? 0.95 : 0.6}" stroke-width="${hot ? 34 : major ? 26 : 16}" stroke-linecap="round"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bg" cx="35%" cy="25%" r="105%"><stop offset="0" stop-color="#4f8cff"/><stop offset="0.55" stop-color="#3b3bf0"/><stop offset="1" stop-color="#6d1fd1"/></radialGradient>
    <linearGradient id="pick" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff176"/><stop offset="0.5" stop-color="#ffc107"/><stop offset="1" stop-color="#ff7a00"/></linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="${rounded ? 224 : 0}" fill="url(#bg)"/>
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    ${ring ? ticks : ''}
    <path d="M512 218 C640 218 736 232 790 262 C840 292 846 352 818 424 C772 542 650 724 570 826 C544 858 480 858 454 826 C374 724 252 542 206 424 C178 352 184 292 234 262 C288 232 384 218 512 218 Z" fill="url(#pick)"/>
    <path d="M512 218 C640 218 736 232 790 262 C840 292 846 352 818 424 C772 542 650 724 570 826 C544 858 480 858 454 826 C374 724 252 542 206 424 C178 352 184 292 234 262 C288 232 384 218 512 218 Z" fill="url(#shine)"/>
    <path transform="translate(0 -36)" d="M628 456 A128 128 0 1 0 640 560 L640 560 L520 560" fill="none" stroke="#1b1464" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const png = (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(resolve(out, file));

const main = art();
writeFileSync(resolve(out, 'favicon.svg'), main);
const flat = art({ rounded: false }); // full-bleed square for iOS, which rounds it itself
const safe = art({ rounded: false, scale: 0.78 }); // maskable: everything inside the central 80%

await Promise.all([
  png(main, 32, 'favicon-32.png'),
  png(main, 192, 'icon-192.png'),
  png(main, 512, 'icon-512.png'),
  png(safe, 512, 'icon-maskable-512.png'),
  png(flat, 180, 'apple-touch-icon.png'),
  png(flat, 167, 'apple-touch-icon-167x167.png'),
  png(flat, 152, 'apple-touch-icon-152x152.png'),
  png(flat, 120, 'apple-touch-icon-120x120.png'),
]);
console.log('icons written to', out);
