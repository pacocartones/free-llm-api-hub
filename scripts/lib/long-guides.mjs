// long-guides.mjs — the three long-form guides under /guides/ (OpenAI alternatives, production checklist, no card and
// no phone). The copy is editorial; every number, limit, flag, date and provider list in it is computed here from
// data/providers.json and data/not-free.json at build time, so the pages cannot drift from the data. A provider the
// copy names by hand (an example, a quote) is looked up in the data and dropped when it no longer qualifies.
//
// Pure: each renderer takes the dataset and returns the page parts ({ answer, body, faq, count, featured }); build.mjs
// adds the page shell, JSON-LD, sitemap entry and hub card. scripts/long-guides.test.mjs pins the lists to the data.

import { recScore, SLA_DAYS, DUE_SOON_DAYS } from './rules.mjs';
import { fieldCheck, REASON_LABEL } from './field-checks.mjs';
import { codeHtmlEsc, pythonStringLiteral } from './quickstart.mjs';

export const NOT_FREE_HREF = 'not-free/';

// Card and listing copy. `title` is the draft's own and `metaDesc` the draft's, trimmed to the site's 155-character
// snippet limit; any count is filled from the data ({n}).
export const LONG_GUIDES = [
  {
    slug: 'openai-api-alternatives',
    title: 'Free OpenAI API Alternatives (2026): Swap base_url, Keep Your Code',
    metaDesc: "Free alternatives to the OpenAI API for chat, embeddings, speech, vision and OCR: each one's base_url, published free limits and the date we checked them.",
    h1: 'Free alternatives to the OpenAI API',
    card: 'OpenAI API alternatives',
    blurb: 'Using OpenAI today? What to switch to, by use case.',
    ogTitle: 'Free OpenAI API alternatives',
    ogSubtitle: 'swap base_url · keep your code',
  },
  {
    slug: 'choose-free-llm-api-for-production',
    title: 'Can You Use a Free LLM API in Production? A 6-Point Checklist',
    metaDesc: "How to pick a free LLM API you can ship on: commercial use, card and phone, prompt training, limits, freshness, per the provider's docs. Unknown isn't no.",
    h1: 'How to choose a free LLM API for production',
    card: 'Production checklist',
    blurb: 'Six checks before you ship on a free tier.',
    ogTitle: 'Free LLM API in production?',
    ogSubtitle: 'a 6-point checklist · unknown is not no',
  },
  {
    slug: 'free-llm-api-no-credit-card-no-phone',
    title: 'Free AI APIs With No Credit Card and No Phone Number ({n}, Checked)',
    metaDesc: 'The {n} free LLM and AI APIs needing no credit card and no phone verification, with the catch for each: limits, commercial use, expiry. Checked at source.',
    h1: 'Free LLM and AI APIs with no credit card and no phone number',
    card: 'No card, no phone: every API',
    blurb: 'Every no-card, no-phone API, with the catch for each.',
    ogTitle: 'No card, no phone: free AI APIs',
    ogSubtitle: 'every one with its catch · dated · sourced',
  },
];

