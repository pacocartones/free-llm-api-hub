// provider-faq.mjs — the answer-first paragraph and the FAQ of a provider page (/p/<slug>), phase 2 of the SEO/AEO plan.
//
// An answer engine quotes the first sentence that answers the question, so the paragraph right under the H1 answers
// "Is <Provider> API free?" and the FAQ below answers the next five questions a developer asks. Every word that carries
// a fact comes from data/providers.json, through `parts`: each part names the field it reads and the value it read, so a
// test can trace every answer back to the record. A null field (the dataset's "not stated", with its reason in
// field_checks) is answered with "not stated" and nothing else: no "probably", no default. Each FAQ answer ends with
// the day its source was read. The same items feed the visible FAQ and the FAQPage JSON-LD, so the two cannot differ.

import { escapeHtml as htmlEsc } from './html.mjs';
import { limitFigures, shortDate, trimAtWord } from './provider-meta.mjs';
import { fieldCheck } from './field-checks.mjs';
import { safeHttp as safeUrl } from './text.mjs';

export const NOT_STATED = 'not stated';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIso = (d) => ISO.test(String(d || ''));
export const noFinalStop = (s) => String(s ?? '').trim().replace(/[\s.;:,]+$/, '');
// A sentence that already ends in the ellipsis of a cut text takes no extra full stop.
const stop = (s) => (/…$/.test(String(s)) ? '' : '.');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The words for each recorded value of the tri-state flags. null is always NOT_STATED.
const FLAG_WORDS = {
  card_required: { true: 'required', false: 'not required' },
  phone_required: { true: 'required', false: 'not required' },
  commercial_ok: { true: 'allowed', false: 'not allowed (evaluation only)', conditional: 'allowed with conditions' },
  openai_compatible: { true: 'yes', false: 'no' },
  trains_on_prompts: { true: 'yes', false: 'no' },
  multi_account_forbidden: { true: 'forbidden', false: 'allowed', conditional: 'conditional' },
  limit_circumvention_forbidden: { true: 'forbidden', false: 'allowed' },
};

/** The words of a flag value: the recorded value in words, or "not stated" for null/undefined. */
export function flagWords(field, value) {
  if (value === null || value === undefined) return NOT_STATED;
  const w = FLAG_WORDS[field] && FLAG_WORDS[field][String(value)];
  return w || NOT_STATED;
}

const RENEWS = { 'renewing-quota': 'a quota that renews', 'recurring-credit': 'a credit that renews', perpetual: 'no end date' };

/** The headline of the free offer: the published numeric limits when there are any, else the free_tier text, cut. */
export function headline(p, max = 140) {
  const figures = limitFigures(p.free_limits);
  if (figures.length) return { field: 'free_limits', value: figures.join(', ') };
  if (p.free_tier) return { field: 'free_tier', value: noFinalStop(trimAtWord(p.free_tier, max)) };
  return { field: 'free_tier', value: NOT_STATED };
}

/** The date (and page) behind a flag: its field check when there is one, else the record's last verification. */
export function flagSource(p, field) {
  const check = fieldCheck(p, field);
  if (check && isIso(check.checked)) return { date: check.checked, source: safeUrl((check.sources || [])[0]) || safeUrl(p.docs_url) };
  return { date: isIso(p.last_verified) ? p.last_verified : null, source: safeUrl(p.docs_url) };
}

/**
 * The answer to "Is <Provider> API free?" in one or two sentences, as parts (field, value, text) plus the plain text and
 * the HTML. Sentence 1: ongoing free tier or one-time trial credit, with the headline limits. Sentence 2: card, phone,
 * commercial use and the day the record was verified. The paragraph is linkable at the stable anchor #is-it-free.
 */
