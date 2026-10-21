// provider-summaries.mjs — what a provider is, in a few lines, written only from the provider's own pages.
//
// data/provider-summaries.json holds, for a provider, up to five short plain-text lines (what it is, what it is good
// for, who operates it, who owns it, where it is from). A line exists only if a source says it: every line must be
// named in the `supports` of at least one source, a source has a URL and the day it was read, and the page of that
// URL must be the provider's own. "Its own" is the registrable domain of a URL already in the provider's record
// (docs_url, openai_base_url), or a host that data/provider-summaries.json lists in `exceptions` with the reason
// (the parent company that owns it, the project's own repository, the same service on its other domain).
// A line nobody could source is left empty and not shown: empty is a valid state, an invented line is not.
import { hasHiddenChars } from './hidden-chars.mjs';
import { htmlEsc } from './rows.mjs';

export const SUMMARY_FIELDS = ['what', 'good_for', 'operator', 'owner', 'origin'];
export const FIELD_LABELS = { what: 'What it is', good_for: 'Good for', operator: 'Operated by', owner: 'Owned by', origin: 'Origin' };
const MAX_TEXT = 500;
const MIN_REASON = 20;
const FETCHED_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?Z)?$/;
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };

/** The registrable domain of a host, without a public-suffix list: the last two labels, three after co.uk, com.cn and alike. */
export const registrableDomain = (host) => {
  const labels = String(host).split('.');
  if (labels.length <= 2) return host;
  const [tld, second] = [labels[labels.length - 1], labels[labels.length - 2]];
  return tld.length === 2 && SECOND_LEVEL.has(second) ? labels.slice(-3).join('.') : labels.slice(-2).join('.');
};

/** The domains of the provider itself: the ones its record already points at. */
export const ownDomains = (provider) => new Set([provider.docs_url, provider.openai_base_url].map(hostOf).filter(Boolean).map(registrableDomain));

const isPlain = (t) => typeof t === 'string' && t === t.trim() && !hasHiddenChars(t) && !/[<>]/.test(t);

