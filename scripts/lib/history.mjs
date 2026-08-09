// history.mjs — the git-mined per-provider change history, shared by build.mjs
// (site/api/v1/history.json + the provider /p/ pages) and the fast integrity
// check (scripts/check-history.mjs + build.test.mjs) so the miner has ONE home.
//
// Deterministic given the history; returns {} if git is unavailable (tarball
// build). The byte-exact batch walk below reads the raw Buffer because the
// header size is in BYTES and slicing a utf8-decoded string by that size
// misaligns on multi-byte characters — the exact bug this code is the fix for.

import { execSync, spawnSync } from 'node:child_process';

export const HISTORY_FIELDS = {
  free_tier: 'free tier', rate_limits: 'rate limits', notes: 'the catch',
  free_type: 'free type', commercial_ok: 'commercial-use terms',
  card_required: 'card requirement', phone_required: 'phone requirement',
  openai_compatible: 'OpenAI compatibility',
};

export const mineProviderHistory = ({ cwd }) => {
  const historyBySlug = {};
  try {
    const log = execSync('git log --reverse --date=short --format=%H%x1f%ad -- data/providers.json', { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 40 }).trim();
    const revs = log ? log.split('\n').map((l) => { const [hash, date] = l.split('\x1f'); return { hash, date }; }) : [];
    // Read every revision's file in ONE process instead of one `git show` spawn
    // per commit (which made the build take minutes on slow checkouts).
    // `git cat-file --batch` resolves each `rev:path` and streams the blobs back
    // in input order — a missing path (e.g. a revision where the file was
    // deleted) answers "<spec> missing" and is skipped, like the old try/catch.
    const specs = revs.map(({ hash }) => `${hash}:data/providers.json`);
    const blobsByRev = new Map();
    if (specs.length) {
      const batch = spawnSync('git', ['cat-file', '--batch'], {
        cwd, input: specs.join('\n') + '\n', maxBuffer: 1024 * 1024 * 40,
      });
      if (batch.error || batch.status !== 0) throw batch.error || new Error(`git cat-file --batch exited ${batch.status}`);
      // Stream format per input spec: "<oid> blob <size>\n<content>\n" | "<spec> missing\n".
      // The size is in BYTES, so walk the raw Buffer (slicing a utf8-decoded
      // string by byte size misaligns on multi-byte characters) and decode only
      // each blob before JSON.parse.
      let i = 0;
      for (const spec of specs) {
        const nl = batch.stdout.indexOf(0x0a, i);
        if (nl === -1) break;
        const header = batch.stdout.toString('utf8', i, nl);
        const m = header.match(/^[0-9a-f]{40} blob (\d+)$/);
        if (!m) { i = nl + 1; continue; } // missing/unparseable header — skip this revision
        const start = nl + 1;
        const size = +m[1];
        try { blobsByRev.set(spec, JSON.parse(batch.stdout.toString('utf8', start, start + size))); } catch { /* corrupt blob — skip */ }
        i = start + size + 1; // +1 consumes the newline that terminates the content
      }
    }
    const prevSnap = {};
    for (const { hash, date } of revs) {
      const parsed = blobsByRev.get(`${hash}:data/providers.json`);
      if (!parsed) continue;
      for (const pp of parsed.providers || []) {
        const prior = prevSnap[pp.slug];
        if (!prior) {
          (historyBySlug[pp.slug] ||= []).push({ date, kind: 'added', text: 'Added to the hub' });
        } else {
          const changed = Object.keys(HISTORY_FIELDS).filter((k) => JSON.stringify(prior[k]) !== JSON.stringify(pp[k]));
          if (changed.length) (historyBySlug[pp.slug] ||= []).push({ date, kind: 'changed', fields: changed, text: `Updated ${changed.map((k) => HISTORY_FIELDS[k]).join(', ')}` });
        }
        prevSnap[pp.slug] = pp;
      }
    }
  } catch (_) { /* no git — provider pages simply omit the history section */ }
  return historyBySlug;
};

// Plausibility invariants shared by scripts/check-history.mjs and the test
// suite. Throws with a specific message on the first violation: a healthy
// dataset has >10 tracked providers, every one with an 'added' event, at least
// one 'changed' event (the dataset evolves), well-formed events, and groq
// present from the beginning. An empty or near-empty history (a broken miner,
// a shallow checkout) trips the first check immediately.
export const assertHistoryPlausible = (history) => {
  const slugs = Object.keys(history);
  if (slugs.length <= 10) throw new Error(`expected >10 providers in the mined history, got ${slugs.length}`);
  let added = 0, changed = 0;
  for (const s of slugs) {
    const events = history[s];
    if (!Array.isArray(events) || events.length === 0) throw new Error(`${s}: history should be a non-empty array`);
    for (const e of events) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error(`${s}: invalid date "${e.date}"`);
      if (e.kind !== 'added' && e.kind !== 'changed') throw new Error(`${s}: invalid kind "${e.kind}"`);
      if (typeof e.text !== 'string' || e.text.length === 0) throw new Error(`${s}: empty text`);
      if (e.kind === 'added') added++;
      if (e.kind === 'changed') changed++;
    }
  }
  if (added < slugs.length) throw new Error(`every tracked provider should have an 'added' event (got ${added})`);
  if (changed === 0) throw new Error('expected at least one "changed" event (the dataset evolved)');
  const groq = history['groq'];
  if (!groq || !groq.some((e) => e.kind === 'added')) throw new Error('groq should be in the history with an added event');
};
