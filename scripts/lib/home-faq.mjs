// home-faq.mjs — the FAQ at the foot of the home page, below the provider table (SEO/AEO plan, "free llm api").
//
// Six questions people type into a search box or ask an assistant. Every answer is built from data/providers.json at
// build time: the counts, the three providers named first (the hub's recommended order, rules.mjs recommendedCmp, the
// same order as the table), the dates. A value the dataset does not record is counted and said as "not stated", never
// guessed. Nothing here is typed prose with a number in it.
//
// An answer is a list of segments: plain text, or text with a link. The FAQPage JSON-LD takes the segments' text joined;
// the visible answer is the same segments, escaped, with the linked ones wrapped in <a>. So the visible text and the
// JSON-LD answer are the same string by construction, and home-faq.test.mjs checks it on the built page too.
//
// The section sits below the table, not in the hero: the hero keeps its two controls (home density).

import { escapeHtml as esc } from './html.mjs';
import { recommendedCmp, SLA_DAYS } from './rules.mjs';
import { shortDate } from './provider-meta.mjs';
import { verifiedPhrase } from './home-seo.mjs';

export const NOT_STATED = 'not stated';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (n) => Number(n).toLocaleString('en-US');

/** "A", "A and B", "A, B and C" as segments, each name linked to its provider page. */
function namesList(list) {
  const out = [];
  list.forEach((p, i) => {
    if (i > 0) out.push({ text: i === list.length - 1 ? ' and ' : ', ' });
    out.push({ text: p.name, href: `p/${p.slug}` });
  });
  return out;
}

/** The figures the FAQ quotes, derived from the records. Exported so the tests recompute nothing by hand. */
export function homeFaqFacts(providers) {
  const all = (Array.isArray(providers) ? providers : []).filter((p) => p && typeof p === 'object');
  const ranked = [...all].sort(recommendedCmp);
  const count = (pred) => all.filter(pred).length;
  const top3 = (pred) => ranked.filter(pred).slice(0, 3);
  const isNull = (v) => v === null || v === undefined;
  const dates = all.filter((p) => p.verified === true && ISO.test(String(p.last_verified || ''))).map((p) => p.last_verified).sort();
  // Highest limits: verified ongoing free tiers of text LLMs that publish a numeric daily request cap, highest first;
  // a tie keeps the recommended order (the sort is stable).
  const dailyCap = (p) => (p.free_limits && Number.isInteger(p.free_limits.requests_per_day) ? p.free_limits.requests_per_day : null);
  const ongoingText = ranked.filter((p) => p.category === 'ongoing' && p.verified === true && p.is_text_llm === true);
  const withDailyCap = ongoingText.filter((p) => dailyCap(p) !== null).sort((a, b) => dailyCap(b) - dailyCap(a));
  return {
    total: all.length,
    ongoing: count((p) => p.category === 'ongoing'),
    trial: count((p) => p.category === 'trial'),
    verified: count((p) => p.verified === true),
    unverified: count((p) => p.verified !== true),
    topAll: ranked.slice(0, 3),
    card: { no: count((p) => p.card_required === false), yes: count((p) => p.card_required === true), unknown: count((p) => isNull(p.card_required)), top: top3((p) => p.card_required === false) },
    commercial: {
      yes: count((p) => p.commercial_ok === true), conditional: count((p) => p.commercial_ok === 'conditional'),
      no: count((p) => p.commercial_ok === false), unknown: count((p) => isNull(p.commercial_ok)), top: top3((p) => p.commercial_ok === true),
    },
    openai: { yes: count((p) => p.openai_compatible === true), no: count((p) => p.openai_compatible === false), unknown: count((p) => isNull(p.openai_compatible)), top: top3((p) => p.openai_compatible === true) },
    limits: {
      ongoingText: ongoingText.length,
      withDailyCap: withDailyCap.length,
      top: withDailyCap.slice(0, 3).map((p) => ({ p, perDay: dailyCap(p) })),
    },
    oldestVerified: dates[0] || null,
    newestVerified: dates[dates.length - 1] || null,
  };
}

