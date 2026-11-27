// compare-faq.mjs — the answer-first verdict and the FAQ of a static compare page (/compare/<a>-vs-<b>/), the compare
// half of the SEO/AEO plan (provider pages have theirs in provider-faq.mjs, whose helpers this reuses).
//
// These pages rank for "<A> vs <B> free tier", so the paragraph right under the H1 answers that query in the first
// sentence and the FAQ below answers the next questions. Every fact comes from data/providers.json through `parts`: each
// part names the side (a or b), the field it reads and the value it read, so a test can trace every word back to the
// record. A null field reads "not stated" and is never used to pick a side: only two recorded, different values are.
// The same items feed the visible FAQ and the FAQPage JSON-LD, in the same plain text, so the two cannot differ.
// Nothing here reads the current date: the pages are pinned in derived-fingerprints.json.

import { escapeHtml as htmlEsc } from './html.mjs';
import { shortDate, limitFigures, compactNumber, LIMIT_UNITS } from './provider-meta.mjs';
import { NOT_STATED, flagWords, headline, isIso, noFinalStop } from './provider-faq.mjs';

const FLAGS = ['card_required', 'phone_required', 'commercial_ok', 'openai_compatible'];
const get = (p, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), p);
const val = (p, path) => { const v = get(p, path); return v === undefined ? null : v; };

/**
 * Whether a provider record says anything about its free tier: published limits, the free-tier or rate-limit text, any
 * of the flags, or a data policy. A compare page shows no verdict and no FAQ when neither side does.
 */
export function hasFreeTierData(p) {
  if (!p) return false;
  if (limitFigures(p.free_limits).length || p.free_tier || p.rate_limits) return true;
  if (p.category === 'ongoing' || p.category === 'trial') return true;
  if (FLAGS.some((f) => val(p, f) !== null)) return true;
  return val(p, 'data_policy.trains_on_prompts') !== null;
}

/** What a side's free offer is, in words: "an ongoing free tier (…)" or "a one-time trial credit (…)". */
function offer(p, side, parts) {
  const h = headline(p, 100);
  parts.push({ side, field: 'category', value: val(p, 'category'), text: p.category === 'ongoing' ? 'ongoing free tier' : p.category === 'trial' ? 'one-time trial credit' : NOT_STATED });
  parts.push({ side, field: h.field, value: val(p, h.field), text: h.value });
  if (p.category === 'ongoing') return `an ongoing free tier (${h.value})`;
  if (p.category === 'trial') return `a one-time trial credit (${h.value})`;
  return `a free offer whose kind is ${NOT_STATED} (${h.value})`;
}

// The reasons to pick one side. Each compares one field; a side wins it only when both values are recorded and its own
// is the better one. `rank` orders the recorded values (higher is better for a free-tier user).
const REASONS = [
  { field: 'category', rank: { ongoing: 1, trial: 0 }, why: 'you want a free tier that does not run out' },
  { field: 'card_required', rank: { false: 1, true: 0 }, why: 'you have no credit card to give' },
  { field: 'phone_required', rank: { false: 1, true: 0 }, why: 'you do not want to verify a phone number' },
  { field: 'commercial_ok', rank: { true: 2, conditional: 1, false: 0 }, why: 'you will ship it commercially' },
  { field: 'data_policy.trains_on_prompts', rank: { false: 1, true: 0 }, why: 'your prompts must not be used for training' },
  { field: 'openai_compatible', rank: { true: 1, false: 0 }, why: 'you want a drop-in OpenAI-compatible endpoint' },
];

/**
 * The published limits, when both sides publish a figure in the same unit and every such unit favours the same side:
 * { winner, keys, a, b } with the figures in words, else null. Different units are never converted into each other.
 */
export function limitsEdge(a, b) {
  const fa = a.free_limits && typeof a.free_limits === 'object' ? a.free_limits : null;
  const fb = b.free_limits && typeof b.free_limits === 'object' ? b.free_limits : null;
  if (!fa || !fb) return null;
  const shared = LIMIT_UNITS.filter(([k]) => Number.isInteger(fa[k]) && Number.isInteger(fb[k]));
  if (!shared.length) return null;
  const sides = new Set(shared.map(([k]) => Math.sign(fa[k] - fb[k])));
  if (sides.size !== 1 || sides.has(0)) return null;
  const words = (fl) => shared.map(([k, unit]) => unit(compactNumber(fl[k]))).join(', ');
  return { winner: sides.has(1) ? 'a' : 'b', keys: shared.map(([k]) => k), a: words(fa), b: words(fb) };
}

