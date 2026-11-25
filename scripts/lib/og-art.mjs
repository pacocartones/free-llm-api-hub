// og-art.mjs — the brand H1 artwork of every social image, as SVG strings (no rendering here, so it is testable and the
// fingerprints in lib/og.mjs can hash exactly what is drawn). scripts/og.mjs and scripts/brand-assets.mjs rasterise it
// with resvg and the fonts in tools/og-fonts/ (OG_FONT_FILES): "OG Display" (Roboto Flex 800, narrow), "OG Text"
// (Roboto Flex 400/650) and "OG Mono" (DM Mono 400/500).
//
// Dark ground (#0e0e11), like the brand's near-black theme: social cards sit in feeds of every colour, and the auras'
// hues carry best on dark. The text is the dark theme's ink and muted tokens; the accent is the dark magenta.
import { auraSpec, auraSvg, HUB_AURA, AURA_DASH } from './aura.mjs';
import { wordmarkSvg } from './wordmark.mjs';

export const OG = Object.freeze({ ground: '#0e0e11', panel: '#18181d', line: '#2a2a31', ink: '#f3f3f5', muted: '#a6a7b0', accent: '#ff6b9a', ok: '#4fd08a' });
export const OG_FONT_FILES = ['og-display.ttf', 'og-text-400.ttf', 'og-text-650.ttf', 'og-mono-400.ttf', 'og-mono-500.ttf'];

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word wrap to `max` characters per line, at most `lines` lines (the last one ends with … when cut). */
export function wrap(text, max, lines) {
  const out = [''];
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const cur = out[out.length - 1];
    if (cur && (cur + ' ' + w).length > max) out.push(w); else out[out.length - 1] = cur ? cur + ' ' + w : w;
  }
  if (out.length > lines) { const kept = out.slice(0, lines); kept[lines - 1] += '…'; return kept; }
  return out;
}

/** The spec an aura has in a social image: never faded (the image must not change with the calendar, only with the data). */
export const ogAuraSpec = (p) => auraSpec(p);

/** A grid of auras: `cols` per row inside the box (x, y, w), each a disc of the cell's size with a gap. */
export function auraGridSvg(specs, { x, y, w, cols, gap = 14, id = 'g' }) {
  const cell = (w - gap * (cols - 1)) / cols;
  const r = cell / 2 - 3;
  return specs.map((s, i) => auraSvg(s, {
    cx: x + (i % cols) * (cell + gap) + cell / 2, cy: y + Math.floor(i / cols) * (cell + gap) + cell / 2, r,
    ground: OG.ground, dash: AURA_DASH.dark, id: `${id}${i}`,
  })).join('');
}

/** The rubber stamp of the receipt: rotated, in the ok colour, with a drawn check (no font has to carry ✓). */
export function stampSvg(text, { x, y, size = 22 }) {
  const w = Math.round(text.length * size * 0.6 + size * 2.4), h = Math.round(size * 1.9);
  return `<g transform="translate(${x} ${y}) rotate(-3)"><rect width="${w}" height="${h}" rx="7" fill="none" stroke="${OG.ok}" stroke-width="2.5"/>` +
    `<path d="M${size * 0.55} ${h / 2}l${size * 0.3} ${size * 0.3} ${size * 0.55} -${size * 0.62}" fill="none" stroke="${OG.ok}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${size * 1.75}" y="${h / 2 + size * 0.36}" fill="${OG.ok}" font-family="OG Mono" font-weight="500" font-size="${size}">${esc(text)}</text></g>`;
}

