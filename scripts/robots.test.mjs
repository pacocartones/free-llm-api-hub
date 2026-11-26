import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// site/robots.txt is the whole crawler policy (it replaced Cloudflare's managed robots.txt): search engines and AI
// search / user agents crawl everything; Google-Extended crawls everything too (it also governs Gemini grounding and
// citations, owner decision 2026-11); every other AI training crawler fetches the data files only, not the HTML pages.
const ROBOTS = readFileSync(new URL('../site/robots.txt', import.meta.url), 'utf8');
const SITE = 'https://freellmapihub.com';

// RFC 9309: consecutive user-agent lines open one group; a crawler obeys the group naming it (case-insensitive),
// else the `*` group; the longest matching path wins and `allow` wins a tie. `*` and `$` are not used in this file.
function parse(text) {
  const groups = [];
  const other = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    assert.ok(m, `not a "field: value" line: ${raw}`);
    const [, field, value] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (field === 'user-agent') {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === 'allow' || field === 'disallow') {
      assert.ok(current, `${field} before any user-agent`);
      current.rules.push({ allow: field === 'allow', path: value });
    } else other.push({ field, value });
  }
  return { groups, other };
}

const { groups, other } = parse(ROBOTS);

function allowed(agent, path) {
  const named = groups.filter((g) => g.agents.includes(agent.toLowerCase()));
  const rules = (named.length ? named : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
  let best = null;
  for (const r of rules) {
    if (!r.path || !path.startsWith(r.path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

const SEARCH = ['Googlebot', 'Bingbot', 'Baiduspider', 'PetalBot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot'];
const TRAINING = ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'CCBot', 'GoogleOther', 'Google-CloudVertexBot', 'Applebot-Extended', 'Bytespider', 'meta-externalagent', 'cohere-ai', 'MistralAI-Training', 'Amazonbot'];
const HTML = ['/', '/p/groq', '/p/groq.md', '/find/', '/not-free/', '/models/', '/guides/free-llm-api-for-beginners', '/compare/', '/changes/', '/state/2026-10/'];
const DATA = ['/robots.txt', '/llms.txt', '/llms-full.txt', '/providers.json', '/providers.csv', '/feed.xml', '/changes.xml',
  '/sitemap.xml', '/sitemap-state.xml', '/sitemap-index.xml', '/api/v1/providers.json', '/api/v1/changes.json'];

test('robots.txt: only the four standard fields, one `*` group, no group named twice', () => {
  assert.deepEqual([...new Set(other.map((o) => o.field))], ['sitemap'], 'no Content-Signal or other non-standard lines (Search Console warns on them)');
  assert.doesNotMatch(ROBOTS, /content-signal/i);
  assert.equal(groups.filter((g) => g.agents.includes('*')).length, 1, 'a single User-agent: * group');
  const agents = groups.flatMap((g) => g.agents);
  assert.equal(new Set(agents).size, agents.length, 'each crawler appears in one group only');
});

test('robots.txt: everyone else, search engines and AI search / user agents may crawl every page', () => {
  for (const agent of ['SomeNewBot', ...SEARCH]) {
    for (const path of [...HTML, ...DATA]) assert.ok(allowed(agent, path), `${agent} ${path}`);
  }
});

test('robots.txt: Google-Extended may crawl every HTML page and data file, in a group of its own', () => {
  for (const path of [...HTML, ...DATA]) assert.ok(allowed('Google-Extended', path), `Google-Extended ${path}`);
  const group = groups.find((g) => g.agents.includes('google-extended'));
  assert.ok(group, 'Google-Extended is named, so it does not fall back to the `*` group by accident');
  assert.deepEqual(group.agents, ['google-extended'], 'its own group: a change to it cannot move another crawler');
  assert.deepEqual(group.rules, [{ allow: true, path: '/' }]);
});

test('robots.txt: the header comment explains the Google-Extended decision', () => {
  const header = ROBOTS.split(/\r?\n/).filter((l) => l.startsWith('#')).slice(0, 12).join('\n');
  assert.match(header, /Google-Extended/);
  assert.match(header, /Gemini/);
  assert.match(header, /ground/i);
  assert.match(header, /cit/i);
});

test('robots.txt: the other AI training crawlers get the data files, not the HTML pages', () => {
  for (const agent of TRAINING) {
    for (const path of HTML) assert.equal(allowed(agent, path), false, `${agent} must not fetch ${path}`);
    for (const path of DATA) assert.ok(allowed(agent, path), `${agent} may fetch ${path}`);
  }
});

test('robots.txt: advertises both sitemaps with absolute URLs', () => {
  const sitemaps = other.filter((o) => o.field === 'sitemap').map((o) => o.value);
  assert.ok(sitemaps.includes(`${SITE}/sitemap.xml`));
  assert.ok(sitemaps.includes(`${SITE}/sitemap-state.xml`));
  for (const s of sitemaps) assert.ok(s.startsWith(`${SITE}/`), s);
});