// ---------- small helpers (HTML out; every data string is escaped) ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const byScore = (a, b) => recScore(b) - recScore(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\/[^\s"<>]+$/i.test(u) ? u : '');
const ext = (url, text) => (httpsOnly(url) ? `<a href="${esc(url)}" target="_blank" rel="noopener">${text}</a>` : text);
// Data text in running prose (not in a table, which wraps anywhere): a long unbroken token such as a URL gets break
// points after its slashes, so it never widens a phone screen.
export const escProse = (s) => esc(s).replace(/\S{30,}/g, (t) => t.replace(/\//g, '/<wbr>'));
const provLink = (p, prefix) => `<a href="${prefix}p/${esc(p.slug)}">${esc(p.name)}</a>`;
const time = (d) => (d ? `<time datetime="${esc(d)}">${esc(d)}</time>` : 'date not recorded');
const code = (s) => `<code>${esc(s)}</code>`;
const pre = (lang, src) => `<pre><code class="language-${lang}">${codeHtmlEsc(src)}</code></pre>`;
const p = (html) => `<p>${html}</p>`;
const h2 = (text, id) => `<h2${id ? ` id="${id}"` : ''}>${text}</h2>`;
const tableHtml = (label, head, rows) =>
  `<div class="table-scroll" role="region" aria-label="${esc(label)}" tabindex="0"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>\n` +
  rows.map((r) => `<tr>${r.map((v, i) => `<td${i === 0 ? ' class="name"' : ''}>${v}</td>`).join('')}</tr>`).join('\n') +
  `\n</tbody></table></div>`;
const related = (links) => `<p class="muted">Related: ${links.join(' · ')}</p>`;

/** "A, B and C" (already-escaped HTML parts). */
export const andList = (parts) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Card requirement in words, with the recorded reason when it is unknown and a phone note when one is required. */
export function cardWords(x) {
  let w;
  if (x.card_required === false) w = 'No';
  else if (x.card_required === true) w = 'Yes';
  else {
    const c = fieldCheck(x, 'card_required');
    w = `Unknown (${REASON_LABEL[c && c.status] || REASON_LABEL.not_checked})`;
  }
  return x.phone_required === true ? `${w} (phone required)` : w;
}

export function commercialWords(x) {
  if (x.commercial_ok === true) return 'Yes';
  if (x.commercial_ok === false) return '<strong>No</strong>';
  if (x.commercial_ok === 'conditional') return 'Conditional';
  return 'Not confirmed';
}

// The source a limit was read on: the structured limits' own source, else the entry's docs page.
const limitSource = (x) => httpsOnly(x.free_limits && x.free_limits.source) || httpsOnly(x.docs_url);
const checkedCell = (x) => `${time(x.last_verified)}${limitSource(x) ? ` (${ext(limitSource(x), 'source')})` : ''}`;

// A model ID that reads as a chat model, for the "example model" column: not speech, embeddings, OCR, moderation.
const NON_CHAT = /asr|whisper|embed|tts|ocr|guard|rerank|bge|flux|sdxl|stable-diffusion|speech|voice/i;
export const exampleChatModel = (x) => (x.models_free || []).find((m) => !NON_CHAT.test(m)) || null;

// ---------- the sets each guide is built from ----------
// OpenAI-compatible providers that are in the dataset for something other than free model calls. Their own entries
// say so (Hugging Face: no included Inference Providers credit on the Free plan; Novita: no LLM priced at $0). The
// guide names them, with the sentence from their entry, instead of listing them as chat alternatives.
export const NO_FREE_MODEL_CALLS = ['huggingface', 'novita'];

export function alternativesSets(providers) {
  const compat = providers.filter((x) => x.verified === true && x.openai_compatible === true);
  const noCalls = compat.filter((x) => NO_FREE_MODEL_CALLS.includes(x.slug));
  const usable = compat.filter((x) => !NO_FREE_MODEL_CALLS.includes(x.slug));
  const chat = usable.filter((x) => x.is_text_llm === true);
  const has = (m) => (x) => (x.modalities || []).includes(m);
  const native = (m) => providers.filter((x) => x.verified === true && x.openai_compatible !== true && has(m)(x)).sort(byScore);
  return {
    compat,
    noCalls,
    chatOngoing: chat.filter((x) => x.category === 'ongoing').sort(byScore),
    chatTrial: chat.filter((x) => x.category === 'trial').sort(byScore),
    embeddings: usable.filter(has('embeddings')).sort(byScore),
    speech: usable.filter(has('audio')).sort(byScore),
    vision: usable.filter(has('vision')).sort(byScore),
    ocr: usable.filter(has('ocr')).sort(byScore),
    nativeEmbeddings: native('embeddings'),
    nativeSpeech: native('audio'),
    nativeOcr: native('ocr'),
  };
}

export const noCardNoPhone = (providers) =>
  providers.filter((x) => x.verified === true && x.card_required === false && x.phone_required === false).sort(byScore);

// ---------- not-free.json (data/not-free.json, PR #787) ----------
const notFreeGroup = (notFree, id) => ((notFree && notFree.entries) || []).filter((e) => e.group === id);
const latestDate = (dates) => dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort().pop() || null;

// ---------- guide 1: free OpenAI API alternatives ----------
const PREFERRED_EXAMPLES = ['groq', 'google-gemini'];
const EXAMPLE_ORDER = (x) => (PREFERRED_EXAMPLES.includes(x.slug) ? PREFERRED_EXAMPLES.indexOf(x.slug) : PREFERRED_EXAMPLES.length);
const NATIVE_MAX = 6;
function alternativesGuide({ providers, notFree, prefix }) {
  const s = alternativesSets(providers);
  const L = (x) => provLink(x, prefix);
  const n = s.compat.length;
  const verifiedCount = providers.filter((x) => x.verified === true).length;
  const noTier = notFreeGroup(notFree, 'no-free-tier');
  const prepay = notFreeGroup(notFree, 'card-or-prepay');
  const removed = notFreeGroup(notFree, 'removed');
  const openai = noTier.find((e) => e.id === 'openai');
  if (!openai) throw new Error('long-guides: the OpenAI alternatives guide needs the "openai" entry in the no-free-tier group of data/not-free.json');
  const noTierDate = latestDate(noTier.map((e) => e.checked));

  const answer = `OpenAI has no ongoing free API tier. ${n} of the ${verifiedCount} verified providers in our dataset expose an OpenAI-compatible API for their free offering, so you can keep the official OpenAI SDK and change two things: <code>base_url</code> and the API key. Which one fits depends on what you use OpenAI for: chat, embeddings, speech, vision or OCR.`;

  // Code examples: the first chat provider with a base URL, a key variable and a chat model, for Python and curl;
  // a second one for JavaScript, so the page shows that only the base URL, key and model change.
  // The copy was written around Groq (Python, curl) and Gemini (JavaScript); any other runnable provider stands in
  // when one of them stops qualifying.
  const runnable = s.chatOngoing.filter((x) => x.card_required === false && httpsOnly(x.openai_base_url) && x.env_key && exampleChatModel(x))
    .sort((x, y) => EXAMPLE_ORDER(x) - EXAMPLE_ORDER(y));
  const [a, b] = [runnable[0], runnable[1] || runnable[0]];
  let examples = '';
  if (a) {
    const py = `import os
from openai import OpenAI

client = OpenAI(
    base_url=${pythonStringLiteral(a.openai_base_url)},  # was: https://api.openai.com/v1
    api_key=os.environ[${pythonStringLiteral(a.env_key)}],  # the provider's key, not your OpenAI key
)

resp = client.chat.completions.create(
    model=${pythonStringLiteral(exampleChatModel(a))},  # a model ID from the provider's free sample
    messages=[{"role": "user", "content": "Say hello in five words."}],
)
print(resp.choices[0].message.content)`;
    const js = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: ${JSON.stringify(b.openai_base_url)},
  apiKey: process.env.${b.env_key},
});

const resp = await client.chat.completions.create({
  model: ${JSON.stringify(exampleChatModel(b))},
  messages: [{ role: "user", content: "Say hello in five words." }],
});
console.log(resp.choices[0].message.content);`;
    const body = JSON.stringify({ model: exampleChatModel(a), messages: [{ role: 'user', content: 'Hello' }] });
    const curl = `curl ${a.openai_base_url.replace(/\/$/, '')}/chat/completions \\
  -H "Authorization: Bearer $${a.env_key}" \\
  -H "Content-Type: application/json" \\
  -d '${body.replace(/'/g, "'\\''")}'`;
    examples =
      `<h3>Python (${esc(a.name)})</h3>` + pre('python', py) +
      `<h3>JavaScript / TypeScript (${esc(b.name)})</h3>` + pre('js', js) +
      `<h3>curl</h3>` + pre('bash', curl);
  }

  // The provider cell carries what to paste: the base URL (with break points after its slashes, so a narrow column
  // wraps it) and, for chat, a free model ID.
  const wrapCode = (t) => `<code>${esc(t).replace(/\//g, '/<wbr>')}</code>`;
  const providerCell = (x, withModel) =>
    `${L(x)}<br><small>base_url</small> ${httpsOnly(x.openai_base_url) ? wrapCode(x.openai_base_url) : '<span class="notes">see the provider page</span>'}` +
    (withModel ? `<br><small>model</small> ${exampleChatModel(x) ? wrapCode(exampleChatModel(x)) : '<span class="notes">see the provider page</span>'}` : '');
  const evalMark = (x) => (x.commercial_ok === false ? ' <strong>Evaluation only: its terms do not allow production or commercial use.</strong>' : '');
  const chatRows = (list) => list.map((x) => [
    providerCell(x, true),
    `${esc(x.free_tier)}<br><span class="notes">${esc(x.rate_limits)}</span>${evalMark(x)}`,
    esc(cardWords(x)), checkedCell(x),
  ]);
  const freeRows = (list) => list.map((x) => [providerCell(x, false), `${esc(x.free_tier)}${evalMark(x)}`, esc(cardWords(x)), checkedCell(x)]);
  const HEAD_CHAT = ['Provider, base_url and a free model', 'What’s free and the published limits', 'Card', 'Checked'];
  const HEAD_FREE = ['Provider and base_url', 'What’s free', 'Card', 'Checked'];
  const nativeLine = (list, what, guideHref) => {
    if (!list.length) return '';
    const shown = list.slice(0, NATIVE_MAX).map((x) => `${L(x)} (${x.category === 'ongoing' ? 'ongoing' : 'one-time credit'})`);
    const more = list.length - NATIVE_MAX;
    return p(`Not OpenAI-compatible, but free for ${what}: ${more > 0 ? `${shown.join(', ')} and <a href="${prefix}${guideHref}">${more} more</a>` : andList(shown)}.`);
  };

  // Data policy among the chat alternatives with a renewing tier: who says they train on prompts, who says they don't.
  const trains = s.chatOngoing.filter((x) => x.data_policy && x.data_policy.trains_on_prompts === true);
  const noTrain = s.chatOngoing.filter((x) => x.data_policy && x.data_policy.trains_on_prompts === false);
  const evalOnly = s.compat.filter((x) => x.commercial_ok === false && !NO_FREE_MODEL_CALLS.includes(x.slug)).sort(byName);

  const body =
    p(`Every figure below is quoted from the provider’s own docs and dated.`) +
    h2('Is the OpenAI API free?', 'is-the-openai-api-free') +
    p(`No. As checked on ${time(noTierDate)} against their own billing docs, <strong>${andList(noTier.map((e) => esc(e.name)))} do not offer an ongoing free API tier</strong>: API use is prepaid with credits and stops when they run out. Their “Free” or “Tier 0” rows are rate-limit tiers, not free usage.`) +
    (prepay.length ? p(`Several providers people <em>assume</em> are free also require a card or prepayment before any API use, per their own docs: <strong>${andList(prepay.map((e) => esc(e.name)))}</strong>.`) : '') +
    (removed.length ? p(`And ${plural(removed.length, 'provider')} left our list after a re-check of their own pages no longer supported free access: ${andList(removed.map((e) => esc(e.name)))}.`) : '') +
    p(`<a href="${prefix}${NOT_FREE_HREF}">Which LLM APIs are not free, and why</a> has each provider’s own words and the date we read them.`) +
    h2('How to switch: change base_url and the key', 'how-to-switch') +
    p('The OpenAI SDKs accept a custom base URL. Swap it for the provider’s, use that provider’s key, and pass one of its model IDs.') +
    examples +
    p('Base URLs, key variable names and model IDs are taken from each provider’s entry. Compatibility is often partial: tools, streaming, JSON mode or some endpoints may not be supported. Check the provider page before you depend on a feature.') +
    p(`Every provider page has a ready-made quickstart, and the <a href="${prefix}models/">free model index</a> lists the model IDs each provider serves for free.`) +
    h2('Chat and text generation', 'chat') +
    `<h3>Ongoing free tiers (renewing, no end date)</h3>` + tableHtml('Ongoing free chat APIs that are OpenAI-compatible', HEAD_CHAT, chatRows(s.chatOngoing)) +
    `<h3>One-time trial credits</h3>` + tableHtml('OpenAI-compatible chat APIs with one-time trial credits', HEAD_CHAT, chatRows(s.chatTrial)) +
    (s.noCalls.length ? p(`${s.noCalls.length === 1 ? 'One OpenAI-compatible entry does' : `${s.noCalls.length} OpenAI-compatible entries do`} <strong>not give free model calls</strong> despite the compatible endpoint. Per ${s.noCalls.length === 1 ? 'its entry' : 'their entries'}: ${s.noCalls.map((x) => `${L(x)}: “${escProse(x.free_tier)}”`).join('; ')}. Don’t switch to ${s.noCalls.length === 1 ? 'it' : 'them'} expecting free chat.`) : '') +
    related([`<a href="${prefix}collections/openai-compatible">OpenAI-compatible collection</a>`, `<a href="${prefix}guides/openai-compatible-free-apis">the full OpenAI-compatible list</a>`, a && b && a !== b ? `<a href="${prefix}compare/?compare=${esc(a.slug)},${esc(b.slug)}">${esc(a.name)} and ${esc(b.name)} side by side</a>` : '']) +
    h2('Embeddings', 'embeddings') +
    p('These providers list embeddings and have an OpenAI-compatible API for their free offering. The dataset records compatibility per provider, not per endpoint, so check the provider page to confirm its <code>/embeddings</code> route and model IDs.') +
    tableHtml('OpenAI-compatible free embeddings APIs', HEAD_FREE, freeRows(s.embeddings)) +
    pre('python', `emb = client.embeddings.create(
    model="<embedding model ID from the provider page>",
    input=["first text", "second text"],
)`) +
    nativeLine(s.nativeEmbeddings, 'embeddings', 'guides/free-embeddings-apis') +
    related([`<a href="${prefix}guides/free-embeddings-apis">Free embeddings APIs</a>`, `<a href="${prefix}guides/free-reranking-apis">Free reranking APIs</a>`]) +
    h2('Speech: transcription and text to speech', 'speech') +
    p('Again, compatibility is recorded per provider: check that the provider’s audio endpoints follow the OpenAI shape before you swap them in.') +
    tableHtml('OpenAI-compatible free speech APIs', HEAD_FREE, freeRows(s.speech)) +
    nativeLine(s.nativeSpeech, 'speech', 'guides/free-speech-to-text-apis') +
    related([`<a href="${prefix}guides/free-speech-to-text-apis">Free speech-to-text and TTS APIs</a>`]) +
    h2('Vision (image input)', 'vision') +
    tableHtml('OpenAI-compatible free vision APIs', HEAD_FREE, freeRows(s.vision)) +
    related([`<a href="${prefix}guides/free-vision-apis">Free vision APIs</a>`]) +
    h2('OCR and documents', 'ocr') +
    (s.ocr.length
      ? p(`Few OCR APIs speak the OpenAI format. In the dataset: ${andList(s.ocr.map((x) => `${L(x)} (${httpsOnly(x.openai_base_url) ? code(x.openai_base_url) : 'see its page'}): ${escProse(x.free_tier)}`))}.`)
      : p('No OCR provider in the dataset has an OpenAI-compatible API for its free offering.')) +
    nativeLine(s.nativeOcr, 'OCR and document parsing', 'guides/free-ocr-document-ai-apis') +
    related([`<a href="${prefix}guides/free-ocr-document-ai-apis">Free OCR and document AI APIs</a>`]) +
    h2('Before you switch: three checks', 'checks') +
    `<ol>` +
    `<li><strong>Can you ship on it?</strong> Commercial use is confirmed on the free tier for only some of these providers.${evalOnly.length ? ` ${andList(evalOnly.map(L))} say their free access is for evaluation.` : ''} See <a href="${prefix}guides/choose-free-llm-api-for-production">how to choose a free LLM API for production</a>.</li>` +
    `<li><strong>What happens to your prompts?</strong> Among the renewing chat tiers above, ${trains.length ? `${andList(trains.map(L))} ${trains.length === 1 ? 'says it uses' : 'say they use'} free-tier prompts to improve their products` : 'none says it trains on free-tier prompts'}${noTrain.length ? `; ${andList(noTrain.map(L))} ${noTrain.length === 1 ? 'says it doesn’t' : 'say they don’t'} train on them` : ''}. Each provider page has the sentence. See the <a href="${prefix}collections/no-training">no-training collection</a>.</li>` +
    `<li><strong>Is the data current?</strong> Every provider page shows the day it was last checked. We re-check each entry within ${SLA_DAYS} days and log every change on <a href="${prefix}changes/">What changed</a>.</li>` +
    `</ol>`;

  // FAQ answers are derived from the same sets as the tables.
  const noCardChat = s.chatOngoing.filter((x) => x.card_required === false).slice(0, 4);
  const noCardEmb = s.embeddings.filter((x) => x.card_required === false).slice(0, 2);
  const sttAll = s.speech.filter((x) => x.card_required === false && x.category === 'ongoing');
  const stt = [sttAll.find((x) => (x.models_free || []).some((m) => /whisper/i.test(m))) || sttAll[0]].filter(Boolean);
  const faq = [
    { q: 'Is there a free OpenAI API key?', a: `No. OpenAI’s API is prepaid; there is no ongoing free tier (checked ${esc(openai.checked || 'on a date not recorded')}).` },
    {
      q: 'What is the best free alternative to the OpenAI API?',
      a: `It depends on the job.${noCardChat.length ? ` For chat with no card, ${andList(noCardChat.map((x) => esc(x.name)))} have renewing free tiers.` : ''}${noCardEmb.length ? ` For embeddings, ${andList(noCardEmb.map((x) => esc(x.name)))}.` : ''}${stt.length ? ` For transcription, ${esc(stt[0].name)}${(stt[0].models_free || []).some((m) => /whisper/i.test(m)) ? '’s Whisper models' : ''}.` : ''} Compare the limits above against your volume.`,
    },
    { q: 'Do I need to change my code?', a: 'Usually only <code>base_url</code>, the API key and the <code>model</code> name. Features like tools, streaming or JSON mode vary by provider.' },
    { q: 'Can I use these in production?', a: 'Some allow it, some don’t, and for many the provider’s pages don’t say. See the production guide.' },
  ];
  const featured = [...s.chatOngoing, ...s.chatTrial, ...s.embeddings, ...s.speech, ...s.vision, ...s.ocr];
  return { count: n, answer, body, faq, featured: [...new Set(featured)] };
}