export function answerFirst(p) {
  const parts = [];
  const h = headline(p);
  let first;
  if (p.category === 'ongoing') {
    const renews = RENEWS[p.free_type];
    parts.push({ field: 'category', value: p.category, text: 'ongoing free tier' });
    if (renews) parts.push({ field: 'free_type', value: p.free_type, text: renews });
    first = `Yes. ${p.name} has an ongoing free tier${renews ? ` (${renews})` : ''}: ${h.value}${stop(h.value)}`;
  } else if (p.category === 'trial') {
    parts.push({ field: 'category', value: p.category, text: 'one-time trial credit' });
    const exp = p.expires ? `; the credit expires after ${noFinalStop(p.expires)}` : '';
    if (p.expires) parts.push({ field: 'expires', value: p.expires, text: noFinalStop(p.expires) });
    first = `Not permanently. ${p.name} gives a one-time trial credit, not an ongoing free tier: ${h.value}${exp}${stop(exp || h.value)}`;
  } else {
    parts.push({ field: 'category', value: p.category ?? null, text: NOT_STATED });
    first = `Whether ${p.name} has an ongoing free tier is ${NOT_STATED}: ${h.value}${stop(h.value)}`;
  }
  parts.push({ field: h.field, value: h.field === 'free_limits' ? p.free_limits : (p.free_tier ?? null), text: h.value });
  const card = flagWords('card_required', p.card_required);
  const phone = flagWords('phone_required', p.phone_required);
  const comm = flagWords('commercial_ok', p.commercial_ok);
  parts.push({ field: 'card_required', value: p.card_required ?? null, text: card });
  parts.push({ field: 'phone_required', value: p.phone_required ?? null, text: phone });
  parts.push({ field: 'commercial_ok', value: p.commercial_ok ?? null, text: comm });
  const verified = p.verified === true && shortDate(p.last_verified) ? ` Verified ${shortDate(p.last_verified)}.` : ' Not verified yet.';
  const second = `Credit card: ${card}; phone verification: ${phone}; commercial use: ${comm}.${verified}`;
  const text = `${first} ${second}`;
  return { parts, text, html: `<p class="answer-first" id="is-it-free">${htmlEsc(text)}</p>` };
}

/** " (source read 24 Nov 2026)" or " (source date not recorded)": every FAQ answer ends with one. */
const readOn = (date) => (shortDate(date) ? ` Source read ${shortDate(date)}.` : ' Source date not recorded.');

/**
 * The FAQ of a provider page: six questions, each { id, q, a, parts, date, source }. `a` is plain text (the JSON-LD
 * answer and the visible answer, escaped); `parts` trace each fact to its field; `date` is the day the source was read.
 */
