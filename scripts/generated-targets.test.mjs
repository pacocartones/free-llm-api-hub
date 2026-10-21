// The drift gate compares the files the build writes. Its list used to be written by hand and left pages out;
// now it comes from git. These tests pin the rule and prove, in a real throwaway repository, that a page which
// is committed is compared, that a hand change to it turns the gate red, and that a page nobody committed is reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTmpDir } from './lib/tmp.mjs';
import { isGenerated, generatedTargets, parseNul, STATIC_TARGETS } from './generated-targets.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'generated-targets.mjs');

test('what is generated: the pages, feeds, badges and data under site/; not the scripts, styles, fonts, images or the domain file', () => {
  for (const f of ['site/index.html', 'site/404.html', 'site/sitemap.xml', 'site/robots.txt', 'site/scores.json', 'site/badge-verified.svg',
    'site/coding-tools/index.html', 'site/coding-tools/zed-own-key/index.html', 'site/free-gpu/index.html', 'site/data-policy/index.html',
    'site/agreements/index.html', 'site/coverage/index.html', 'site/submit/index.html']) assert.ok(isGenerated(f), `${f} is compared`);
  for (const f of ['site/og/p/groq.png', 'site/og/guides/x.png', 'site/fonts/jetbrains-mono.woff2', 'site/CNAME', 'site/og.png', 'site/og.svg',
    'site/favicon.svg', 'site/styles.css', 'site/tables.css', 'site/site.js', 'site/explorer.js', 'site/pager.js', 'site/widget.js', 'site/compare.js',
    'README.md', 'data/providers.json']) assert.ok(!isGenerated(f), `${f} is not compared as site output`);
});

test('the targets are the fixed files outside site/ plus every committed generated file under it, sorted, each once', () => {
  const t = generatedTargets(['site/z/index.html', 'site/styles.css', 'site/a/index.html', 'site/og/p/a.png']);
  assert.deepEqual(t, [...STATIC_TARGETS, 'site/a/index.html', 'site/z/index.html']);
  for (const f of ['README.md', 'collections', 'docs/credit-programs.md', 'CITATION.cff', 'data/probe-report.json', 'badge-verified.json', 'derived-fingerprints.json']) {
    assert.ok(STATIC_TARGETS.includes(f), `${f} stays in the list`);
  }
  assert.equal(new Set(t).size, t.length);
});

test('in a repository: a committed page is a target, a hand change to it turns the check red, an uncommitted page is reported, an ignored one is not', () => {
  const dir = makeTmpDir('flah-targets-');
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  const run = (...a) => execFileSync('node', [SCRIPT, ...a], { cwd: dir, encoding: 'utf8' }).trim();
  const write = (rel, text) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'test');
    write('.gitignore', 'site/p/\n');
    write('site/new-page/index.html', '<p>built</p>');
    write('site/styles.css', 'a{}');
    git('add', '-A'); git('commit', '-q', '-m', 'base');
    assert.ok(run().split(' ').includes('site/new-page/index.html'), 'a committed page is compared the day it is committed');
    assert.ok(!run().split(' ').includes('site/styles.css'));
    assert.equal(run('--untracked'), '', 'nothing waiting to be committed');
    // Pretend the build rewrote the page differently from what is committed, which is what a stale commit looks like.
    const targets = run().split(' ');
    git('diff', '--quiet', '--', ...targets); // clean: exit 0
    write('site/new-page/index.html', '<p>changed by hand</p>');
    assert.throws(() => git('diff', '--quiet', '--', ...targets), 'a change to a committed page turns the check red');
    git('checkout', '--', 'site/new-page/index.html');
    // A page the build writes and nobody added, and one the repository ignores.
    write('site/second-page/index.html', '<p>new</p>');
    write('site/p/groq.html', '<p>ignored output</p>');
    assert.equal(run('--untracked'), 'site/second-page/index.html', 'the new page is reported, the ignored one is not');
    git('add', 'site/second-page/index.html');
    assert.equal(run('--untracked'), '');
    // A page whose path has a non-ASCII character: git would quote it without -z and the gate would never see it.
    write('site/café/index.html', '<p>café</p>');
    assert.equal(run('--untracked'), 'site/café/index.html', 'an uncommitted page with an accent in its path is reported');
    git('add', 'site/café/index.html'); git('commit', '-q', '-m', 'accent');
    assert.ok(run().split(' ').includes('site/café/index.html'), 'a committed page with an accent in its path is a target');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseNul splits on NUL, keeps spaces and quotes inside a path, and drops the empty tail', () => {
  assert.deepEqual(parseNul('site/a b/index.html\0site/"q"/index.html\0'), ['site/a b/index.html', 'site/"q"/index.html']);
  assert.deepEqual(parseNul(''), []);
});
