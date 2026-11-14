#!/usr/bin/env node
// generated-targets.mjs — the files the build writes and that are committed, so the drift gate can compare them.
//
// The list used to be written by hand in two places (package.json `check` and the "Generated files must be in
// sync" step of verify.yml), and a page that the build began to write was left out of it (coding-tools, free-gpu,
// data-policy, agreements, coverage, submit). Now the part under site/ comes from `git ls-files site/`: every
// committed page, feed, badge and data file is compared, and a new one is covered the day it is committed.
//
//   node scripts/generated-targets.mjs              the targets, one line, separated by spaces
//   node scripts/generated-targets.mjs --untracked  the site/ files the build wrote that are neither committed nor
//                                                   ignored (a new page nobody ran `git add` on); empty when none
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Files outside site/ that the build writes (README.md, collections/, the docs, the badges and the fingerprints).
export const STATIC_TARGETS = [
  'README.md', 'collections', 'docs/credit-programs.md', 'CITATION.cff', 'data/probe-report.json',
  'badge-verified.json', 'derived-fingerprints.json',
];

// Under site/ these are committed but are not output of the build: hand-written scripts and styles, the fonts,
// the images made by `npm run og` (they have their own check, scripts/check-og.mjs) and the domain file.
const NOT_BUILD_OUTPUT = [
  /^site\/og\//, /^site\/fonts\//, /^site\/CNAME$/, /^site\/og\.(png|svg)$/, /^site\/favicon\.svg$/,
  /\.(js|css)$/,
];

export const isGenerated = (path) => path.startsWith('site/') && !NOT_BUILD_OUTPUT.some((re) => re.test(path));

export const generatedTargets = (trackedSiteFiles) => [...STATIC_TARGETS, ...trackedSiteFiles.filter(isGenerated).sort()];

// `-z`: git ends each path with a NUL and writes it as it is. Without it git puts a path with a non-ASCII
// character in quotes ("caf\303\251.html"), which matches no file, and the gate would skip it without a word.
export const parseNul = (out) => out.split('\0').filter(Boolean);
const git = (args) => parseNul(execFileSync('git', args, { encoding: 'utf8' }));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--untracked')) {
    console.log(git(['ls-files', '-z', '--others', '--exclude-standard', '--', 'site/']).filter(isGenerated).join(' '));
  } else {
    console.log(generatedTargets(git(['ls-files', '-z', '--', 'site/'])).join(' '));
  }
}
