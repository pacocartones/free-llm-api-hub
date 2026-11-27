#!/usr/bin/env node
// run.mjs — dev-only screenshot runner (docs/screenshots.md). Builds site/ with a pinned clock, serves it on a free
// local port and writes one PNG per shot in shots.json to the output directory (gitignored). Nothing leaves the
// machine: every request to another origin is blocked, so analytics, fonts from elsewhere or embeds never load.
//
//   node tools/screenshots/run.mjs                      build, then every shot
//   node tools/screenshots/run.mjs --only=S1,S7         only these shot ids
//   node tools/screenshots/run.mjs --no-build           use site/ as it is
//   node tools/screenshots/run.mjs --out=/tmp/shots     another output directory (default tools/screenshots/out)
//   node tools/screenshots/run.mjs --scale=1            device scale factor (default 2)
//
// Deterministic: the date comes from SCREENSHOT_DATE (YYYY-MM-DD; default: the dataset's as-of date), pinned at 12:00
// UTC in the build and in every page; motion is reduced and transitions are switched off; fonts must have loaded
// before the capture. Needs `npm ci --ignore-scripts` in tools/screenshots and a Chrome binary (CHROME_PATH, or one
// of the usual locations).
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pinClock } from './fixed-date.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SITE = join(ROOT, 'site');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
  if (!m) { console.error(`Unknown argument: ${a}`); process.exit(2); }
  return [m[1], m[2] ?? true];
}));
const OUT = args.out ? normalize(String(args.out)) : join(HERE, 'out');
const SCALE = Number(args.scale ?? 2);
const only = args.only ? new Set(String(args.only).split(',').map((s) => s.trim().toUpperCase())) : null;

const { datasetAsOf } = await import(pathToFileURL(join(ROOT, 'scripts/lib/release-stamp.mjs')).href);
const DATE = process.env.SCREENSHOT_DATE || datasetAsOf(JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8')));
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error(`SCREENSHOT_DATE must be YYYY-MM-DD, got ${DATE}`); process.exit(2); }
const NOW = `${DATE}T12:00:00.000Z`;

const config = JSON.parse(readFileSync(join(HERE, 'shots.json'), 'utf8'));
const shots = config.shots.filter((s) => !only || only.has(s.id));
if (!shots.length) { console.error('No shot matches --only.'); process.exit(2); }
for (const s of shots) {
  if (!s.id || !s.name || !s.path?.startsWith('/') || !s.viewport?.width || !s.viewport?.height || !['light', 'dark'].includes(s.theme)) {
    console.error(`Invalid shot in shots.json: ${JSON.stringify(s)}`); process.exit(2);
  }
}

// ---------- build ----------
if (!args['no-build']) {
  console.log(`Building site/ with the clock pinned to ${NOW}…`);
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(HERE, 'fixed-date.mjs')).href, join(ROOT, 'scripts/build.mjs')],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, SCREENSHOT_NOW: NOW } });
  if (r.status !== 0) { console.error('Build failed.'); process.exit(1); }
}

// ---------- serve ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.yaml': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json' };
function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let file = join(SITE, clean);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return file.startsWith(SITE) && existsSync(file) ? file : null;
}
const server = createServer((req, res) => {
  const file = resolveFile(req.url);
  if (!file) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

// ---------- browser ----------
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const fixed = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const pw = existsSync('/opt/pw-browsers') ? readdirSync('/opt/pw-browsers').filter((d) => /^chromium-\d+$/.test(d))
    .map((d) => join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')) : [];
  return [...fixed, ...pw].find((p) => existsSync(p));
}
const executablePath = chromePath();
if (!executablePath) { console.error('No Chrome found: set CHROME_PATH.'); process.exit(1); }
let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; } catch {
  console.error('puppeteer-core is missing: run `npm ci --ignore-scripts` in tools/screenshots.'); process.exit(1);
}

// Switch off animations, transitions and the text caret, so a capture never lands mid-motion.
const STILL_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text', '--lang=en-US'],
});
mkdirSync(OUT, { recursive: true });
const manifest = { date: DATE, now: NOW, scale: SCALE, chrome: await browser.version(), shots: [] };
let failed = 0;
try {
  for (const shot of shots) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: shot.viewport.width, height: shot.viewport.height, deviceScaleFactor: SCALE });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: shot.theme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.emulateTimezone('UTC');
      await page.evaluateOnNewDocument(pinClock, NOW);
      await page.evaluateOnNewDocument((theme) => { try { localStorage.setItem('theme', theme); } catch { /* storage off */ } }, shot.theme);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const url = req.url();
        if (url.startsWith(base) || url.startsWith('data:') || url.startsWith('blob:')) req.continue(); else req.abort('blockedbyclient');
      });
      const res = await page.goto(base + shot.path, { waitUntil: 'networkidle0', timeout: 30000 });
      if (!res || !res.ok()) throw new Error(`HTTP ${res ? res.status() : 'no response'}`);
      await page.addStyleTag({ content: STILL_CSS });
      if (shot.waitFor) await page.waitForSelector(shot.waitFor, { visible: true, timeout: 10000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      const file = join(OUT, `${shot.id}-${shot.name}.png`);
      if (shot.clip) {
        const el = await page.$(shot.clip);
        if (!el) throw new Error(`clip selector not found: ${shot.clip}`);
        await el.screenshot({ path: file });
      } else {
        if (shot.scrollTo) {
          const found = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16);
            return true;
          }, shot.scrollTo);
          if (!found) throw new Error(`scrollTo selector not found: ${shot.scrollTo}`);
        }
        await page.screenshot({ path: file, fullPage: Boolean(shot.fullPage) });
      }
      manifest.shots.push({ id: shot.id, file: relative(OUT, file), path: shot.path, theme: shot.theme, viewport: shot.viewport });
      console.log(`  ${shot.id}  ${shot.path}  (${shot.theme}, ${shot.viewport.width}×${shot.viewport.height})  →  ${relative(ROOT, file) || file}`);
    } catch (err) {
      failed++;
      console.error(`  ${shot.id}  ${shot.path}  FAILED: ${err.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${manifest.shots.length} screenshot(s) in ${OUT} (date ${DATE}).`);
if (failed) { console.error(`${failed} shot(s) failed.`); process.exit(1); }