// ---------- guide 2: how to choose a free LLM API for production ----------
export function productionFigures(providers) {
  const v = providers.filter((x) => x.verified === true);
  const count = (list, f) => list.filter(f).length;
  const dp = providers.filter((x) => x.data_policy);
  return {
    verified: v.length,
    total: providers.length,
    commercial: {
      true: count(v, (x) => x.commercial_ok === true),
      false: count(v, (x) => x.commercial_ok === false),
      conditional: count(v, (x) => x.commercial_ok === 'conditional'),
      null: count(v, (x) => x.commercial_ok == null),
    },
    shortlist: v.filter((x) => x.commercial_ok === true && x.card_required === false && x.data_policy && x.data_policy.trains_on_prompts === false).sort(byName),
    phoneUnknown: count(providers, (x) => x.phone_required == null),
    freeLimits: count(providers, (x) => x.free_limits && typeof x.free_limits === 'object'),
    dataPolicy: dp.length,
    trainsFalse: dp.filter((x) => x.data_policy.trains_on_prompts === false),
    trainsTrue: dp.filter((x) => x.data_policy.trains_on_prompts === true),
    trainsNull: dp.filter((x) => x.data_policy.trains_on_prompts == null),
    noCard: count(v, (x) => x.card_required === false),
    phoneFalse: count(v, (x) => x.phone_required === false),
    phoneTrue: v.filter((x) => x.phone_required === true).sort(byName),
    ongoing: count(providers, (x) => x.category === 'ongoing'),
    trial: count(providers, (x) => x.category === 'trial'),
    commercialNoCard: v.filter((x) => x.commercial_ok === true && x.card_required === false),
  };
}