/** The reasons each side wins, as { a: [reason], b: [reason] }; a null value on either side never counts. */
export function pickReasons(a, b) {
  const out = { a: [], b: [] };
  const lim = limitsEdge(a, b);
  if (lim) {
    const [hi, lo] = lim.winner === 'a' ? [lim.a, lim.b] : [lim.b, lim.a];
    out[lim.winner].push({ field: 'free_limits', a: a.free_limits, b: b.free_limits, why: `you need the higher published limits (${hi} against ${lo})` });
  }
  for (const r of REASONS) {
    const va = val(a, r.field), vb = val(b, r.field);
    const ra = r.rank[String(va)], rb = r.rank[String(vb)];
    if (va === null || vb === null || ra === undefined || rb === undefined || ra === rb) continue;
    out[ra > rb ? 'a' : 'b'].push({ field: r.field, a: va, b: vb, why: r.why });
  }
  return out;
}

const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
const verifiedOn = (p) => (p.verified === true && shortDate(p.last_verified) ? shortDate(p.last_verified) : 'not verified yet');

/** "pick A if …, B if …" from the recorded differences, or a plain statement that the fields do not separate them. */
function pickSentence(a, b, reasons) {
  const ra = reasons.a.map((r) => r.why), rb = reasons.b.map((r) => r.why);
  if (ra.length && rb.length) return `Pick ${a.name} if ${list(ra)}; pick ${b.name} if ${list(rb)}.`;
  if (ra.length) return `Pick ${a.name} if ${list(ra)}; on the recorded fields ${b.name} has no edge over it.`;
  if (rb.length) return `Pick ${b.name} if ${list(rb)}; on the recorded fields ${a.name} has no edge over it.`;
  return 'The recorded fields (card, phone, commercial use, data policy, OpenAI compatibility) do not separate them, so compare the limits in the table below.';
}

/**
 * The verdict under the H1, as { parts, text, html }, or null when neither side has free-tier data. Sentence 1: what
 * each side gives for free. Sentence 2: who should pick which. Sentence 3: the flags side by side and how fresh each
 * record is.
 */
export function compareVerdict(a, b) {
  if (!hasFreeTierData(a) && !hasFreeTierData(b)) return null;
  const parts = [];
  const first = `For a free tier, ${a.name} gives ${offer(a, 'a', parts)}, and ${b.name} gives ${offer(b, 'b', parts)}.`;
  const reasons = pickReasons(a, b);
  const lim = limitsEdge(a, b);
  for (const side of ['a', 'b']) {
    for (const r of reasons[side]) {
      const text = (x, v) => (r.field === 'free_limits' ? lim[x]
        : r.field === 'category' ? (v === 'ongoing' ? 'ongoing free tier' : 'one-time trial credit')
          : flagWords(r.field.split('.').pop(), v));
      parts.push({ side: 'a', field: r.field, value: r.a, text: text('a', r.a) });
      parts.push({ side: 'b', field: r.field, value: r.b, text: text('b', r.b) });
    }
  }
  const pickParts = parts.slice(); // the offers and the reasons to pick a side, for the first FAQ answer
  // The flags side by side, A first: "credit card not required / not stated", or "… yes for both" when they agree.
  const pair = (label, wa, wb) => (wa === wb ? `${label} ${wa} for both` : `${label} ${wa} / ${wb}`);
  const flag = (label, field) => {
    const wa = flagWords(field.split('.').pop(), val(a, field)), wb = flagWords(field.split('.').pop(), val(b, field));
    parts.push({ side: 'a', field, value: val(a, field), text: wa }, { side: 'b', field, value: val(b, field), text: wb });
    return pair(label, wa, wb);
  };
  const facts = [
    flag('credit card', 'card_required'),
    flag('phone verification', 'phone_required'),
    flag('commercial use', 'commercial_ok'),
    flag('trains on prompts', 'data_policy.trains_on_prompts'),
    flag('OpenAI-compatible', 'openai_compatible'),
  ];
  parts.push({ side: 'a', field: 'last_verified', value: val(a, 'last_verified'), text: verifiedOn(a) });
  parts.push({ side: 'b', field: 'last_verified', value: val(b, 'last_verified'), text: verifiedOn(b) });
  facts.push(pair('last verified', verifiedOn(a), verifiedOn(b)));
  const third = `${a.name} / ${b.name}: ${facts.join('; ')}.`;
  const text = `${first} ${pickSentence(a, b, reasons)} ${third}`;
  return { parts, pickParts, reasons, text, html: `<p class="answer-first">${htmlEsc(text)}</p>` };
}