export function providerFaq(p) {
  const n = p.name;
  const items = [];

  // 1. Is it free?
  {
    const af = answerFirst(p);
    const first = af.text.slice(0, af.text.indexOf('Credit card:')).trim();
    items.push({
      id: 'faq-free', q: `Is ${n} API free?`, parts: af.parts.filter((x) => !['card_required', 'phone_required', 'commercial_ok'].includes(x.field)),
      date: isIso(p.last_verified) ? p.last_verified : null, source: safeUrl(p.docs_url), body: first,
    });
  }

  // 2. Limits.
  {
    const fl = p.free_limits && isIso(p.free_limits.checked) ? p.free_limits : null;
    const figures = fl ? limitFigures(fl) : [];
    if (figures.length) {
      const scope = fl.scope ? ` (${noFinalStop(fl.scope)})` : '';
      items.push({
        id: 'faq-limits', q: `What are the ${n} free tier limits?`,
        parts: [{ field: 'free_limits', value: fl, text: figures.join(', ') }],
        date: fl.checked, source: safeUrl(fl.source), body: `${figures.join(', ')}${scope}.`,
      });
    } else if (p.rate_limits) {
      items.push({
        id: 'faq-limits', q: `What are the ${n} free tier limits?`,
        parts: [{ field: 'rate_limits', value: p.rate_limits, text: p.rate_limits }],
        date: isIso(p.last_verified) ? p.last_verified : null, source: safeUrl(p.docs_url),
        body: `In the provider's words: ${noFinalStop(p.rate_limits)}.`,
      });
    } else {
      items.push({
        id: 'faq-limits', q: `What are the ${n} free tier limits?`,
        parts: [{ field: 'rate_limits', value: null, text: NOT_STATED }],
        date: isIso(p.last_verified) ? p.last_verified : null, source: safeUrl(p.docs_url), body: `${cap(NOT_STATED)}.`,
      });
    }
  }

  // 3. Credit card (and phone).
  {
    const card = flagWords('card_required', p.card_required);
    const phone = flagWords('phone_required', p.phone_required);
    const cs = flagSource(p, 'card_required');
    const ps = flagSource(p, 'phone_required');
    const sameDay = cs.date === ps.date;
    const body = sameDay
      ? `Credit card: ${card}. Phone verification: ${phone}.`
      : `Credit card: ${card}${shortDate(cs.date) ? ` (read ${shortDate(cs.date)})` : ''}. Phone verification: ${phone}${shortDate(ps.date) ? ` (read ${shortDate(ps.date)})` : ''}.`;
    items.push({
      id: 'faq-card', q: `Does ${n} require a credit card?`,
      parts: [{ field: 'card_required', value: p.card_required ?? null, text: card }, { field: 'phone_required', value: p.phone_required ?? null, text: phone }],
      date: [cs.date, ps.date].filter(Boolean).sort().pop() || null, source: cs.source, body,
    });
  }

  // 4. Commercial use.
  {
    const words = flagWords('commercial_ok', p.commercial_ok);
    const cond = p.commercial_ok === 'conditional' && p.commercial_ok_condition ? ` ${noFinalStop(p.commercial_ok_condition)}.` : '';
    const parts = [{ field: 'commercial_ok', value: p.commercial_ok ?? null, text: words }];
    if (cond) parts.push({ field: 'commercial_ok_condition', value: p.commercial_ok_condition, text: noFinalStop(p.commercial_ok_condition) });
    const s = flagSource(p, 'commercial_ok');
    items.push({
      id: 'faq-commercial', q: `Can I use the ${n} free tier commercially?`, parts,
      date: s.date, source: s.source, body: `Commercial use: ${words}.${cond}`,
    });
  }

  // 5. Data and training.
  {
    const dp = p.data_policy && typeof p.data_policy === 'object' ? p.data_policy : null;
    if (dp) {
      const trains = flagWords('trains_on_prompts', dp.trains_on_prompts);
      const retention = dp.retention ? noFinalStop(dp.retention) : NOT_STATED;
      const quote = dp.quote ? ` The provider's words: “${noFinalStop(dp.quote)}.”` : '';
      items.push({
        id: 'faq-data', q: `Does ${n} train on my prompts?`,
        parts: [
          { field: 'data_policy.trains_on_prompts', value: dp.trains_on_prompts ?? null, text: trains },
          { field: 'data_policy.retention', value: dp.retention ?? null, text: retention },
          ...(dp.quote ? [{ field: 'data_policy.quote', value: dp.quote, text: noFinalStop(dp.quote) }] : []),
        ],
        date: isIso(dp.checked) ? dp.checked : null, source: safeUrl(dp.source),
        body: `Trains on your prompts: ${trains}. Retention: ${retention}.${quote}`,
      });
    } else {
      items.push({
        id: 'faq-data', q: `Does ${n} train on my prompts?`,
        parts: [{ field: 'data_policy', value: null, text: NOT_STATED }],
        date: isIso(p.last_verified) ? p.last_verified : null, source: safeUrl(p.docs_url), body: `${cap(NOT_STATED)}.`,
      });
    }
  }

  // 6. OpenAI-compatible base URL.
  {
    const s = flagSource(p, 'openai_compatible');
    const parts = [{ field: 'openai_compatible', value: p.openai_compatible ?? null, text: flagWords('openai_compatible', p.openai_compatible) }];
    let body;
    if (p.openai_compatible === true && p.openai_base_url) {
      parts.push({ field: 'openai_base_url', value: p.openai_base_url, text: p.openai_base_url });
      body = `Yes. Base URL: ${p.openai_base_url}.`;
    } else if (p.openai_compatible === true) {
      parts.push({ field: 'openai_base_url', value: null, text: NOT_STATED });
      body = `Yes. The base URL is ${NOT_STATED}.`;
    } else if (p.openai_compatible === false) {
      body = 'No. It is not OpenAI-compatible; use the provider’s own API.';
    } else {
      body = `${cap(NOT_STATED)}.`;
    }
    items.push({ id: 'faq-openai', q: `Is ${n} OpenAI-compatible, and what is the base URL?`, parts, date: s.date, source: s.source, body });
  }

  return items.map(({ body, ...it }) => ({ ...it, a: `${body}${readOn(it.date)}` }));
}

/** The visible FAQ: an H2 and one .faq-item per question, the source date linked to the page it was read on. */
export function providerFaqHtml(p, items = providerFaq(p)) {
  const html = items.map((it) => {
    const body = htmlEsc(it.a.slice(0, it.a.lastIndexOf(' Source ')));
    const when = shortDate(it.date);
    const src = it.source
      ? ` <span class="muted">Source${when ? ` read <time datetime="${htmlEsc(it.date)}">${htmlEsc(when)}</time>` : ' date not recorded'}: <a href="${htmlEsc(it.source)}" target="_blank" rel="noopener">the provider's page</a>.</span>`
      : ` <span class="muted">Source${when ? ` read <time datetime="${htmlEsc(it.date)}">${htmlEsc(when)}</time>` : ' date not recorded'}.</span>`;
    return `<div class="faq-item" id="${it.id}"><h3>${htmlEsc(it.q)}</h3><p>${body}${src}</p></div>`;
  }).join('');
  return `<h2 id="faq">${htmlEsc(p.name)} FAQ</h2>${html}`;
}

/** A FAQPage node for a JSON-LD @graph from FAQ items ({ q, a } in plain text); compare pages use it too. */
export function faqPageJsonLd(items) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } })),
  };
}

/** The FAQPage node for the page's JSON-LD @graph: the same questions and answers, in plain text. */
export function providerFaqJsonLd(p, items = providerFaq(p)) {
  return faqPageJsonLd(items);
}