// Limits whose numbers the provider does not publish, recognised from the wording of rate_limits.
export const UNPUBLISHED_LIMITS = /^(not published|no (rpm|numeric|rate limit)\b[^.;]*published)/i;

function productionGuide({ providers, prefix }) {
  const F = productionFigures(providers);
  const L = (x) => provLink(x, prefix);
  const bySlug = new Map(providers.map((x) => [x.slug, x]));
  const v = providers.filter((x) => x.verified === true);

  // Commercial use "false" examples: the provider's own sentence when the check is stated with a quote.
  const falseQuoted = v.filter((x) => x.commercial_ok === false && fieldCheck(x, 'commercial_ok') && fieldCheck(x, 'commercial_ok').status === 'stated' && fieldCheck(x, 'commercial_ok').quote).sort(byScore).slice(0, 4);
  const conditional = v.filter((x) => x.commercial_ok === 'conditional').sort(byName);

  // One example per reason a flag stays null. The copy prefers the examples it was written around and falls back to
  // the highest-scored provider with that reason, so a re-check that resolves a flag never leaves a stale example.
  const PREFERRED = {
    source_silent: [['groq', 'commercial_ok']],
    needs_account: [['lemonfox', 'card_required']],
    sources_disagree: [['openrouter', 'card_required'], ['meganova', 'commercial_ok']],
  };
  const FIELD_WORDS = { commercial_ok: 'commercial use', card_required: 'card requirement', phone_required: 'phone requirement', openai_compatible: 'OpenAI compatibility' };
  const reasonExamples = (status, max) => {
    const out = [];
    for (const [slug, field] of PREFERRED[status]) {
      const x = bySlug.get(slug);
      const c = x && x[field] == null && fieldCheck(x, field);
      if (c && c.status === status && c.note) out.push({ x, field, c });
    }
    if (!out.length) {
      for (const x of [...v].sort(byScore)) {
        for (const field of Object.keys(FIELD_WORDS)) {
          const c = x[field] == null && fieldCheck(x, field);
          if (c && c.status === status && c.note && out.length < 1) out.push({ x, field, c });
        }
      }
    }
    return out.slice(0, max);
  };
  const exampleHtml = ({ x, field, c }) => `${L(x)}’s ${FIELD_WORDS[field]}: “${escProse(c.note)}” (read ${time(c.checked)}).`;
  const silent = reasonExamples('source_silent', 1);
  const account = reasonExamples('needs_account', 1);
  const disagree = reasonExamples('sources_disagree', 2);

  const groq = bySlug.get('groq');
  const orr = bySlug.get('openrouter');
  const limitBits = (fl) => [
    fl.requests_per_minute != null && `${fl.requests_per_minute.toLocaleString('en-US')} requests per minute`,
    fl.requests_per_day != null && `${fl.requests_per_day.toLocaleString('en-US')} requests per day`,
    fl.tokens_per_minute != null && `${fl.tokens_per_minute.toLocaleString('en-US')} tokens per minute`,
    fl.tokens_per_day != null && `${fl.tokens_per_day.toLocaleString('en-US')} tokens per day`,
  ].filter(Boolean);
  const limitExample = (x) => (x && x.verified && x.free_limits && limitBits(x.free_limits).length
    ? `${L(x)}: ${andList(limitBits(x.free_limits))} (${esc(x.free_limits.scope || 'free plan')}; ${ext(x.free_limits.source, 'source')}, ${time(x.free_limits.checked)}).`
    : '');
  const unpublished = v.filter((x) => UNPUBLISHED_LIMITS.test(x.rate_limits || '')).sort(byName);
  const cardOnFile = v.filter((x) => x.card_required === true).sort(byName);
  const horde = bySlug.get('ai-horde');
  const hordeSla = horde && horde.verified && (horde.notes || '').split(/(?<=[.;])\s+/).find((t) => /SLA/.test(t));

  const wandb = bySlug.get('wandb-inference');
  const noTrainExample = (wandb && wandb.data_policy && wandb.data_policy.trains_on_prompts === false && wandb.data_policy.quote && wandb)
    || F.trainsFalse.filter((x) => x.data_policy.quote).sort(byScore)[0];
  const namedFalse = F.trainsFalse.filter((x) => x.data_policy.plan_named === true).length;
  const retention = ['gladia', 'cloudflare-workers-ai'].map((sl) => bySlug.get(sl)).filter((x) => x && x.data_policy && x.data_policy.retention);

  // Trial windows and stated no-expiry credits, from `expires` and `no_expiry`.
  const windows = v.filter((x) => x.category === 'trial' && typeof x.expires === 'string' && /^\d+\s+(day|days|month|months|year|years)$/.test(x.expires)).sort(byName);
  const noExpiry = v.filter((x) => x.no_expiry).sort(byName);

  // Worked example: commercial use allowed, no card, text LLM, says it does not train on prompts.
  const step1 = F.commercialNoCard;
  const step2 = step1.filter((x) => x.is_text_llm === true && x.data_policy && x.data_policy.trains_on_prompts === false).sort(byName);

  // Identity and region constraints recorded in the entries' notes (shown only while the provider is in the data).
  const IDENTITY = [
    ['google-agent-platform-express', /gmail\.com/i, 'express mode is only for @gmail.com developers new to Google Cloud'],
    ['siliconflow', /real-name/i, 'the free models are on its China platform and need real-name verification'],
    ['runware', /business email/i, 'the free credit needs a business email'],
  ].map(([slug, re, words]) => { const x = bySlug.get(slug); return x && x.verified && re.test(`${x.notes} ${x.free_tier}`) ? `${L(x)}: ${words}` : null; }).filter(Boolean);

  const c = F.commercial;
  const answer = `A free tier is fine for a prototype. Before you put one behind real users, check six things. All six are recorded in our dataset for every provider, with the provider’s own sentence and the day we read it. This guide shows how to read them, and why <strong>“unknown” means the provider’s docs don’t say, not “no”</strong>.`;
  const body =
    p(`The figures below cover the ${F.verified} verified providers in the dataset.`) +
    h2('The short version', 'short-version') +
    p('Use a free tier in production only if all of these hold:') +
    `<ol><li><strong>Commercial use is allowed</strong> on the free plan, in the provider’s own words.</li>` +
    `<li><strong>The limits cover your peak</strong>, not your average, and you know what happens at the limit (HTTP 429 or a bill).</li>` +
    `<li><strong>The data policy is acceptable</strong>: you know whether the provider trains on your prompts and how long it keeps them.</li>` +
    `<li><strong>Signup won’t block you or your team</strong>: card, phone, region or email-domain requirements.</li>` +
    `<li><strong>The free access has no end date</strong>, or you’ve planned for the day it ends.</li>` +
    `<li><strong>The facts are recent</strong>: checked against the provider’s docs within the last ${SLA_DAYS} days.</li></ol>` +
    p(`Only ${F.shortlist.length} of ${F.verified} verified providers currently combine commercial use allowed, no card required and a stated no-training policy${F.shortlist.length ? `: ${andList(F.shortlist.map(L))}` : ''}.${F.shortlist.length && F.shortlist.every((x) => x.data_policy.plan_named !== true) ? ' Even for these, the no-training sentence doesn’t name the free plan (see check 3).' : ''}`) +
    h2('1. Is commercial use allowed on the free tier?', 'commercial-use') +
    p('This is the check most people skip. In the dataset, <code>commercial_ok</code> is, for the verified providers:') +
    tableHtml('Commercial use on the free tier', ['Value', 'Providers', 'Meaning'], [
      ['<code>true</code>', c.true, 'The provider’s terms allow commercial use of the free access.'],
      ['<code>false</code>', c.false, 'The terms limit the free access to evaluation, testing or personal use.'],
      ['<code>"conditional"</code>', c.conditional, `Allowed under a stated condition${conditional.length ? ` (${andList(conditional.map(L))})` : ''}.`],
      ['<code>null</code>', c.null, 'Not confirmed: the provider’s pages don’t settle it (see below).'],
    ]) +
    (falseQuoted.length ? p('Real examples of <code>false</code>, with the provider’s words:') + `<ul>${falseQuoted.map((x) => { const k = fieldCheck(x, 'commercial_ok'); return `<li><strong>${L(x)}:</strong> “${escProse(k.quote)}” (${ext((k.sources || [])[0], 'source')}, read ${time(k.checked)}).</li>`; }).join('')}</ul>` : '') +
    (conditional.length ? p(`Conditional means read the condition: ${conditional.map((x) => `${L(x)}: ${esc(String(x.commercial_ok_condition || 'see its page').replace(/\.$/, ''))}`).join('; ')}.`) : '') +
    p(`Also check <strong>where your users are</strong>: terms can differ by region. The provider page has the notes.`) +
    related([`<a href="${prefix}collections/commercial-use">Commercial use collection</a>`]) +
    h2('What “null = not confirmed” means, with real examples', 'null-means') +
    p('A <code>null</code> flag is never a hidden “no” and never a hidden “yes”. Most nulls carry a reason (<code>field_checks</code>): which official pages we read, on what day, and why they don’t settle it. There are three reasons.') +
    (silent.length ? p(`<strong>The pages don’t say it (<code>source_silent</code>).</strong> We read the relevant official pages and none of them answers. <em>Example:</em> ${silent.map(exampleHtml).join(' ')}`) : '') +
    (account.length ? p(`<strong>Only an account would tell (<code>needs_account</code>).</strong> The public pages are silent and the answer appears only during signup. <em>Example:</em> ${account.map(exampleHtml).join(' ')}`) : '') +
    (disagree.length ? p(`<strong>Two official pages disagree (<code>sources_disagree</code>).</strong> We quote both and don’t pick one. <em>${disagree.length > 1 ? 'Examples' : 'Example'}:</em> ${disagree.map(exampleHtml).join(' ')}`) : '') +
    p('<strong>What to do with a null:</strong> treat it as a question to put to the provider, in writing, before you depend on it. For commercial use in production, don’t ship on a null.') +
    p(`Across the dataset the phone requirement is the least documented fact: ${F.phoneUnknown} of ${F.total} providers don’t state it.`) +
    related([`<a href="${prefix}coverage/">What the dataset doesn’t know yet</a>`, `<a href="${prefix}quality/">Data quality</a>`]) +
    h2('2. Will the limits hold under load?', 'limits') +
    `<ul>` +
    ((limitExample(groq) || limitExample(orr)) ? `<li><strong>Look at the tightest limit, not the headline.</strong> ${[limitExample(groq), limitExample(orr)].filter(Boolean).join(' ')}</li>` : '') +
    (unpublished.length ? `<li><strong>Unpublished means unknown.</strong> ${andList(unpublished.map(L))} publish no numeric free limit. Plan for throttling you can’t predict.</li>` : '') +
    `<li><strong>Know what happens at the limit.</strong> With no card on file, crossing a limit normally means HTTP 429, not a bill.${cardOnFile.length ? ` With a card on file (${andList(cardOnFile.map(L))}), read the billing page for what follows the free amount.` : ''}</li>` +
    (hordeSla ? `<li><strong>Volunteer and shared capacity has no SLA.</strong> ${L(horde)}’s notes: “${escProse(hordeSla.replace(/[.;]$/, ''))}”.</li>` : '') +
    `</ul>` +
    p(`Structured limits (<code>free_limits</code>, with source and date) exist for ${F.freeLimits} providers; the rest are in each provider’s rate-limits text.`) +
    h2('3. Does it train on your prompts, and how long does it keep them?', 'data-policy') +
    p(`${F.dataPolicy} providers have a quoted <code>data_policy</code>:`) +
    `<ul><li><strong>${F.trainsFalse.length} say they don’t train</strong> on your prompts${noTrainExample ? `, for example ${L(noTrainExample)}: “${esc(noTrainExample.data_policy.quote)}” (${ext(noTrainExample.data_policy.source, 'source')})` : ''}.</li>` +
    `<li><strong>${F.trainsTrue.length} say they do</strong>${F.trainsTrue.length ? `, among them ${andList([...F.trainsTrue].sort(byScore).slice(0, 3).map(L))}` : ''}.</li>` +
    `<li><strong>${F.trainsNull.length} are unsettled</strong>: the provider’s own pages conflict or are silent${F.trainsNull.length ? ` (${andList([...F.trainsNull].sort(byName).slice(0, 3).map(L))} among them)` : ''}.</li></ul>` +
    p(`Read <code>plan_named</code> too: whether the provider’s sentence names the free plan. ${namedFalse === 0 ? `For every one of the ${F.trainsFalse.length} “doesn’t train” rows the answer is no: the sentence doesn’t name the free plan. That doesn’t mean the free plan is excluded; it means the sentence is general.` : `Of the ${F.trainsFalse.length} “doesn’t train” rows, ${namedFalse} name the free plan; for the rest the sentence is general.`}`) +
    (retention.length ? p(`Retention is a separate question. ${retention.map((x) => `${L(x)}: ${escProse(x.data_policy.retention)}`).join('. ')}.`) : '') +
    related([`<a href="${prefix}collections/no-training">No-training collection</a>`, `<a href="${prefix}data-policy/">Data policy, provider by provider</a>`]) +
    h2('4. Will signup work for you?', 'signup') +
    `<ul><li><strong>Card:</strong> ${F.noCard} of ${F.verified} verified providers need no card for the free access. A card on file changes what happens at the limit (check 2).</li>` +
    `<li><strong>Phone:</strong> confirmed not required for ${F.phoneFalse}; required for ${F.phoneTrue.length}${F.phoneTrue.length ? ` (${andList(F.phoneTrue.map(L))})` : ''}; unknown for the rest.</li>` +
    (IDENTITY.length ? `<li><strong>Region and identity:</strong> ${IDENTITY.join('; ')}.</li>` : '') +
    `</ul>` +
    related([`<a href="${prefix}guides/free-llm-api-no-credit-card-no-phone">Free LLM APIs with no credit card and no phone</a>`]) +
    h2('5. When does the free access end?', 'expiry') +
    `<ul><li><strong>Ongoing</strong> tiers renew (daily or monthly): ${F.ongoing} providers. <strong>Trials</strong> are one-time: ${F.trial}.</li>` +
    ((windows.length || noExpiry.length) ? `<li>${windows.length ? `Some trials have a window: ${andList(windows.map((x) => `${L(x)} ${esc(x.expires)}`))}.` : ''}${noExpiry.length ? ` Others state no expiry: ${andList(noExpiry.map(L))} say their credit does not expire.` : ''}</li>` : '') +
    `</ul>` +
    p(`For production, prefer an ongoing tier, and keep a second provider wired behind the same SDK (see <a href="${prefix}guides/openai-api-alternatives">the OpenAI alternatives guide</a>).`) +
    h2('6. How fresh is the information?', 'freshness') +
    p(`Free tiers change without notice. Our rule: every verified entry is re-confirmed against the provider’s own docs <strong>within ${SLA_DAYS} days</strong>; after ${DUE_SOON_DAYS} days it’s flagged as due. Each provider page shows the date, and <a href="${prefix}changes/">What changed</a> logs every change, month by month.`) +
    related([`<a href="${prefix}changes/">What changed</a>`, `<a href="${prefix}methodology/">Methodology</a>`]) +
    h2('A worked example', 'worked-example') +
    p('You need chat for a commercial side project, no card, and you’d rather your prompts weren’t used for training.') +
    `<ol><li>Filter: commercial use <code>true</code>, card <code>false</code> → ${plural(step1.length, 'provider')}. Keep text LLMs.</li>` +
    `<li>Data policy <code>trains_on_prompts: false</code> → ${step2.length ? andList(step2.map((x) => `${L(x)} (${escProse(x.free_tier)})`)) : 'none today'}.</li>` +
    (step2.length ? `<li>Limits: ${step2.map((x) => `${L(x)}: ${escProse(x.rate_limits)}`).join('; ')}. Anything unpublished is an unknown to test before launch.</li>` +
      `<li>Freshness: ${step2.map((x) => `${esc(x.name)} checked ${time(x.last_verified)}`).join(', ')}.</li>` : '') +
    `</ol>` +
    p(`Result: a short list of ${step2.length}, with its unknowns named, instead of a guess.`) +
    (step2.length >= 2 ? related([`<a href="${prefix}compare/?compare=${step2.slice(0, 2).map((x) => esc(x.slug)).join(',')}">Compare ${andList(step2.slice(0, 2).map((x) => esc(x.name)))}</a>`]) : '');

  const faq = [
    { q: 'Can I use a free LLM API commercially?', a: `Sometimes. ${c.true} of ${F.verified} verified providers allow it on the free tier in their own terms; ${c.false} forbid it; ${c.conditional} allow it under a condition; for ${c.null} the docs don’t say.` },
    { q: 'Is “unknown” safe to treat as “allowed”?', a: 'No. It means the provider’s pages don’t answer. Ask the provider, or pick one that states it.' },
    { q: 'Which free LLM APIs don’t train on my data?', a: `${F.trainsFalse.length} providers say so in their own words. The list, with each sentence, is in the no-training collection.` },
    { q: 'How often is this data checked?', a: `Every verified entry within ${SLA_DAYS} days, against the provider’s own pages.` },
  ];
  return { count: F.verified, answer, body, faq, featured: F.shortlist };
}