/** " Sources read A 20 Nov 2026, B 18 Nov 2026." — each FAQ answer ends with the day each side's source was read. */
function readOn(a, da, b, db) {
  const w = (d) => shortDate(d) || 'date not recorded';
  return ` Sources read: ${a.name} ${w(da)}, ${b.name} ${w(db)}.`;
}
const flagDate = (p, field) => {
  const c = p.field_checks && p.field_checks[field];
  return c && isIso(c.checked) ? c.checked : isIso(p.last_verified) ? p.last_verified : null;
};

/**
 * The FAQ of a compare page: four questions, each { id, q, a, parts }, or [] when neither side has free-tier data. `a`
 * is plain text, used as it is by the JSON-LD and (escaped) by the visible FAQ.
 */
export function compareFaq(a, b) {
  const v = compareVerdict(a, b);
  if (!v) return [];
  const items = [];
  const two = (field) => [
    { side: 'a', field, value: val(a, field), text: flagWords(field.split('.').pop(), val(a, field)) },
    { side: 'b', field, value: val(b, field), text: flagWords(field.split('.').pop(), val(b, field)) },
  ];

  // 1. Which free tier — the verdict's first two sentences.
  {
    const body = v.text.slice(0, v.text.lastIndexOf(` ${a.name} / ${b.name}: `)).trim();
    items.push({
      id: 'faq-which', q: `${a.name} vs ${b.name}: which has the better free tier?`,
      parts: v.pickParts,
      body, dates: [isIso(a.last_verified) ? a.last_verified : null, isIso(b.last_verified) ? b.last_verified : null],
    });
  }

  // 2. Card and phone.
  {
    const card = two('card_required'), phone = two('phone_required');
    items.push({
      id: 'faq-card', q: `Do ${a.name} and ${b.name} need a credit card or a phone number?`,
      parts: [...card, ...phone],
      body: `${a.name}: credit card ${card[0].text}, phone verification ${phone[0].text}. ${b.name}: credit card ${card[1].text}, phone verification ${phone[1].text}.`,
      dates: [flagDate(a, 'card_required'), flagDate(b, 'card_required')],
    });
  }

  // 3. Commercial use, with the condition when there is one.
  {
    const parts = two('commercial_ok');
    const side = (p, i) => {
      const cond = p.commercial_ok === 'conditional' && p.commercial_ok_condition ? noFinalStop(p.commercial_ok_condition) : '';
      if (cond) parts.push({ side: i ? 'b' : 'a', field: 'commercial_ok_condition', value: p.commercial_ok_condition, text: cond });
      return `${p.name}: ${parts[i].text}${cond ? ` (${cond})` : ''}.`;
    };
    items.push({
      id: 'faq-commercial', q: `Can I use the ${a.name} and ${b.name} free tiers commercially?`,
      parts, body: `${side(a, 0)} ${side(b, 1)}`, dates: [flagDate(a, 'commercial_ok'), flagDate(b, 'commercial_ok')],
    });
  }

  // 4. Training on prompts and retention.
  {
    const parts = two('data_policy.trains_on_prompts');
    const side = (p, i) => {
      const r = val(p, 'data_policy.retention');
      const retention = r ? noFinalStop(r) : NOT_STATED;
      parts.push({ side: i ? 'b' : 'a', field: 'data_policy.retention', value: r, text: retention });
      return `${p.name}: trains on your prompts: ${parts[i].text}; retention: ${retention}.`;
    };
    const dd = (p) => (isIso(val(p, 'data_policy.checked')) ? p.data_policy.checked : null);
    items.push({
      id: 'faq-data', q: `Do ${a.name} and ${b.name} train on my prompts?`,
      parts, body: `${side(a, 0)} ${side(b, 1)}`, dates: [dd(a), dd(b)],
    });
  }

  return items.map(({ body, dates, ...it }) => ({ ...it, a: `${body}${readOn(a, dates[0], b, dates[1])}` }));
}

/** The visible FAQ: an H2 and one .faq-item per question, the answer exactly the JSON-LD text, escaped. */
export function compareFaqHtml(a, b, items = compareFaq(a, b)) {
  if (!items.length) return '';
  return `<h2 id="faq">${htmlEsc(a.name)} vs ${htmlEsc(b.name)} FAQ</h2>` +
    items.map((it) => `<div class="faq-item" id="${it.id}"><h3>${htmlEsc(it.q)}</h3><p>${htmlEsc(it.a)}</p></div>`).join('');
}
