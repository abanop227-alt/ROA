// Genera le icone PNG della PWA a partire da public/favicon.svg.
// Uso: npm run icons  (richiede Playwright installato globalmente o in locale)
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

function caricaPlaywright() {
  try {
    return createRequire(import.meta.url)('playwright');
  } catch {
    const globale = execSync('npm root -g').toString().trim();
    return createRequire(path.join(globale, 'noop.js'))('playwright');
  }
}
const { chromium } = caricaPlaywright();

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const uscite = [
  { file: 'icon-192.png', size: 192, pad: 0, rounded: true },
  { file: 'icon-512.png', size: 512, pad: 0, rounded: true },
  { file: 'apple-touch-icon.png', size: 180, pad: 0, rounded: false },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.1, rounded: false },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const u of uscite) {
  let s = svg;
  if (!u.rounded) s = s.replace('rx="96"', 'rx="0"');
  if (u.pad) {
    // area sicura per icone maskable: disegno ridotto al centro su fondo pieno
    const k = 1 - u.pad * 2;
    s = s.replace(/<path/g, `<path transform="translate(${256 * (1 - k)} ${256 * (1 - k)}) scale(${k})"`);
  }
  await page.setViewportSize({ width: u.size, height: u.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${s.replace('<svg ', `<svg width="${u.size}" height="${u.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/${u.file}`, import.meta.url).pathname, omitBackground: true });
  console.log('scritto', u.file);
}
await browser.close();