// ---------- guide 3: no credit card and no phone ----------
const catchGroup = (x) => {
  const m = x.modalities || [];
  if (x.is_text_llm === true && x.category === 'ongoing') return 'Chat LLMs';
  if (m.includes('ocr')) return 'OCR and documents';
  if (m.includes('audio') && !m.includes('text')) return 'Speech';
  if (m.includes('embeddings')) return 'Embeddings';
  return 'Credits and multi-model';
};
const CATCH_ORDER = ['Chat LLMs', 'Credits and multi-model', 'Embeddings', 'Speech', 'OCR and documents'];
const typeWords = (x) => `${x.category === 'ongoing' ? 'Ongoing' : 'Trial'} · ${(x.modalities || []).join(', ')}`;

function noCardNoPhoneGuide({ providers, prefix }) {
  const list = noCardNoPhone(providers);
  const L = (x) => provLink(x, prefix);
  const v = providers.filter((x) => x.verified === true);
  const chat = list.filter((x) => x.is_text_llm === true && x.category === 'ongoing');
  const phoneUnknown = v.filter((x) => x.card_required === false && x.phone_required == null).sort(byScore);
  const phoneRequired = v.filter((x) => x.card_required === false && x.phone_required === true).sort(byName);
  const anon = providers.filter((x) => x.anonymous_access).sort(byName);
  const withPhoneCheck = list.filter((x) => fieldCheck(x, 'phone_required'));
  const commercial = {
    yes: list.filter((x) => x.commercial_ok === true),
    no: list.filter((x) => x.commercial_ok === false),
    cond: list.filter((x) => x.commercial_ok === 'conditional'),
    unk: list.filter((x) => x.commercial_ok == null),
  };
  const gemini = providers.find((x) => x.slug === 'google-gemini');
  const groq = providers.find((x) => x.slug === 'groq');
  const phoneFaq = (x) => {
    if (!x) return null;
    const cardBit = x.card_required === false ? ' No card is needed for its free tier.' : '';
    if (x.phone_required === false) return `No, per its entry.${cardBit}`;
    if (x.phone_required === true) return `Yes, per its entry.${cardBit}`;
    const c = fieldCheck(x, 'phone_required');
    return `${x.name}’s pages don’t say${c && c.note ? `: ${esc(c.note)} (read ${esc(c.checked)})` : ''}.${cardBit}`;
  };
  const sourceOf = (x) => ext(x.docs_url, 'Source');

  const groups = CATCH_ORDER.map((g) => [g, list.filter((x) => catchGroup(x) === g)]).filter(([, l]) => l.length);
  const answer = `${list.length} of the ${v.length} verified providers give free API access with <strong>no credit card and no phone verification</strong>, per our dataset. Only ${chat.length} of them offer${chat.length === 1 ? 's' : ''} ongoing free text generation${chat.length ? `: ${andList(chat.map((x) => esc(x.name)))}` : ''}. The rest are credits or specialised APIs: speech, OCR, embeddings and image generation. Each has a catch, listed below.`;

  const body =
    h2('The list', 'the-list') +
    tableHtml('Free APIs with no card and no phone', ['Provider', 'What you get free', 'Type', 'Commercial use', 'Last checked'],
      list.map((x) => [L(x), esc(x.free_tier), esc(typeWords(x)), commercialWords(x), time(x.last_verified)])) +
    related([`<a href="${prefix}collections/no-credit-card">No credit card collection</a>`, `<a href="${prefix}collections/no-phone">No phone collection</a>`, `<a href="${prefix}guides/free-llm-api-without-credit-card">Free LLM APIs with no credit card</a>`]) +
    h2('The catch, provider by provider', 'the-catch') +
    p('Everything below is from each provider’s entry, which quotes its own pages.') +
    groups.map(([g, l]) => `<h3>${esc(g)}</h3><ul>${l.map((x) => `<li><strong>${L(x)}.</strong> ${escProse(x.notes)} ${sourceOf(x)}</li>`).join('')}</ul>`).join('') +
    h2(`No card, phone not confirmed: ${phoneUnknown.length} more`, 'phone-not-confirmed') +
    p(`Another ${phoneUnknown.length} of the verified providers need no card, but their pages don’t say whether signup asks for a phone number. Among them are some of the most used free tiers: ${andList(phoneUnknown.slice(0, 7).map(L))}.`) +
    p(`“Not confirmed” means we read their official pages and none answers the question.${gemini && fieldCheck(gemini, 'phone_required') && gemini.phone_required == null ? ` For ${esc(gemini.name)}: “${esc(fieldCheck(gemini, 'phone_required').note)}” (read ${time(fieldCheck(gemini, 'phone_required').checked)}).` : ''} It doesn’t mean they ask for a phone; it means their docs don’t say.`) +
    (phoneRequired.length ? p(`<strong>No card, but a phone is required:</strong> ${andList(phoneRequired.map((x) => { const c = fieldCheck(x, 'phone_required'); return c && c.status === 'stated' && c.quote ? `${L(x)} (“${esc(c.quote)}”)` : L(x); }))}.`) : '') +
    related([`<a href="${prefix}coverage/">Open questions per flag</a>`, `<a href="${prefix}guides/choose-free-llm-api-for-production">what “unknown” means</a>`]) +
    h2('No account at all', 'no-account') +
    (anon.length ? p(`${anon.length === 1 ? 'One provider' : `${anon.length} providers`} can be called with <strong>no account</strong>, each with the provider’s own sentence: ${anon.map((x) => `${L(x)} (“${escProse(x.anonymous_access.quote)}”${x.anonymous_access.note ? `; ${escProse(x.anonymous_access.note)}` : ''})`).join('; ')}.`) : p('No provider in the dataset records anonymous access today.')) +
    related([`<a href="${prefix}collections/anonymous-access">No-account collection</a>`, `<a href="${prefix}guides/free-llm-api-no-signup">Free LLM APIs with no phone and no card</a>`]) +
    h2('How sure is “no phone”?', 'how-sure') +
    p(`For these ${list.length} providers, the dataset records “no card” and “no phone”. ${withPhoneCheck.length === 0 ? 'None of them has a provider sentence registered for the phone answer in <code>field_checks</code> yet: the answer comes from the entry’s verification.' : `${withPhoneCheck.length} of them have a recorded phone check in <code>field_checks</code> (${andList(withPhoneCheck.map(L))}); for the others the answer comes from the entry’s verification, with no provider sentence registered yet.`} When a re-check finds no current page that states an unsourced flag, the flag moves to “not confirmed”, and the provider drops off this list. Each provider page shows the current state and the date.`);

  const faq = [
    { q: 'Which free LLM API needs no credit card and no phone number?', a: chat.length ? `For general chat: ${andList(chat.map((x) => `${esc(x.name)} (${esc(x.free_tier)})`))}.` : 'None of the providers with an ongoing chat tier is confirmed for both today; see the list for speech, OCR and embeddings APIs.' },
    gemini && { q: 'Does Gemini need a phone number?', a: phoneFaq(gemini) },
    groq && { q: 'Does Groq need a phone number?', a: phoneFaq(groq) },
    {
      q: 'Can I use these commercially?',
      a: `${commercial.yes.length} of the ${list.length} allow it on the free tier.${commercial.no.length ? ` ${andList(commercial.no.map((x) => esc(x.name)))} ${commercial.no.length === 1 ? 'doesn’t' : 'don’t'}.` : ''}${commercial.cond.length ? ` ${andList(commercial.cond.map((x) => esc(x.name)))} allow it under a condition.` : ''}${commercial.unk.length ? ` For ${andList(commercial.unk.map((x) => esc(x.name)))} it isn’t confirmed.` : ''}`,
    },
  ].filter(Boolean);
  return { count: list.length, answer, body, faq, featured: list };
}

const RENDER = {
  'openai-api-alternatives': alternativesGuide,
  'choose-free-llm-api-for-production': productionGuide,
  'free-llm-api-no-credit-card-no-phone': noCardNoPhoneGuide,
};

/** The page parts of one long guide: { count, answer, body, faq, featured, title, metaDesc }. */
export function longGuidePage(guide, { providers, notFree, prefix = '../' }) {
  const render = RENDER[guide.slug];
  if (!render) throw new Error(`long-guides: no renderer for ${guide.slug}`);
  const out = render({ providers, notFree, prefix });
  const fill = (t) => t.replaceAll('{n}', String(out.count));
  return { ...out, title: fill(guide.title), metaDesc: fill(guide.metaDesc) };
}