/** The frame every card shares: ground, the hub's aura and the outlined wordmark, the footer URL. */
export function frameSvg(body, { width = 1200, height = 630, footer = 'freellmapihub.com' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${OG.ground}"/>` +
    auraSvg(HUB_AURA, { cx: 104, cy: 96, r: 24, id: 'hub' }) +
    wordmarkSvg({ x: 144, y: 107, size: 30, fill: OG.ink }) +
    body +
    `<text x="80" y="${height - 46}" fill="${OG.muted}" font-family="OG Mono" font-size="22">${esc(footer)}</text></svg>`;
}

/** Label, title and subtitle on the left (the text column is `textW` wide). */
export function copySvg({ label, title, subtitle, textW = 600, titleSize = 84 }) {
  const per = Math.max(10, Math.floor(textW / (titleSize * 0.43)));
  const lines = wrap(title, per, 3);
  const top = 300 - (lines.length - 1) * titleSize * 0.42;
  const titleSvg = lines.map((l, i) => `<text x="78" y="${Math.round(top + i * titleSize * 0.98)}" fill="${OG.ink}" font-family="OG Display" font-size="${titleSize}" letter-spacing="-1.5">${esc(l)}</text>`).join('');
  const subY = Math.round(top + (lines.length - 1) * titleSize * 0.98 + 66);
  const subLines = subtitle ? wrap(subtitle, Math.floor(textW / 14.5), 2) : [];
  return (label ? `<text x="80" y="${Math.round(top - titleSize - 12)}" fill="${OG.accent}" font-family="OG Mono" font-weight="500" font-size="22" letter-spacing="4">${esc(label)}</text>` : '') +
    titleSvg + subLines.map((l, i) => `<text x="80" y="${subY + i * 34}" fill="${OG.muted}" font-family="OG Mono" font-size="24">${esc(l)}</text>`).join('');
}

/** Collections, guides, sections and the model index: copy on the left, art on the right (auras of the members, or the hub's aura). */
export function tagCardSvg({ label, title, subtitle, specs = null }) {
  const art = specs && specs.length
    ? auraGridSvg(specs.slice(0, 16), { x: 800, y: specs.length > 12 ? 150 : 190, w: 320, cols: 4, id: 'm' })
    : auraSvg(HUB_AURA, { cx: 950, cy: 315, r: 150, id: 'big' });
  return frameSvg(copySvg({ label, title, subtitle, textW: 640 }) + art);
}

const LIMIT_LABELS = [['requests_per_minute', 'requests/min'], ['requests_per_second', 'requests/sec'], ['requests_per_day', 'requests/day'],
  ['tokens_per_day', 'tokens/day'], ['requests_per_month', 'requests/month'], ['tokens_per_month', 'tokens/month']];
export const bigNum = (n) => (n >= 1e6 && n % 1e5 === 0 ? `${n / 1e6}M` : n >= 1e4 && n % 1e3 === 0 ? `${n / 1e3}K` : n.toLocaleString('en-US'));

/** Up to three published limits of a provider (the same ones its page shows), as [value, label]. */
export const ogLimits = (p) => LIMIT_LABELS.filter(([k]) => Number.isInteger((p.free_limits || {})[k])).slice(0, 3).map(([k, l]) => [bigNum(p.free_limits[k]), l]);

/** A provider card: name, three numbers (or the plan in words), the receipt stamp; its own aura, large, on the right. */
export function providerCardSvg(p, subtitle) {
  const nums = ogLimits(p);
  const lines = wrap(p.name, 16, 2);
  const size = lines.length > 1 || p.name.length > 12 ? 78 : 96;
  let body = lines.map((l, i) => `<text x="78" y="${238 + i * size * 0.98}" fill="${OG.ink}" font-family="OG Display" font-size="${size}" letter-spacing="-1.5">${esc(l)}</text>`).join('');
  const y = 238 + (lines.length - 1) * size * 0.98;
  if (nums.length) {
    body += nums.map(([v, l], i) => `<text x="${80 + i * 200}" y="${Math.round(y + 112)}" fill="${OG.ink}" font-family="OG Display" font-size="64">${esc(v)}</text>` +
      `<text x="${82 + i * 200}" y="${Math.round(y + 146)}" fill="${OG.muted}" font-family="OG Mono" font-size="20">${esc(l)}</text>`).join('');
    body += `<text x="80" y="${Math.round(y + 196)}" fill="${OG.muted}" font-family="OG Mono" font-size="22">${esc(subtitle)}</text>`;
  } else {
    body += wrap(subtitle, 40, 2).map((l, i) => `<text x="80" y="${Math.round(y + 84 + i * 34)}" fill="${OG.muted}" font-family="OG Mono" font-size="24">${esc(l)}</text>`).join('');
  }
  if (p.verified) body += stampSvg('verified · sourced', { x: 80, y: 486, size: 22 });
  body += auraSvg(ogAuraSpec(p), { cx: 948, cy: 318, r: 158, ground: OG.ground, dash: AURA_DASH.dark, id: 'p' });
  return frameSvg(body);
}