/** The six items: { id, q, segments }. `answerText(item)` is the plain answer. */
export function homeFaq(providers) {
  const f = homeFaqFacts(providers);
  const t = (text) => ({ text });
  const a = (text, href) => ({ text, href });
  const items = [];

  items.push({
    id: 'faq-is-there', q: 'Is there a free LLM API?',
    segments: [
      t(`Yes. This dataset records ${num(f.total)} free LLM and AI-model APIs: ${num(f.ongoing)} ongoing free tiers and ${num(f.trial)} one-time trial credits, ${verifiedPhrase(f)} against the provider's own docs. The first three in our recommended order are `),
      ...namesList(f.topAll),
      t('. To match one to your needs (no card, commercial use, a model family), use the '),
      a('free API finder', 'find/'), t('.'),
    ],
  });

  {
    const L = f.limits;
    const segs = [t('Providers count limits in different units (requests per minute or per day, tokens, credits), so there is no single ranking. ')];
    if (L.top.length) {
      segs.push(t(`Of the ${num(L.ongoingText)} verified ongoing free tiers for text LLMs, ${num(L.withDailyCap)} publish a daily request cap; the highest are `));
      L.top.forEach(({ p, perDay }, i) => {
        if (i > 0) segs.push(t(i === L.top.length - 1 ? ' and ' : ', '));
        segs.push(a(p.name, `p/${p.slug}`), t(` (${num(perDay)} requests a day)`));
      });
      segs.push(t(`. For the other ${num(L.ongoingText - L.withDailyCap)}, a daily cap is ${NOT_STATED}; each provider page quotes the limits in the provider's words. Compare them in the `));
    } else {
      segs.push(t(`A published daily request cap is ${NOT_STATED} for the ongoing free tiers in this dataset; each provider page quotes the limits in the provider's words. Compare them in the `));
    }
    segs.push(a('renewing free tiers collection', 'collections/renewing-free-tier'), t('.'));
    items.push({ id: 'faq-highest-limits', q: 'Which free LLM API has the highest limits?', segments: segs });
  }

  items.push({
    id: 'faq-no-card', q: 'Which free LLM APIs need no credit card?',
    segments: [
      t(`${num(f.card.no)} of ${num(f.total)} providers state that no credit card is needed; ${num(f.card.yes)} ask for one, and for ${num(f.card.unknown)} it is ${NOT_STATED}. The first three in our recommended order are `),
      ...namesList(f.card.top),
      t('. See the '), a('no-credit-card collection', 'collections/no-credit-card'),
      t(' and the guide to '), a('free LLM APIs without a credit card', 'guides/free-llm-api-without-credit-card'), t('.'),
    ],
  });

  items.push({
    id: 'faq-commercial', q: 'Can I use a free LLM API commercially?',
    segments: [
      t(`It depends on the provider. On the free offer, ${num(f.commercial.yes)} allow commercial use, ${num(f.commercial.conditional)} allow it with conditions, ${num(f.commercial.no)} are for evaluation only, and for ${num(f.commercial.unknown)} it is ${NOT_STATED}. The first three that allow it, in our recommended order, are `),
      ...namesList(f.commercial.top),
      t('. See the '), a('commercial-use collection', 'collections/commercial-use'),
      t(' and the guide to '), a('choosing a free LLM API for production', 'guides/choose-free-llm-api-for-production'), t('.'),
    ],
  });

  items.push({
    id: 'faq-openai', q: 'Which free LLM APIs are OpenAI-compatible?',
    segments: [
      t(`${num(f.openai.yes)} of ${num(f.total)} providers are OpenAI-compatible: you change the base URL and the key in the OpenAI SDK. ${num(f.openai.no)} are not, and for ${num(f.openai.unknown)} it is ${NOT_STATED}. The first three in our recommended order are `),
      ...namesList(f.openai.top),
      t('. See the '), a('OpenAI-compatible collection', 'collections/openai-compatible'),
      t(' and the guide to '), a('OpenAI-compatible free APIs', 'guides/openai-compatible-free-apis'), t('.'),
    ],
  });

  {
    const range = f.oldestVerified
      ? (f.oldestVerified === f.newestVerified ? ` The verification date is ${shortDate(f.oldestVerified)}.` : ` The verification dates run from ${shortDate(f.oldestVerified)} to ${shortDate(f.newestVerified)}.`)
      : ` Verification dates: ${NOT_STATED}.`;
    const flagged = f.unverified
      ? ` ${num(f.unverified)} ${f.unverified === 1 ? 'entry' : 'entries'} could not be confirmed from an official source and ${f.unverified === 1 ? 'is' : 'are'} marked, not hidden.`
      : '';
    items.push({
      id: 'faq-fresh', q: 'How fresh is this data?',
      segments: [
        t(`${f.verified === f.total ? `All ${num(f.total)}` : `${num(f.verified)} of ${num(f.total)}`} entries are verified: the free tier, its limits and its catch were read on the provider's own docs on a recorded date.${range} Every entry is due for a re-check ${SLA_DAYS} days after its date.${flagged} See `),
        a('what “verified” means', 'methodology/'), t(' and '), a('what changed', 'changes/'), t('.'),
      ],
    });
  }
  return items;
}

/** The plain answer of an item: its segments' text, joined. This is the JSON-LD answer. */
export const answerText = (item) => item.segments.map((s) => s.text).join('');

/** The visible section: an H2 and one .faq-item per question, links relative to the site root. */
export function homeFaqHtml(items) {
  const body = items.map((it) => {
    const answer = it.segments.map((s) => (s.href ? `<a href="${esc(s.href)}">${esc(s.text)}</a>` : esc(s.text))).join('');
    return `      <div class="faq-item" id="${esc(it.id)}"><h3>${esc(it.q)}</h3><p>${answer}</p></div>`;
  }).join('\n');
  return `<section class="home-faq" aria-labelledby="faq">
  <div class="wrap">
    <h2 id="faq">Free LLM API questions</h2>
${body}
  </div>
</section>`;
}

/** The FAQPage node for the home JSON-LD @graph: the same questions and answers, in plain text. */
export function homeFaqJsonLd(items) {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: answerText(it) } })),
  };
}
