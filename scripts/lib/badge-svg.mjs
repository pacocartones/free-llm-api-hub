// badge-svg.mjs — a flat two-part badge as an SVG file, from the same {label, message, color} that the
// shields.io endpoint files carry. The site serves this file itself, so a page never asks a third party
// for its footer badge. Deterministic: the same input gives the same bytes.

import { escapeAttr } from './html.mjs';

// Verdana advance widths in thousandths of an em; 11 px text. Anything not listed falls back to a typical width.
const W = {
  a: 601, b: 623, c: 521, d: 623, e: 596, f: 352, g: 623, h: 633, i: 274, j: 344, k: 592, l: 274, m: 973,
  n: 633, o: 607, p: 623, q: 623, r: 427, s: 521, t: 394, u: 633, v: 592, w: 818, x: 592, y: 592, z: 525,
  ' ': 352, '/': 427, '<': 838, '>': 838, '%': 1002, '.': 364, '-': 408, '+': 838, ':': 454,
};
const DIGIT = 636;
const CAPITAL = 700;
const FALLBACK = 600;
const FONT_PX = 11;

// The shields.io colour names that the build uses, with their hex values.
export const COLORS = {
  brightgreen: '#4c1', green: '#97ca00', yellowgreen: '#a4a61d', yellow: '#dfb317',
  orange: '#fe7d37', red: '#e05d44', lightgrey: '#9f9f9f', blue: '#007ec6',
};

export const textWidth = (s) => {
  let em = 0;
  for (const ch of String(s)) {
    if (ch >= '0' && ch <= '9') em += DIGIT;
    else if (ch >= 'A' && ch <= 'Z') em += CAPITAL;
    else em += W[ch] ?? FALLBACK;
  }
  return Math.round((em / 1000) * FONT_PX);
};

/** { svg, width, height } for a badge. Throws on an unknown colour name so a typo cannot ship a grey badge unnoticed. */
export function badgeSvg({ label, message, color }) {
  const fill = COLORS[color] || (/^#[0-9a-f]{3,6}$/i.test(color) ? color : null);
  if (!fill) throw new Error(`badge colour not known: ${color}`);
  const lw = textWidth(label) + 10;
  const mw = textWidth(message) + 10;
  const width = lw + mw;
  const height = 20;
  const lx = lw / 2;
  const mx = lw + mw / 2;
  const title = `${label}: ${message}`;
  // textLength pins each text to the width the layout was computed with, so a font that is wider or narrower than Verdana
  // squeezes or spaces the letters instead of overflowing its half (what shields.io does).
  const fit = (t) => ` textLength="${textWidth(t)}" lengthAdjust="spacing"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${escapeAttr(title)}"><title>${escapeAttr(title)}</title>` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
    `<clipPath id="r"><rect width="${width}" height="${height}" rx="3" fill="#fff"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${lw}" height="${height}" fill="#555"/><rect x="${lw}" width="${mw}" height="${height}" fill="${fill}"/><rect width="${width}" height="${height}" fill="url(#s)"/></g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${FONT_PX}">` +
    `<text x="${lx}" y="15" fill="#010101" fill-opacity=".3"${fit(label)}>${escapeAttr(label)}</text><text x="${lx}" y="14"${fit(label)}>${escapeAttr(label)}</text>` +
    `<text x="${mx}" y="15" fill="#010101" fill-opacity=".3"${fit(message)}>${escapeAttr(message)}</text><text x="${mx}" y="14"${fit(message)}>${escapeAttr(message)}</text></g></svg>\n`;
  return { svg, width, height };
}

// The Cálida receipt as a 20 px badge: the perforated ticket (lib/stamp.mjs STAMP_SHAPES.ticket, scaled down), the
// apricot fill with a semicircular notch cut on each side, a drawn check, a dashed cut line and the text in the accent.
// Not turned, so it sits on a text line like any badge. The site's own footer badge (site/badge-verified.svg) uses it.
export const TICKET = Object.freeze({ fill: '#ffebd9', ink: '#9c4a00', notch: 4, stub: 19 });

/** { svg, width, height } for a ticket badge reading "<label> <message>", e.g. "verified 76/77". */
export function ticketBadgeSvg({ label, message }) {
  const text = `${label} ${message}`;
  const tw = textWidth(text);
  const width = TICKET.stub + 6 + tw + 9;
  const height = 20;
  const title = `${label}: ${message}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" role="img" aria-label="${escapeAttr(title)}"><title>${escapeAttr(title)}</title>` +
    `<mask id="n"><rect width="${width}" height="${height}" fill="#fff"/><circle cy="10" r="${TICKET.notch}" fill="#000"/><circle cx="${width}" cy="10" r="${TICKET.notch}" fill="#000"/></mask>` +
    `<rect width="${width}" height="${height}" rx="3" fill="${TICKET.fill}" mask="url(#n)"/>` +
    `<path d="M${TICKET.stub} 3.5V16.5" stroke="${TICKET.ink}" stroke-width="1.2" stroke-dasharray="2 1.6"/>` +
    `<path d="M7 10.3l2.3 2.3 4.3-4.7" fill="none" stroke="${TICKET.ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<text x="${TICKET.stub + 6 + tw / 2}" y="14" fill="${TICKET.ink}" text-anchor="middle" font-family="DM Mono,ui-monospace,Menlo,Consolas,monospace" font-weight="500" font-size="${FONT_PX}" textLength="${tw}" lengthAdjust="spacing">${escapeAttr(text)}</text></svg>\n`;
  return { svg, width, height };
}
