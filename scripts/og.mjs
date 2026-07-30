#!/usr/bin/env node
// Renders site/og.svg → site/og.png (1200×630) for social previews (X/Facebook
// don't render SVG OG images). Run after editing og.svg: `npm run og`.
// Uses @resvg/resvg-js — a devDependency only; the shipped site and CI stay dependency-free.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { Resvg } = await import('@resvg/resvg-js');

const svg = readFileSync(join(ROOT, 'site/og.svg'));
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
writeFileSync(join(ROOT, 'site/og.png'), png);
console.log(`og.png rendered: ${(png.length / 1024).toFixed(0)} KB`);
