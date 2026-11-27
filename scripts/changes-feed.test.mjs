// The Atom feed of provider changes (site/changes.atom) and the latest-week summary of /changes/: lib/changes.mjs.
// The feed is checked against the essentials of RFC 4287 with a small parser, so no XML dependency is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenFieldChanges, groupChangesByWeek, changesAtom, atomId, latestWeek, latestWeekSentence, summaryValue, ATOM_PATH } from './lib/changes.mjs';
import { projectApiV1Changes } from './lib/api-v1.mjs';

const SITE = 'https://example.test';
const ev = (date, field, from, to) => ({ date, kind: 'changed', fields: [field], text: 't', changes: [{ field, from, to }] });

// A tiny XML element tree: enough to read the Atom elements and their attributes. Throws on unbalanced markup.
function parseXml(xml) {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(body))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      assert.doesNotMatch(m[5], /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/, `bare '&' in "${m[5].slice(0, 60)}"`);
      top.text += m[5];
      continue;
    }
    if (m[1]) { assert.equal(stack.pop().name, m[2], `mismatched </${m[2]}>`); continue; }
    const attrs = Object.fromEntries([...m[3].matchAll(/([\w:.-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    const el = { name: m[2], attrs, children: [], text: '' };
    top.children.push(el);
    if (!m[4]) stack.push(el);
  }
  assert.equal(stack.length, 1, 'every element is closed');
  assert.equal(root.children.length, 1, 'one root element');
  return root.children[0];
}
const kids = (el, name) => el.children.filter((c) => c.name === name);
const one = (el, name) => {
  const list = kids(el, name);
  assert.equal(list.length, 1, `<${el.name}> has exactly one <${name}>`);
  return list[0];
};
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ABS_IRI = /^[a-z][a-z0-9+.-]*:\S+$/i;

/** The essentials of RFC 4287 for a feed document; returns the parsed root. */
function assertAtomEssentials(xml) {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  const feed = parseXml(xml);
  assert.equal(feed.name, 'feed');
  assert.equal(feed.attrs.xmlns, 'http://www.w3.org/2005/Atom');
  // atom:feed MUST contain exactly one id, title and updated (4.1.1)
  assert.match(one(feed, 'id').text, ABS_IRI, 'feed id is an absolute IRI');
  assert.ok(one(feed, 'title').text.trim(), 'feed title is not empty');
  assert.match(one(feed, 'updated').text, RFC3339, 'feed updated is an RFC 3339 date-time');
  // an author on the feed covers every entry without one (4.1.1); the author MUST have a name (3.2.1)
  const authors = kids(feed, 'author');
  assert.ok(authors.length >= 1, 'the feed has an author');
  for (const a of authors) assert.ok(one(a, 'name').text.trim(), 'author name');
  // SHOULD carry rel="self"; at most one rel="alternate" per type and hreflang (4.1.1)
  const links = kids(feed, 'link');
  const self = links.filter((l) => l.attrs.rel === 'self');
  assert.equal(self.length, 1, 'one rel="self" link');
  assert.match(self[0].attrs.href, ABS_IRI);
  const altTypes = links.filter((l) => (l.attrs.rel || 'alternate') === 'alternate').map((l) => l.attrs.type);
  assert.equal(new Set(altTypes).size, altTypes.length, 'one alternate link per type');
  for (const l of links) assert.ok(l.attrs.href, 'every link has an href');
  const ids = new Set();
  let newest = '';
  for (const e of kids(feed, 'entry')) {
    // atom:entry MUST contain exactly one id, title and updated, and content or an alternate link (4.1.2)
    const id = one(e, 'id').text;
    assert.match(id, ABS_IRI, 'entry id is an absolute IRI');
    assert.ok(!ids.has(id), `entry id ${id} is unique`);
    ids.add(id);
    assert.ok(one(e, 'title').text.trim(), 'entry title is not empty');
    const updated = one(e, 'updated').text;
    assert.match(updated, RFC3339, 'entry updated is an RFC 3339 date-time');
    if (updated > newest) newest = updated;
    const alt = kids(e, 'link').filter((l) => (l.attrs.rel || 'alternate') === 'alternate');
    assert.ok(kids(e, 'content').length === 1 || alt.length >= 1, 'entry has content or an alternate link');
    for (const l of alt) assert.match(l.attrs.href, ABS_IRI);
    assert.ok(kids(e, 'summary').length <= 1, 'at most one summary');
  }
  if (newest) assert.equal(one(feed, 'updated').text, newest, "the feed's updated is its newest entry's");
  return feed;
}

const history = {
  alpha: [{ date: '2026-01-01', kind: 'added', text: 'Added' }, ev('2026-10-05', 'rate_limits', '1', '2'), ev('2026-10-08', 'free_type', 'renewing-quota', 'trial-credit')],
  beta: [ev('2026-10-08', 'card_required', false, null), ev('2026-09-30', 'commercial_ok', null, 'conditional')],
  tj: [ev('2026-10-07', 'free_tier', 'a & b', '<b>c</b>')],
};
const names = { alpha: 'Alpha', beta: 'Beta', tj: 'Tom & Jerry <script>' };
const flat = projectApiV1Changes(flattenFieldChanges(history, names));
const weeks = groupChangesByWeek(flat, { weeks: 12 });

test('the Atom feed meets the RFC 4287 essentials: one entry per week, stable tag ids, dates from the data', () => {
  const xml = changesAtom(weeks, { site: SITE, updated: '2026-11-27' });
  const feed = assertAtomEssentials(xml);
  const entries = kids(feed, 'entry');
  assert.equal(entries.length, weeks.length, 'one entry per ISO week');
  // 2026-09-30 only changed commercial_ok from null to conditional, which the v1 projection drops: no week for it
  assert.deepEqual(weeks.map((w) => w.week), ['2026-W41']);
  assert.equal(one(entries[0], 'id').text, 'tag:example.test,2026:changes:2026-W41');
  assert.equal(one(entries[0], 'updated').text, '2026-10-08T00:00:00Z', 'the newest change of the week');
  assert.equal(one(feed, 'updated').text, '2026-10-08T00:00:00Z', 'never the clock nor the fallback when there are entries');
  assert.equal(kids(entries[0], 'link')[0].attrs.href, `${SITE}/state/2026-10/`, 'the month report that holds the week');
  assert.equal(kids(feed, 'link').find((l) => l.attrs.rel === 'self').attrs.href, SITE + ATOM_PATH);
  assert.doesNotMatch(xml, /<script/, 'names are escaped');
  assert.match(xml, /Tom &amp; Jerry &lt;script&gt;: free tier/);
  assert.equal(changesAtom(weeks, { site: SITE, updated: '2020-01-01' }), xml, 'deterministic: the fallback date plays no part when there are entries');
});

test('the Atom ids do not move when a later week is added', () => {
  const later = groupChangesByWeek(projectApiV1Changes(flattenFieldChanges({ ...history, gamma: [ev('2026-10-14', 'notes', '', 'x')] }, names)), { weeks: 12 });
  const ids = (ws) => kids(parseXml(changesAtom(ws, { site: SITE })), 'entry').map((e) => one(e, 'id').text);
  assert.deepEqual(ids(later), [atomId(SITE, '2026-W42'), ...ids(weeks)]);
});

test('an empty Atom feed is still valid and dated by the fallback', () => {
  const feed = assertAtomEssentials(changesAtom([], { site: SITE, updated: '2026-11-27' }));
  assert.equal(kids(feed, 'entry').length, 0);
  assert.equal(one(feed, 'updated').text, '2026-11-27T00:00:00Z');
});

test('the latest-week summary counts changed providers, ended free tiers and new providers from the data', () => {
  const added = [{ date: '2026-10-06', slug: 'delta', name: 'Delta' }, { date: '2026-09-01', slug: 'old', name: 'Old' }];
  const lw = latestWeek(flat, added, { asOf: '2026-11-27' });
  assert.equal(lw.week, '2026-W41');
  assert.deepEqual([lw.changed, lw.ended, lw.added], [3, 1, 1]);
  assert.equal(lw.current, false);
  assert.equal(latestWeekSentence(lw), 'Latest week with changes (2026-W41, 2026-10-05 to 2026-10-11): 3 providers changed, 1 free tier ended, 1 new.');
  const now = latestWeek(flat, added, { asOf: '2026-10-09' });
  assert.match(latestWeekSentence(now), /^This week \(2026-W41/);
  // a free type that becomes unknown is not an ended free tier: the data does not say so
  const unknown = latestWeek([{ date: '2026-10-08', slug: 'x', field: 'free_type', from: 'perpetual', to: null }]);
  assert.equal(unknown.ended, 0);
  assert.equal(latestWeekSentence(null), 'Latest week: not stated (no change history is available in this build).');
  assert.equal(summaryValue(null), 'not stated');
  assert.equal(summaryValue(false), 'no');
});