const validDay = (s) => { const d = new Date(s.slice(0, 10) + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s.slice(0, 10); };

/** Every way the file can lie, as a list of sentences; empty when it is sound. */
export const summaryErrors = (doc, providers) => {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['provider-summaries.json: it must be an object'];
  const extra = Object.keys(doc).filter((k) => !['version', 'exceptions', 'summaries'].includes(k));
  if (extra.length) errors.push(`provider-summaries.json: unknown key ${extra.join(', ')}`);
  if (typeof doc.version !== 'string' || !doc.version) errors.push('provider-summaries.json: version must be a non-empty string');
  if (!Array.isArray(doc.summaries)) return [...errors, 'provider-summaries.json: summaries must be a list'];
  const exceptions = doc.exceptions ?? {};
  if (typeof exceptions !== 'object' || Array.isArray(exceptions)) return [...errors, 'provider-summaries.json: exceptions must be an object of slug -> host -> reason'];
  const bySlug = new Map((providers ?? []).map((p) => [p.slug, p]));
  const usedExceptions = new Set();
  const seen = new Set();

  doc.summaries.forEach((s, i) => {
    const where = `provider-summaries.json: ${s && s.id ? s.id : `entry ${i}`}`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) { errors.push(`${where}: it must be an object`); return; }
    const keys = Object.keys(s);
    const want = ['id', ...SUMMARY_FIELDS, 'sources'];
    for (const k of want) if (!keys.includes(k)) errors.push(`${where}: missing key ${k}`);
    for (const k of keys) if (!want.includes(k)) errors.push(`${where}: unknown key ${k}`);
    if (typeof s.id !== 'string' || !bySlug.has(s.id)) { errors.push(`${where}: id is not a provider of providers.json`); return; }
    if (seen.has(s.id)) errors.push(`${where}: appears twice`);
    seen.add(s.id);
    const filled = [];
    for (const f of SUMMARY_FIELDS) {
      const t = s[f];
      if (typeof t !== 'string') { errors.push(`${where}: ${f} must be a string (empty when nobody could source it)`); continue; }
      if (t === '') continue;
      filled.push(f);
      if (!isPlain(t)) errors.push(`${where}: ${f} must be plain text: trimmed, no hidden characters, no < or >`);
      if (t.length > MAX_TEXT) errors.push(`${where}: ${f} is ${t.length} characters, the limit is ${MAX_TEXT}`);
    }
    if (!filled.length) errors.push(`${where}: every line is empty, so there is nothing to show: leave the provider out`);
    if (!Array.isArray(s.sources) || !s.sources.length) { errors.push(`${where}: sources must be a non-empty list`); return; }
    const supported = new Set();
    const own = ownDomains(bySlug.get(s.id));
    s.sources.forEach((src, j) => {
      const at = `${where}, source ${j + 1}`;
      if (!src || typeof src !== 'object' || Array.isArray(src)) { errors.push(`${at}: it must be an object`); return; }
      const sk = Object.keys(src);
      for (const k of ['url', 'fetched_at', 'supports']) if (!sk.includes(k)) errors.push(`${at}: missing key ${k}`);
      for (const k of sk) if (!['url', 'fetched_at', 'supports'].includes(k)) errors.push(`${at}: unknown key ${k}`);
      let url = null;
      try { url = new URL(src.url); } catch { /* reported below */ }
      if (!url || url.protocol !== 'https:' || url.username || url.password) errors.push(`${at}: url must be an https URL without credentials`);
      else {
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        const domain = registrableDomain(host);
        const reason = exceptions[s.id] && exceptions[s.id][host];
        if (reason !== undefined) usedExceptions.add(`${s.id}\u0000${host}`);
        if (!own.has(domain) && reason === undefined) errors.push(`${at}: ${host} is not a domain of the provider (${[...own].join(', ') || 'none in its record'}); name it under exceptions with the reason, or use the provider's own page`);
      }
      if (typeof src.fetched_at !== 'string' || !FETCHED_RE.test(src.fetched_at) || !validDay(src.fetched_at)) errors.push(`${at}: fetched_at must be a real day, YYYY-MM-DD, with an optional THH:MMZ`);
      if (!Array.isArray(src.supports) || !src.supports.length) errors.push(`${at}: supports must be a non-empty list of lines`);
      else {
        if (new Set(src.supports).size !== src.supports.length) errors.push(`${at}: supports repeats a line`);
        for (const f of src.supports) {
          if (!SUMMARY_FIELDS.includes(f)) errors.push(`${at}: supports names ${f}, which is not a line`);
          else if (s[f] === '') errors.push(`${at}: supports ${f}, which is empty`);
          else supported.add(f);
        }
      }
    });
    for (const f of filled) if (!supported.has(f)) errors.push(`${where}: ${f} has no source that supports it`);
  });

  for (const [slug, hosts] of Object.entries(exceptions)) {
    if (!bySlug.has(slug)) { errors.push(`provider-summaries.json: exceptions names ${slug}, which is not a provider`); continue; }
    if (!hosts || typeof hosts !== 'object' || Array.isArray(hosts)) { errors.push(`provider-summaries.json: exceptions of ${slug} must map host -> reason`); continue; }
    for (const [host, reason] of Object.entries(hosts)) {
      if (typeof reason !== 'string' || reason.trim().length < MIN_REASON || !isPlain(reason)) errors.push(`provider-summaries.json: the exception ${slug} / ${host} needs a plain-text reason of at least ${MIN_REASON} characters`);
      if (!usedExceptions.has(`${slug}\u0000${host}`)) errors.push(`provider-summaries.json: the exception ${slug} / ${host} is not used by any source: remove it`);
    }
  }
  return errors;
};

/** The "About" block of a provider page: each line with the pages that support it and the day they were read. */
export const aboutHtml = (summary, name) => {
  if (!summary) return '';
  const rows = SUMMARY_FIELDS.filter((f) => summary[f]).map((f) => {
    const links = summary.sources.filter((s) => s.supports.includes(f)).map((s) => {
      const host = hostOf(s.url);
      return `<a href="${htmlEsc(s.url)}" target="_blank" rel="noopener">${htmlEsc(host)}</a>, read ${htmlEsc(s.fetched_at.slice(0, 10))}`;
    });
    return `<div class="about-row"><dt>${FIELD_LABELS[f]}</dt><dd>${htmlEsc(summary[f])}<span class="about-src">Source: ${links.join('; ')}</span></dd></div>`;
  });
  if (!rows.length) return '';
  return `<h2 id="about">About ${htmlEsc(name)}</h2><dl class="prov-about">${rows.join('')}</dl>` +
    `<p class="muted">Each line is written from the provider's own pages, with the page and the day it was read next to it. A line nobody could source is left out.</p>`;
};
