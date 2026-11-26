// long-guides.mjs — the long-form guides under /guides/: OpenAI alternatives, production checklist, no card and no
// phone, one per modality (embeddings, speech, OCR, image generation) and one per use case (coding assistants, RAG,
// AI agents, a chatbot side project, students). The copy is editorial; every number, limit, flag, date and provider list in it is computed here from
// data/providers.json and data/not-free.json at build time, so the pages cannot drift from the data. A provider the
// copy names by hand (an example, a quote) is looked up in the data and dropped when it no longer qualifies.
//
// Pure: each renderer takes the dataset and returns the page parts ({ answer, body, faq, count, featured }); build.mjs
// adds the page shell, JSON-LD, sitemap entry and hub card. scripts/long-guides.test.mjs pins the lists to the data.

import { recScore, SLA_DAYS, DUE_SOON_DAYS } from './rules.mjs';
import { fieldCheck, REASON_LABEL } from './field-checks.mjs';
import { codeHtmlEsc, pythonEmbeddingsQuickstart, pythonStringLiteral, pythonChatQuickstart, curlChatQuickstart } from './quickstart.mjs';
import { CONSTRAINTS, constraintState, toHash, explorerHref } from './find.mjs';

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
  // The modality guides replace the short list guides that had these slugs, so their URLs and links stay.
  {
    slug: 'free-embeddings-apis',
    title: 'Free Embedding APIs ({n}, Checked): Limits and Terms',
    metaDesc: 'The {n} free embedding APIs in our dataset, for search and RAG: free limits, card and phone, commercial use and data policy, each checked at source.',
    h1: 'Free embedding APIs for search and RAG',
    card: 'Embeddings / RAG',
    blurb: 'Free embedding APIs compared: limits, terms, data use.',
    ogTitle: 'Free embedding APIs',
    ogSubtitle: 'limits · commercial use · data policy',
  },
  {
    slug: 'free-speech-to-text-apis',
    title: 'Free Speech-to-Text and Text-to-Speech APIs ({n}, Checked)',
    metaDesc: '{n} free speech-to-text and text-to-speech APIs: free minutes, characters or credits, card and phone, commercial use and data policy. Checked at source.',
    h1: 'Free speech-to-text and text-to-speech APIs',
    card: 'Speech (STT/TTS)',
    blurb: 'Free transcription and voice APIs, with the catch for each.',
    ogTitle: 'Free speech-to-text and TTS APIs',
    ogSubtitle: 'limits · commercial use · data policy',
  },
  {
    slug: 'free-ocr-document-ai-apis',
    title: 'Free OCR and Document-Parsing APIs ({n}, Checked)',
    metaDesc: '{n} free OCR and document-parsing APIs for PDFs and scans: free pages or credits, card and phone, commercial use and data policy. Checked at source.',
    h1: 'Free OCR and document-parsing APIs',
    card: 'OCR / document AI',
    blurb: 'Free OCR and document parsing, compared for PDFs and scans.',
    ogTitle: 'Free OCR and document-parsing APIs',
    ogSubtitle: 'limits · commercial use · data policy',
  },
  {
    slug: 'free-image-generation-apis',
    title: 'Free Image Generation APIs ({n}, Checked): Limits and Terms',
    metaDesc: '{n} free image generation APIs, plus editing: free credits and limits, card and phone, commercial use, watermarks and data policy. Checked at source.',
    h1: 'Free image generation APIs',
    card: 'Image generation',
    blurb: 'Free image generation, with licences and watermarks.',
    ogTitle: 'Free image generation APIs',
    ogSubtitle: 'licences · watermarks · data policy',
  },
  // The use-case guides: organised by what you build rather than by modality. `group` puts them in their own section
  // of the hub.
  {
    slug: 'free-llm-api-for-coding',
    group: 'use-case',
    title: 'Free LLM API for Coding: {n} OpenAI-Compatible Models, Speed and Limits',
    metaDesc: 'Free LLM APIs for coding assistants and IDE tools: {n} OpenAI-compatible providers with base_url, a free model, published speed and rate limits.',
    h1: 'Free LLM APIs for coding assistants',
    card: 'For coding assistants',
    blurb: 'OpenAI-compatible models, speed and limits for an IDE session.',
    ogTitle: 'Free LLM APIs for coding',
    ogSubtitle: 'base_url · published speed · rate limits',
  },
  {
    slug: 'free-api-for-rag',
    group: 'use-case',
    title: 'Free API for RAG: Embeddings, Reranking and an LLM ({n} Providers)',
    metaDesc: 'Build a RAG app on free APIs: {n} providers for embeddings, reranking and a text LLM, a worked stack with code, and each one’s limits and terms.',
    h1: 'Free APIs to build a RAG app',
    card: 'For a RAG app',
    blurb: 'Embeddings, reranking and an LLM: a free stack, with code.',
    ogTitle: 'Free APIs for a RAG app',
    ogSubtitle: 'embeddings · reranking · LLM · all free',
  },
  {
    slug: 'free-llm-api-for-ai-agents',
    group: 'use-case',
    title: 'Free LLM API for AI Agents: Compatibility, Rate Limits, Terms ({n})',
    metaDesc: 'Free LLM APIs for AI agents: {n} free text LLMs with OpenAI compatibility, per-minute limits, commercial use and what the data says on tool calling.',
    h1: 'Free LLM APIs for AI agents',
    card: 'For AI agents',
    blurb: 'OpenAI compatibility, rate limits and the commercial-use catch.',
    ogTitle: 'Free LLM APIs for AI agents',
    ogSubtitle: 'compatibility · rate limits · commercial use',
  },
  {
    slug: 'free-chatbot-api',
    group: 'use-case',
    title: 'Free Chatbot API for a Side Project: No Card, No Phone ({n} Checked)',
    metaDesc: 'Free chatbot APIs for a side project: {n} free text LLMs checked for no card, no phone, commercial use and training on prompts, in the providers’ words.',
    h1: 'Free LLM APIs for a chatbot side project',
    card: 'For a chatbot side project',
    blurb: 'No card, no phone, commercial use, data policy: four checks.',
    ogTitle: 'Free chatbot APIs',
    ogSubtitle: 'no card · no phone · commercial use · data policy',
  },
  {
    slug: 'free-ai-api-for-students',
    group: 'use-case',
    title: 'Free AI API for Students: No Card, No Signup ({n}, Checked)',
    metaDesc: 'Free AI APIs for students and learning: {n} renewing free tiers with no credit card, the ones you can call with no account, quotas and student programs.',
    h1: 'Free AI APIs for students and learning',
    card: 'For students and learning',
    blurb: 'No card, no account, renewing quotas, student programs.',
    ogTitle: 'Free AI APIs for students',
    ogSubtitle: 'no card · no account · renewing quotas',
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
  const dp = v.filter((x) => x.data_policy);
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
    phoneUnknown: count(v, (x) => x.phone_required == null),
    freeLimits: count(v, (x) => x.free_limits && typeof x.free_limits === 'object'),
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
    p(`Across the dataset the phone requirement is the least documented fact: ${F.phoneUnknown} of ${F.verified} verified providers don’t state it.`) +
    related([`<a href="${prefix}coverage/">What the dataset doesn’t know yet</a>`, `<a href="${prefix}quality/">Data quality</a>`]) +
    h2('2. Will the limits hold under load?', 'limits') +
    `<ul>` +
    ((limitExample(groq) || limitExample(orr)) ? `<li><strong>Look at the tightest limit, not the headline.</strong> ${[limitExample(groq), limitExample(orr)].filter(Boolean).join(' ')}</li>` : '') +
    (unpublished.length ? `<li><strong>Unpublished means unknown.</strong> ${andList(unpublished.map(L))} publish no numeric free limit. Plan for throttling you can’t predict.</li>` : '') +
    `<li><strong>Know what happens at the limit.</strong> With no card on file, crossing a limit normally means HTTP 429, not a bill.${cardOnFile.length ? ` With a card on file (${andList(cardOnFile.map(L))}), read the billing page for what follows the free amount.` : ''}</li>` +
    (hordeSla ? `<li><strong>Volunteer and shared capacity has no SLA.</strong> ${L(horde)}’s notes: “${escProse(hordeSla.replace(/[.;]$/, ''))}”.</li>` : '') +
    `</ul>` +
    p(`Structured limits (<code>free_limits</code>, with source and date) exist for ${F.freeLimits} of the ${F.verified} verified providers; the rest are in each provider’s rate-limits text.`) +
    h2('3. Does it train on your prompts, and how long does it keep them?', 'data-policy') +
    p(`${F.dataPolicy} of the ${F.verified} verified providers have a quoted <code>data_policy</code>:`) +
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

// ---------- guides 4 to 7: one per modality (embeddings, speech, OCR, image generation) ----------
// Each guide lists every verified provider with that modality, except the NO_FREE_MODEL_CALLS entries, which a
// sentence names instead. The dataset has no field for some splits (speech-to-text or text-to-speech, image
// generation or editing), so those are read from the words of each entry, and the page says so.
const hasModality = (m) => (x) => (x.modalities || []).includes(m);
const entryText = (x) => [x.free_tier, x.rate_limits, x.notes, x.best_for, ...(x.models_free || [])].filter(Boolean).join(' ');
export const MENTIONS_STT = /speech[- ]to[- ]text|\bSTT\b|transcri|whisper|\bASR\b|-asr\b|speech recognition/i;
export const MENTIONS_TTS = /text[- ]to[- ]speech|\bTTS\b|-tts\b/i;
export const MENTIONS_IMAGE_GENERATION = /flux|sdxl|stable[- ]diffusion|text[- ]to[- ]image|image generation|generat\w* images?|image models?|-image\b/i;
const EMBEDDING_MODEL = /embed|\bbge\b|bge-|\be5\b|e5-|gte-|minilm/i;
export const embeddingModel = (x) => (x.models_free || []).find((m) => EMBEDDING_MODEL.test(m)) || null;
// The sentences of an entry (free tier and notes) that mention a watermark, quoted as they stand: an entry can
// mention one to say it is gone, so the page quotes the sentence instead of calling it a watermark.
export const watermarkSentences = (x) => [x.free_tier, x.notes].filter(Boolean).flatMap((t) => t.split(/(?<=[.;])\s+/)).filter((t) => /watermark/i.test(t));

export function modalitySets(providers) {
  const v = providers.filter((x) => x.verified === true);
  const of = (m) => v.filter((x) => hasModality(m)(x) && !NO_FREE_MODEL_CALLS.includes(x.slug)).sort(byScore);
  const noCalls = (m) => v.filter((x) => hasModality(m)(x) && NO_FREE_MODEL_CALLS.includes(x.slug)).sort(byName);
  const image = of('image');
  return {
    verified: v.length,
    embeddings: of('embeddings'),
    speech: of('audio'),
    ocr: of('ocr'),
    image,
    imageGeneration: image.filter((x) => MENTIONS_IMAGE_GENERATION.test(entryText(x))),
    imageOther: image.filter((x) => !MENTIONS_IMAGE_GENERATION.test(entryText(x))),
    noCalls: { embeddings: noCalls('embeddings'), speech: noCalls('audio'), ocr: noCalls('ocr'), image: noCalls('image') },
  };
}
export const speechMentions = (x) => ({ stt: MENTIONS_STT.test(entryText(x)), tts: MENTIONS_TTS.test(entryText(x)) });

const wrapCode = (t) => `<code>${esc(t).replace(/\//g, '/<wbr>')}</code>`;
const reasonOf = (x, field) => { const c = fieldCheck(x, field); return REASON_LABEL[c && c.status] || REASON_LABEL.not_checked; };
const flagWords = (x, field) => (x[field] === false ? 'No' : x[field] === true ? 'Yes' : `Not confirmed (${reasonOf(x, field)})`);
const typeLine = (x) => (x.category === 'ongoing' ? 'Ongoing free tier' : 'One-time credit');
const names = (list) => andList(list.map((x) => esc(x.name)));
// The verb that agrees with a list of providers: "Groq allows", "Groq and Gemini allow".
const agree = (list, one, many) => (list.length === 1 ? one : many);
const isOngoing = (x) => x.category === 'ongoing';
const commercialSplit = (list) => ({
  yes: list.filter((x) => x.commercial_ok === true),
  no: list.filter((x) => x.commercial_ok === false),
  cond: list.filter((x) => x.commercial_ok === 'conditional'),
  unk: list.filter((x) => x.commercial_ok == null),
});
const trainsSplit = (list) => ({
  no: list.filter((x) => x.data_policy && x.data_policy.trains_on_prompts === false),
  yes: list.filter((x) => x.data_policy && x.data_policy.trains_on_prompts === true),
  open: list.filter((x) => !x.data_policy || x.data_policy.trains_on_prompts == null),
});

export function dataUseWords(x) {
  const dp = x.data_policy;
  if (!dp) return 'Not recorded';
  if (dp.trains_on_prompts === true) return 'Says it can use your inputs for training';
  if (dp.trains_on_prompts === false) return 'Says it doesn’t train on your inputs';
  return 'Unsettled: its pages conflict or are silent';
}

/** The comparison table of a modality guide; `extra` adds one column ({ head, cell }) or several (an array) after the
 * provider; `model` adds a free chat model ID from the entry under the base URL. */
function modalityTable(label, list, L, { baseUrl = false, model = false, extra = null } = {}) {
  const extras = [].concat(extra || []);
  const providerCell = (x) => `${L(x)}<br><small>${typeLine(x)}</small>` +
    (baseUrl && x.openai_compatible === true && httpsOnly(x.openai_base_url) ? `<br><small>base_url</small> ${wrapCode(x.openai_base_url)}` : '') +
    (model ? `<br><small>model</small> ${exampleChatModel(x) ? wrapCode(exampleChatModel(x)) : '<span class="notes">see the provider page</span>'}` : '');
  const commercialCell = (x) => commercialWords(x) +
    (x.commercial_ok === 'conditional' && x.commercial_ok_condition ? `<br><span class="notes">${esc(x.commercial_ok_condition)}</span>` : '') +
    (x.commercial_ok == null ? `<br><span class="notes">${esc(reasonOf(x, 'commercial_ok'))}</span>` : '');
  const dataCell = (x) => `${esc(dataUseWords(x))}${x.data_policy && httpsOnly(x.data_policy.source) ? ` (${ext(x.data_policy.source, 'source')})` : ''}`;
  const head = ['Provider', ...extras.map((e) => e.head), 'What’s free and the published limits', 'Card and phone', 'Commercial use', 'Data use', 'Checked'];
  return tableHtml(label, head, list.map((x) => [
    providerCell(x), ...extras.map((e) => e.cell(x)),
    `${esc(x.free_tier)}<br><span class="notes">${esc(x.rate_limits)}</span>`,
    `Card: ${esc(flagWords(x, 'card_required'))}<br>Phone: ${esc(flagWords(x, 'phone_required'))}`,
    commercialCell(x), dataCell(x), checkedCell(x),
  ]));
}

const FLAG_LABEL = { commercial_ok: 'Commercial use', card_required: 'The card requirement', phone_required: 'The phone requirement' };
/** The gotchas of a modality guide: each entry's notes, then what the data can't confirm, with the recorded reasons. */
function modalityGotchas(list, L, { noCalls = [], what, catches = true }) {
  const unknowns = Object.keys(FLAG_LABEL).map((field) => {
    const nulls = list.filter((x) => x[field] == null);
    if (!nulls.length) return '';
    const ex = nulls.map((x) => ({ x, c: fieldCheck(x, field) })).find(({ c }) => c && c.note);
    return `<li><strong>${FLAG_LABEL[field]}</strong> isn’t confirmed for ${nulls.length} of ${list.length}: ${andList(nulls.map((x) => `${L(x)} (${esc(reasonOf(x, field))})`))}.` +
      (ex ? ` For example, ${L(ex.x)}: “${escProse(ex.c.note)}” (read ${time(ex.c.checked)}).` : '') + `</li>`;
  }).join('');
  const noPolicy = list.filter((x) => !x.data_policy);
  const windows = list.filter((x) => typeof x.expires === 'string' && x.expires);
  const noExpiry = list.filter((x) => x.no_expiry && x.no_expiry.quote);
  const anon = list.filter((x) => x.anonymous_access && x.anonymous_access.quote);
  const watermarks = list.filter((x) => watermarkSentences(x).length);
  return h2('Gotchas', 'gotchas') +
    p('Everything below comes from each provider’s entry, which quotes the provider’s own pages. A flag the pages don’t settle stays “not confirmed”, with the reason; it is never a hidden yes or no.') +
    `<h3>What the data can’t confirm</h3><ul>${unknowns}` +
    (noPolicy.length ? `<li><strong>No quoted data policy</strong> is recorded for ${noPolicy.length} of ${list.length}: ${andList(noPolicy.map(L))}.</li>` : '') +
    `</ul>` +
    ((windows.length || noExpiry.length || anon.length || watermarks.length) ? `<h3>Expiry, account and output</h3><ul>` +
      (windows.length ? `<li><strong>Free access with an end date:</strong> ${andList(windows.map((x) => `${L(x)} (${esc(x.expires)})`))}.</li>` : '') +
      (noExpiry.length ? `<li><strong>Credit that doesn’t expire</strong>, in the provider’s words: ${noExpiry.map((x) => `${L(x)}: “${escProse(x.no_expiry.quote)}”`).join('; ')}.</li>` : '') +
      (anon.length ? `<li><strong>No account needed</strong> for some use: ${anon.map((x) => `${L(x)} (“${escProse(x.anonymous_access.quote)}”${x.anonymous_access.note ? `; ${escProse(x.anonymous_access.note)}` : ''})`).join('; ')}.</li>` : '') +
      (watermarks.length ? `<li><strong>Watermarks:</strong> ${watermarks.map((x) => `${L(x)}: “${escProse(watermarkSentences(x).join(' '))}”`).join('; ')}.</li>` : '') +
      `</ul>` : '') +
    (noCalls.length ? p(`${andList(noCalls.map(L))} also ${noCalls.length === 1 ? 'lists' : 'list'} ${what} but ${noCalls.length === 1 ? 'is' : 'are'} left out of the table: per ${noCalls.length === 1 ? 'its entry' : 'their entries'}, ${noCalls.map((x) => `“${escProse(x.free_tier)}”`).join('; ')}.`) : '') +
    (catches ? `<h3>The catch, provider by provider</h3><ul>${list.filter((x) => x.notes).map((x) => `<li><strong>${L(x)}.</strong> ${escProse(x.notes)}</li>`).join('')}</ul>` : '');
}

const compareLink = (list, prefix) => (list.length >= 2
  ? `<a href="${prefix}compare/?compare=${list.slice(0, 2).map((x) => esc(x.slug)).join(',')}">${andList(list.slice(0, 2).map((x) => esc(x.name)))} side by side</a>`
  : '');
const listOrNone = (list, L, none) => (list.length ? andList(list.map(L)) : none);

// ---------- guide 4: free embedding APIs ----------
// The quickstart provider: OpenAI-compatible, with a base URL and a free embedding model ID in its entry; no card and
// no phone first, then no card, then the rest, each by score.
const qsRank = (x) => (x.card_required === false && x.phone_required !== true ? 0 : x.card_required === false ? 1 : 2);
export const embeddingsQuickstartProvider = (list) =>
  list.filter((x) => x.openai_compatible === true && httpsOnly(x.openai_base_url) && embeddingModel(x)).sort((a, b) => qsRank(a) - qsRank(b) || byScore(a, b))[0] || null;

function embeddingsGuide({ providers, prefix }) {
  const S = modalitySets(providers);
  const list = S.embeddings;
  const L = (x) => provLink(x, prefix);
  const ongoing = list.filter(isOngoing);
  const trial = list.filter((x) => !isOngoing(x));
  const compat = list.filter((x) => x.openai_compatible === true);
  const native = list.filter((x) => x.openai_compatible !== true);
  const rerank = list.filter(hasModality('rerank'));
  const c = commercialSplit(list);
  const t = trainsSplit(list);
  const qs = embeddingsQuickstartProvider(list);

  const answer = `${list.length} of the ${S.verified} verified providers in our dataset include embedding models in their free access: ${ongoing.length} with an ongoing free tier and ${trial.length} with a one-time credit. ${compat.length} of them list an OpenAI-compatible API, so the OpenAI SDK’s embeddings call works with a different <code>base_url</code>. The table compares free limits, card and phone, commercial use and data policy.`;
  const body =
    h2('Who this guide is for', 'who-its-for') +
    p(`Developers building semantic search, retrieval-augmented generation (RAG), clustering or deduplication who want to prototype without paying for embeddings. For the chat model of a RAG stack, see <a href="${prefix}guides/openai-api-alternatives">free OpenAI API alternatives</a>; to reorder search results, see <a href="${prefix}guides/free-reranking-apis">free reranking APIs</a>; to get text out of PDFs first, see <a href="${prefix}guides/free-ocr-document-ai-apis">free OCR APIs</a>.`) +
    h2('Free embedding APIs compared', 'compared') +
    p('Sorted by our recommendation score. The base URL is shown where the provider lists an OpenAI-compatible API.') +
    modalityTable('Free embedding APIs compared', list, L, { baseUrl: true }) +
    related([`<a href="${prefix}collections/multimodal">Multimodal collection</a>`, compareLink(list, prefix)].filter(Boolean)) +
    h2('How to choose', 'how-to-choose') +
    `<ol>` +
    `<li><strong>Pick the model before you index.</strong> Vectors from different models can’t be compared, so changing the model later means embedding every document again. Choose for the language and length of your documents, then stay with it.</li>` +
    `<li><strong>Renewing or one-time.</strong> Ongoing free tiers: ${listOrNone(ongoing, L, 'none')}. One-time credits: ${listOrNone(trial, L, 'none')}. A one-time credit can cover a first index, but queries keep costing after it runs out.</li>` +
    `<li><strong>Same SDK as your chat model.</strong> ${compat.length ? `${andList(compat.map(L))} ${agree(compat, 'lists', 'list')} an OpenAI-compatible API.` : 'None lists an OpenAI-compatible API.'}${native.length ? ` ${andList(native.map(L))} ${agree(native, 'uses its', 'use their')} own API.` : ''} Compatibility is recorded per provider, not per endpoint, so confirm the <code>/embeddings</code> route on the provider page. See the <a href="${prefix}collections/openai-compatible">OpenAI-compatible collection</a>.</li>` +
    `<li><strong>Commercial use.</strong> ${c.yes.length ? `${andList(c.yes.map(L))} ${agree(c.yes, 'allows', 'allow')} it on the free tier.` : 'None confirms it on the free tier.'}${c.no.length ? ` ${andList(c.no.map(L))} ${agree(c.no, 'doesn’t', 'don’t')}.` : ''}${c.cond.length ? ` ${andList(c.cond.map(L))} ${agree(c.cond, 'allows', 'allow')} it under a condition.` : ''}${c.unk.length ? ` For the other ${c.unk.length} the provider’s pages don’t settle it.` : ''} See the <a href="${prefix}collections/commercial-use">commercial-use collection</a>.</li>` +
    `<li><strong>Your documents.</strong> Everything you index is sent to the provider. ${t.no.length ? `${andList(t.no.map(L))} ${agree(t.no, 'says it doesn’t', 'say they don’t')} train on your inputs.` : ''}${t.yes.length ? ` ${andList(t.yes.map(L))} ${agree(t.yes, 'says it can', 'say they can')}.` : ''}${t.open.length ? ` For ${t.open.length} more, no quoted policy settles it.` : ''} See <a href="${prefix}data-policy/">data policy, provider by provider</a> and the <a href="${prefix}collections/no-training">no-training collection</a>.</li>` +
    (rerank.length ? `<li><strong>Reranking with the same key.</strong> ${andList(rerank.map(L))} also ${agree(rerank, 'lists a reranker in its', 'list a reranker in their')} free access. See <a href="${prefix}guides/free-reranking-apis">free reranking APIs</a>.</li>` : '') +
    `</ol>` +
    h2('Quickstart', 'quickstart') +
    (qs
      ? p(`This is the repository’s embeddings quickstart, filled with ${L(qs)}’s base URL and a free embedding model from its entry (${code(embeddingModel(qs))}). Card: ${esc(flagWords(qs, 'card_required'))}. Phone: ${esc(flagWords(qs, 'phone_required'))}.`) +
        pre('python', pythonEmbeddingsQuickstart(qs.openai_base_url, embeddingModel(qs))) +
        p('For another OpenAI-compatible provider, change <code>base_url</code>, the key and <code>model</code>. Every provider page has its own quickstart, and the <a href="' + prefix + 'models/">free model index</a> lists the model IDs in each entry.')
      : p(`No provider in the dataset lists both an OpenAI-compatible base URL and a free embedding model ID, so there is no ready-made snippet. Each provider page links its docs.`)) +
    modalityGotchas(list, L, { noCalls: S.noCalls.embeddings, what: 'embeddings' }) +
    related([`<a href="${prefix}collections/no-credit-card">No credit card collection</a>`, `<a href="${prefix}guides/choose-free-llm-api-for-production">Can you use a free API in production?</a>`, `<a href="${prefix}coverage/">What the dataset doesn’t know yet</a>`]);

  const noCardOngoing = ongoing.filter((x) => x.card_required === false);
  const faq = [
    {
      q: 'Is there a free embedding API?',
      a: `Yes. ${list.length} of the ${S.verified} verified providers in our dataset include embedding models in their free access.${noCardOngoing.length ? ` ${names(noCardOngoing)} ${noCardOngoing.length === 1 ? 'has' : 'have'} an ongoing free tier with no card required.` : ''}${trial.length ? ` ${trial.length} more give a one-time credit.` : ''}`,
    },
    {
      q: 'Can I use a free embedding API commercially?',
      a: `${c.yes.length} of the ${list.length} allow it on the free tier, per their terms.${c.no.length ? ` ${names(c.no)} ${c.no.length === 1 ? 'doesn’t' : 'don’t'}.` : ''}${c.cond.length ? ` ${names(c.cond)} ${c.cond.length === 1 ? 'allows' : 'allow'} it under a condition.` : ''}${c.unk.length ? ` For ${c.unk.length} it isn’t confirmed.` : ''}`,
    },
    {
      q: 'Do free embedding APIs train on my documents?',
      a: `${t.no.length ? `${names(t.no)} ${agree(t.no, 'says it doesn’t', 'say they don’t')}.` : 'None says it doesn’t.'}${t.yes.length ? ` ${names(t.yes)} ${agree(t.yes, 'says it can', 'say they can')}.` : ''}${t.open.length ? ` For the other ${t.open.length}, no quoted policy settles it.` : ''}`,
    },
    { q: 'Can I switch embedding providers later?', a: 'Only by embedding your documents again: vectors from different models can’t be compared. Pick the model before you build the index.' },
  ];
  return { count: list.length, answer, body, faq, featured: list };
}

// ---------- guide 5: free speech-to-text and text-to-speech APIs ----------
function speechGuide({ providers, prefix }) {
  const S = modalitySets(providers);
  const list = S.speech;
  const L = (x) => provLink(x, prefix);
  const stt = list.filter((x) => speechMentions(x).stt);
  const tts = list.filter((x) => speechMentions(x).tts);
  const both = list.filter((x) => speechMentions(x).stt && speechMentions(x).tts);
  const ongoing = list.filter(isOngoing);
  const trial = list.filter((x) => !isOngoing(x));
  const whisper = list.filter((x) => x.openai_compatible === true && httpsOnly(x.openai_base_url) && (x.models_free || []).some((m) => /whisper/i.test(m)));
  const c = commercialSplit(list);
  const cTts = commercialSplit(tts);
  const t = trainsSplit(list);
  const mentions = (x) => { const m = speechMentions(x); return m.stt || m.tts ? andList([m.stt && 'speech-to-text', m.tts && 'text-to-speech'].filter(Boolean)) : '<span class="notes">Not stated in its entry</span>'; };

  const answer = `${list.length} of the ${S.verified} verified providers in our dataset offer free speech APIs. By the words of their entries, ${stt.length} mention speech-to-text (transcription) and ${tts.length} text-to-speech; ${both.length} mention both. ${ongoing.length} have an ongoing free tier and ${trial.length} a one-time credit. Free amounts come in minutes, characters, credits or money, so convert them to your own usage before you compare.`;
  const body =
    h2('Who this guide is for', 'who-its-for') +
    p('Developers adding transcription, captions, meeting notes, voice commands, read-aloud or a voice agent to an app, who want to prototype on a free tier and know the catch before they ship.') +
    h2('Free speech APIs compared', 'compared') +
    p('The “Covers” column is read from the words of each entry (its free tier, notes and model IDs); the dataset has no separate field for it. Check the provider page for the exact models.') +
    modalityTable('Free speech-to-text and text-to-speech APIs compared', list, L, { extra: { head: 'Covers', cell: mentions } }) +
    related([`<a href="${prefix}collections/multimodal">Multimodal collection</a>`, compareLink(stt, prefix)].filter(Boolean)) +
    h2('How to choose', 'how-to-choose') +
    `<ol>` +
    `<li><strong>Transcription or voice output.</strong> Speech-to-text with an ongoing free tier: ${listOrNone(stt.filter(isOngoing), L, 'none')}; with a one-time credit: ${listOrNone(stt.filter((x) => !isOngoing(x)), L, 'none')}. Text-to-speech with an ongoing free tier: ${listOrNone(tts.filter(isOngoing), L, 'none')}; with a one-time credit: ${listOrNone(tts.filter((x) => !isOngoing(x)), L, 'none')}.</li>` +
    `<li><strong>Convert the units.</strong> Transcription is usually counted in audio minutes or hours, voice output in characters, and many providers count credits or money. Work out what one minute of your audio, or one page of your text, costs in each unit before you compare.</li>` +
    (whisper.length ? `<li><strong>Keep the OpenAI SDK.</strong> ${andList(whisper.map((x) => `${L(x)} (${code((x.models_free || []).find((m) => /whisper/i.test(m)))})`))} ${agree(whisper, 'lists an OpenAI-compatible API and a Whisper model in its entry', 'list an OpenAI-compatible API and a Whisper model in their entries')}. Compatibility is recorded per provider, not per endpoint: confirm the audio route on the provider page.</li>` : '') +
    `<li><strong>Commercial use.</strong> Voice terms often differ from text terms. ${c.yes.length ? `${andList(c.yes.map(L))} ${agree(c.yes, 'allows', 'allow')} commercial use on the free tier.` : 'None confirms commercial use on the free tier.'}${c.no.length ? ` ${andList(c.no.map(L))} ${agree(c.no, 'doesn’t', 'don’t')}.` : ''}${c.cond.length ? ` ${andList(c.cond.map(L))} ${agree(c.cond, 'allows', 'allow')} it under a condition.` : ''}${c.unk.length ? ` For the other ${c.unk.length} the provider’s pages don’t settle it.` : ''} See the <a href="${prefix}collections/commercial-use">commercial-use collection</a>.</li>` +
    `<li><strong>Your audio.</strong> Recordings often hold personal data. ${t.yes.length ? `${andList(t.yes.map(L))} ${agree(t.yes, 'says it', 'say they')} can use your inputs for training; the Data use column links the sentence, which may include an opt-out.` : ''}${t.no.length ? ` ${andList(t.no.map(L))} ${agree(t.no, 'says it doesn’t', 'say they don’t')} train on them.` : ''}${t.open.length ? ` For ${t.open.length} more, no quoted policy settles it.` : ''} See <a href="${prefix}data-policy/">data policy, provider by provider</a>.</li>` +
    `<li><strong>Concurrency and streaming.</strong> The limits column gives each provider’s published concurrency or request limits; real-time transcription and voice agents hit those first.</li>` +
    `</ol>` +
    h2('Quickstart', 'quickstart') +
    p(`This repository has no speech quickstart: most speech APIs use their own REST or WebSocket endpoints. Each provider page links its docs${whisper.length ? `; for the OpenAI-compatible ones above, the OpenAI SDK’s audio transcription call with that provider’s <code>base_url</code> is the place to start` : ''}.`) +
    modalityGotchas(list, L, { noCalls: S.noCalls.speech, what: 'audio' }) +
    related([`<a href="${prefix}collections/no-credit-card">No credit card collection</a>`, `<a href="${prefix}guides/openai-api-alternatives">Free OpenAI API alternatives</a>`, `<a href="${prefix}guides/choose-free-llm-api-for-production">Can you use a free API in production?</a>`]);

  const sttOngoing = stt.filter(isOngoing);
  const ttsOngoing = tts.filter(isOngoing);
  const faq = [
    {
      q: 'Is there a free speech-to-text API?',
      a: `Yes. ${sttOngoing.length ? `${names(sttOngoing)} ${sttOngoing.length === 1 ? 'has an ongoing free tier whose entry mentions' : 'have ongoing free tiers whose entries mention'} speech-to-text.` : 'No ongoing free tier in the dataset mentions speech-to-text.'}${stt.length - sttOngoing.length ? ` ${stt.length - sttOngoing.length} more give a one-time credit.` : ''}`,
    },
    {
      q: 'Is there a free text-to-speech API?',
      a: `Yes. ${ttsOngoing.length ? `${names(ttsOngoing)} ${ttsOngoing.length === 1 ? 'has an ongoing free tier whose entry mentions' : 'have ongoing free tiers whose entries mention'} text-to-speech.` : 'No ongoing free tier in the dataset mentions text-to-speech.'}${tts.length - ttsOngoing.length ? ` ${tts.length - ttsOngoing.length} more give a one-time credit.` : ''}`,
    },
    {
      q: 'Can I use free text-to-speech voices commercially?',
      a: `Of the ${tts.length} entries that mention text-to-speech, ${cTts.yes.length} allow commercial use on the free tier.${cTts.no.length ? ` ${names(cTts.no)} ${cTts.no.length === 1 ? 'doesn’t' : 'don’t'}.` : ''}${cTts.cond.length ? ` ${names(cTts.cond)} ${cTts.cond.length === 1 ? 'allows' : 'allow'} it under a condition.` : ''}${cTts.unk.length ? ` For ${cTts.unk.length} it isn’t confirmed.` : ''}`,
    },
    {
      q: 'Do free speech APIs train on my audio?',
      a: `${t.yes.length ? `${names(t.yes)} ${agree(t.yes, 'says it', 'say they')} can use your inputs for training.` : 'None says it trains on your inputs.'}${t.no.length ? ` ${names(t.no)} ${agree(t.no, 'says it doesn’t', 'say they don’t')}.` : ''}${t.open.length ? ` For the other ${t.open.length}, no quoted policy settles it.` : ''}`,
    },
  ];
  return { count: list.length, answer, body, faq, featured: list };
}

// ---------- guide 6: free OCR and document-parsing APIs ----------
function ocrGuide({ providers, prefix }) {
  const S = modalitySets(providers);
  const list = S.ocr;
  const L = (x) => provLink(x, prefix);
  const ongoing = list.filter(isOngoing);
  const trial = list.filter((x) => !isOngoing(x));
  const compat = list.filter((x) => x.openai_compatible === true);
  const native = list.filter((x) => x.openai_compatible !== true);
  const watermarks = list.filter((x) => watermarkSentences(x).length);
  const c = commercialSplit(list);
  const t = trainsSplit(list);
  const noCard = list.filter((x) => x.card_required === false);
  const noCardNoPhoneList = noCard.filter((x) => x.phone_required === false);

  const answer = `${list.length} of the ${S.verified} verified providers in our dataset offer free OCR or document parsing: ${ongoing.length} with an ongoing free tier and ${trial.length} with a one-time allowance. Free amounts are counted in pages, conversions or credits, so read the limits column against your volume. The table also shows card and phone, commercial use and data policy.`;
  const body =
    h2('Who this guide is for', 'who-its-for') +
    p(`Developers turning PDFs, scans, receipts or forms into text: for search, for a RAG pipeline, or for data entry. Once the text is out, see <a href="${prefix}guides/free-embeddings-apis">free embedding APIs</a> to index it.`) +
    h2('Free OCR and document-parsing APIs compared', 'compared') +
    modalityTable('Free OCR and document-parsing APIs compared', list, L) +
    related([`<a href="${prefix}collections/multimodal">Multimodal collection</a>`, compareLink(list, prefix)].filter(Boolean)) +
    h2('How to choose', 'how-to-choose') +
    `<ol>` +
    `<li><strong>Renewing or one-time.</strong> Ongoing free tiers: ${listOrNone(ongoing, L, 'none')}. One-time allowances: ${listOrNone(trial, L, 'none')}.</li>` +
    `<li><strong>Plain text or layout.</strong> Plain OCR returns the text. Document parsers also return layout (tables, headings, reading order), which matters when you split documents into chunks for RAG. Each entry’s free-tier text says what it covers; the provider page has the details.</li>` +
    `<li><strong>Commercial use.</strong> ${c.yes.length ? `${andList(c.yes.map(L))} ${agree(c.yes, 'allows', 'allow')} it on the free tier.` : 'None confirms it on the free tier.'}${c.cond.length ? ` ${c.cond.map((x) => `${L(x)}: ${esc(String(x.commercial_ok_condition || 'allowed under a condition').replace(/\.$/, ''))}`).join('; ')}.` : ''}${c.no.length ? ` ${andList(c.no.map(L))} ${agree(c.no, 'doesn’t', 'don’t')}.` : ''}${c.unk.length ? ` For ${andList(c.unk.map(L))} the provider’s pages don’t settle it.` : ''}</li>` +
    (watermarks.length ? `<li><strong>Watermarks.</strong> ${watermarks.map((x) => `${L(x)}: “${escProse(watermarkSentences(x).join(' '))}”`).join('; ')}.</li>` : '') +
    `<li><strong>Your documents.</strong> Scans often hold personal or financial data. ${t.no.length ? `${andList(t.no.map(L))} ${agree(t.no, 'says it doesn’t', 'say they don’t')} train on your inputs.` : ''}${t.yes.length ? ` ${andList(t.yes.map(L))} ${agree(t.yes, 'says it can', 'say they can')}.` : ''}${t.open.length ? ` For ${andList(t.open.map(L))}, no quoted policy settles it.` : ''} See <a href="${prefix}data-policy/">data policy, provider by provider</a>.</li>` +
    `<li><strong>OpenAI SDK.</strong> ${compat.length ? `${andList(compat.map(L))} ${agree(compat, 'lists', 'list')} an OpenAI-compatible API, recorded per provider rather than per endpoint; the others use their own REST APIs.` : 'None of them lists an OpenAI-compatible API; each uses its own REST API.'}</li>` +
    `</ol>` +
    h2('Quickstart', 'quickstart') +
    p(`This repository has no OCR quickstart: ${native.length} of the ${list.length} use their own REST API, not the OpenAI format. Each provider page links its docs.`) +
    modalityGotchas(list, L, { noCalls: S.noCalls.ocr, what: 'OCR' }) +
    related([`<a href="${prefix}collections/no-credit-card">No credit card collection</a>`, `<a href="${prefix}collections/commercial-use">Commercial use collection</a>`, `<a href="${prefix}guides/openai-api-alternatives">Free OpenAI API alternatives</a>`]);

  const faq = [
    {
      q: 'Is there a free OCR API?',
      a: `Yes. ${ongoing.length ? `${names(ongoing)} ${ongoing.length === 1 ? 'has' : 'have'} an ongoing free tier for OCR or document parsing.` : 'No provider in the dataset has an ongoing free OCR tier.'}${trial.length ? ` ${names(trial)} ${agree(trial, 'gives', 'give')} a one-time allowance.` : ''}`,
    },
    {
      q: 'Can I use a free OCR API commercially?',
      a: `${c.yes.length} of the ${list.length} allow it on the free tier, per their terms.${c.cond.length ? ` ${names(c.cond)} ${c.cond.length === 1 ? 'allows' : 'allow'} it under a condition.` : ''}${c.no.length ? ` ${names(c.no)} ${c.no.length === 1 ? 'doesn’t' : 'don’t'}.` : ''}${c.unk.length ? ` For ${names(c.unk)} it isn’t confirmed.` : ''}`,
    },
    {
      q: 'Does free OCR add a watermark?',
      a: watermarks.length ? `Of the ${list.length} entries, ${agree(watermarks, 'one mentions', `${watermarks.length} mention`)} a watermark: ${names(watermarks)}. The Gotchas section quotes the sentence.` : 'None of the entries mentions a watermark. Check the provider page for the output of the free tier.',
    },
    {
      q: 'Which free OCR API needs no credit card?',
      a: noCard.length ? `${names(noCard)} ${agree(noCard, 'needs', 'need')} no card for the free access.${noCardNoPhoneList.length ? ` Of those, ${names(noCardNoPhoneList)} also ${agree(noCardNoPhoneList, 'needs', 'need')} no phone number.` : ''}` : 'None is confirmed to need no card.',
    },
  ];
  return { count: list.length, answer, body, faq, featured: list };
}

// ---------- guide 7: free image generation APIs ----------
function imageGuide({ providers, prefix }) {
  const S = modalitySets(providers);
  const gen = S.imageGeneration;
  const other = S.imageOther;
  const all = S.image;
  const L = (x) => provLink(x, prefix);
  const ongoing = gen.filter(isOngoing);
  const trial = gen.filter((x) => !isOngoing(x));
  const c = commercialSplit(gen);
  const t = trainsSplit(all);
  const anon = gen.filter((x) => x.anonymous_access);
  const watermarks = all.filter((x) => watermarkSentences(x).length);
  const compat = gen.filter((x) => x.openai_compatible === true);

  const answer = `${gen.length} of the ${S.verified} verified providers in our dataset give free access or starting credit that their entries tie to image generation. ${other.length} more list the image modality, but their entries don’t name image generation: they cover editing, background removal or images as input, or don’t say. They are in a second table. Check commercial use, model licences and watermarks first.`;
  const body =
    h2('Who this guide is for', 'who-its-for') +
    p(`Developers generating illustrations, product shots, thumbnails or test images from a prompt, in an app or a script. To <em>read</em> images (captions, visual questions), see <a href="${prefix}guides/free-vision-apis">free vision APIs</a> instead.`) +
    h2('Free image generation APIs compared', 'compared') +
    p('An entry is in this table when its free tier, notes, model IDs or summary name image generation or an image model; the dataset has no separate field for it.') +
    modalityTable('Free image generation APIs compared', gen, L) +
    (other.length ? `<h3>Other image APIs: editing, image input or not stated</h3>` + modalityTable('Other free image APIs', other, L) : '') +
    related([`<a href="${prefix}collections/multimodal">Multimodal collection</a>`, compareLink(gen, prefix)].filter(Boolean)) +
    h2('How to choose', 'how-to-choose') +
    `<ol>` +
    `<li><strong>Commercial use and model licences.</strong> ${c.yes.length ? `${andList(c.yes.map(L))} ${agree(c.yes, 'allows', 'allow')} commercial use on the free access.` : 'None confirms commercial use on the free access.'}${c.cond.length ? ` Conditional: ${c.cond.map((x) => `${L(x)}: ${esc(String(x.commercial_ok_condition || 'see its page').replace(/\.$/, ''))}`).join('; ')}.` : ''}${c.no.length ? ` ${andList(c.no.map(L))} ${agree(c.no, 'doesn’t', 'don’t')} allow it.` : ''}${c.unk.length ? ` For ${andList(c.unk.map(L))} the provider’s pages don’t settle it.` : ''} A hosted model can carry its own licence on top of the provider’s terms.</li>` +
    `<li><strong>Renewing or one-time.</strong> Ongoing free access: ${listOrNone(ongoing, L, 'none')}. One-time credit: ${listOrNone(trial, L, 'none')}.</li>` +
    (anon.length ? `<li><strong>No account.</strong> ${andList(anon.map(L))} can be called without an account, with tighter limits; the Gotchas section quotes the provider’s sentence. See the <a href="${prefix}collections/anonymous-access">no-account collection</a>.</li>` : '') +
    (watermarks.length ? `<li><strong>Watermarks.</strong> ${watermarks.map((x) => `${L(x)}: “${escProse(watermarkSentences(x).join(' '))}”`).join('; ')}.</li>` : '') +
    `<li><strong>Your prompts and uploads.</strong> ${t.no.length ? `${andList(t.no.map(L))} ${agree(t.no, 'says it doesn’t', 'say they don’t')} train on your inputs.` : ''}${t.yes.length ? ` ${andList(t.yes.map(L))} ${agree(t.yes, 'says it can', 'say they can')}.` : ''}${t.open.length ? ` For ${t.open.length} more, no quoted policy settles it.` : ''} See <a href="${prefix}data-policy/">data policy, provider by provider</a>.</li>` +
    (compat.length ? `<li><strong>OpenAI SDK.</strong> ${andList(compat.map(L))} ${agree(compat, 'lists', 'list')} an OpenAI-compatible API, but compatibility is recorded per provider, not per endpoint: confirm that the image endpoint follows the OpenAI shape before you rely on it.</li>` : '') +
    `</ol>` +
    h2('Quickstart', 'quickstart') +
    p('This repository has no image-generation quickstart: image endpoints, parameters and model names differ from provider to provider. Each provider page links its docs.') +
    modalityGotchas(all, L, { noCalls: S.noCalls.image, what: 'image' }) +
    related([`<a href="${prefix}collections/commercial-use">Commercial use collection</a>`, `<a href="${prefix}collections/no-credit-card">No credit card collection</a>`, `<a href="${prefix}guides/free-llm-api-no-credit-card-no-phone">No card, no phone: every API</a>`]);

  const noCardOngoing = ongoing.filter((x) => x.card_required === false);
  const faq = [
    {
      q: 'Is there a free image generation API?',
      a: `Yes. ${gen.length} of the ${S.verified} verified providers in our dataset tie free access or starting credit to image generation.${anon.length ? ` ${names(anon)} can be called with no account.` : ''}${noCardOngoing.length ? ` ${names(noCardOngoing)} ${noCardOngoing.length === 1 ? 'has' : 'have'} ongoing free access with no card required.` : ''}`,
    },
    {
      q: 'Can I use free AI-generated images commercially?',
      a: `It depends on the provider and the model. ${c.yes.length} of the ${gen.length} allow commercial use on the free access.${c.cond.length ? ` ${names(c.cond)} ${c.cond.length === 1 ? 'allows' : 'allow'} it subject to each model’s licence or another condition.` : ''}${c.no.length ? ` ${names(c.no)} ${c.no.length === 1 ? 'doesn’t' : 'don’t'}.` : ''}${c.unk.length ? ` For ${c.unk.length} it isn’t confirmed.` : ''}`,
    },
    {
      q: 'Which free image APIs add a watermark?',
      a: watermarks.length ? `${names(watermarks)} ${watermarks.length === 1 ? 'mentions' : 'mention'} a watermark in ${watermarks.length === 1 ? 'its entry' : 'their entries'}; the sentence is quoted under How to choose. An entry can mention a watermark to say it applies only to some calls, or that it is gone.` : 'None of the entries mentions a watermark. Check the provider page for the output of the free tier.',
    },
    { q: 'Is a vision API the same as an image generation API?', a: 'No. A vision model reads an image and returns text; an image generation model makes a new image from a prompt. For reading images, see the free vision APIs guide.' },
  ];
  return { count: gen.length, answer, body, faq, featured: all };
}

// ---------- guides 8 to 12: by what you build (coding, RAG, agents, a chatbot, students) ----------
// Same rules as above: every set, count and pick is computed here from the entries; a value the entries don't hold
// (tool calling, a speed nobody published) is said to be missing, never filled in.

/** Every verified text LLM that gives free model calls, by score. */
export const textLlms = (providers) =>
  providers.filter((x) => x.verified === true && x.is_text_llm === true && !NO_FREE_MODEL_CALLS.includes(x.slug)).sort(byScore);
const num = (n) => n.toLocaleString('en-US');
const FREE_LIMIT_WORDS = [
  ['requests_per_minute', 'requests per minute'], ['requests_per_day', 'requests per day'],
  ['tokens_per_minute', 'tokens per minute'], ['tokens_per_day', 'tokens per day'],
];
/** The structured free limits of an entry, in words ([] when it has none). */
export const freeLimitBits = (x) => (x.free_limits ? FREE_LIMIT_WORDS.filter(([k]) => Number.isFinite(x.free_limits[k])).map(([k, w]) => `${num(x.free_limits[k])} ${w}`) : []);
const limitsCell = (x) => (freeLimitBits(x).length
  ? `${freeLimitBits(x).join('<br>')}<br><span class="notes">${esc(x.free_limits.scope || 'free plan')}</span>`
  : '<span class="notes">No structured figure; see the published limits</span>');
const rpd = (x) => (x.free_limits && Number.isFinite(x.free_limits.requests_per_day) ? x.free_limits.requests_per_day : null);
const rpm = (x) => (x.free_limits && Number.isFinite(x.free_limits.requests_per_minute) ? x.free_limits.requests_per_minute : null);
/** The fastest output speed an entry's provider publishes (its own figure, not a measurement), or null. */
export const topSpeed = (x) => (x.published_speed || []).filter((s) => s.metric === 'output_tokens_per_second' && Number.isFinite(s.value)).sort((a, b) => b.value - a.value)[0] || null;
const speedWords = (s) => `${s.qualifier === 'approx' ? '~' : s.qualifier === 'at_least' ? 'at least ' : ''}${num(s.value)} ${esc(s.unit)}`;
const speedCell = (x) => { const s = topSpeed(x); return s ? `${speedWords(s)}<br><span class="notes">${esc(s.model)} (${ext(s.source, 'provider page')})</span>` : '<span class="notes">Not published</span>'; };
// "Not confirmed (reason)", without repeating the words when no reason is recorded.
const notConfirmed = (x, field) => { const r = reasonOf(x, field); return r === REASON_LABEL.not_checked ? 'Not confirmed' : `Not confirmed (${r})`; };
const compatWords = (x) => (x.openai_compatible === true ? (httpsOnly(x.openai_base_url) ? 'Yes' : 'Yes, no base URL recorded') : x.openai_compatible === false ? 'No' : notConfirmed(x, 'openai_compatible'));
// Sentences in which an entry says free use is limited to evaluation or testing, or is non-commercial.
export const EVALUATION_ONLY = /evaluation (purposes|only)|for (internal )?(testing and )?evaluation|non-commercial|not (in )?production/i;
const flagsLine = (x, fields) => fields.map(([w, f]) => `${w}: ${f === 'commercial_ok' ? commercialWords(x) : esc(flagWords(x, f))}`).join('. ');
const compatCell = (x) => { const c = fieldCheck(x, 'openai_compatible'); return esc(compatWords(x)) + (x.openai_compatible === true && c && c.status === 'stated' && (c.sources || [])[0] ? ` (${ext(c.sources[0], 'provider’s sentence')})` : ''); };
// The sentences of an entry's notes and free tier that match a pattern, quoted as they stand.
const sentencesOf = (x, re) => [x.free_tier, x.notes].filter(Boolean).flatMap((t) => t.split(/(?<=[.;])\s+/)).filter((t) => re.test(t));
const quoteList = (list, re, L) => list.map((x) => ({ x, s: sentencesOf(x, re) })).filter((e) => e.s.length).map(({ x, s }) => `${L(x)}: “${escProse(s.join(' ').replace(/[.;]$/, ''))}”`);
const chatReady = (x) => x.openai_compatible === true && httpsOnly(x.openai_base_url) && exampleChatModel(x);
const keyVar = (x, fallback) => (x && /^[A-Z][A-Z0-9_]*$/.test(x.env_key || '') ? x.env_key : fallback);
const findHref = (prefix, answers) => `${prefix}find/#${toHash(answers)}`;
const catchWords = (x) => `Card: ${esc(flagWords(x, 'card_required'))}<br>Phone: ${esc(flagWords(x, 'phone_required'))}<br>Commercial use: ${commercialWords(x)}`;
/** A "pick a stack" table: one row per need, the first provider the data gives for it, why, and its catch. */
function pickTable(label, rows, L) {
  return tableHtml(label, ['You want', 'Pick', 'Why, from its entry', 'The catch'], rows.map(({ need, x, why }) => (x
    ? [esc(need), L(x), why(x), catchWords(x)]
    : [esc(need), '<span class="notes">None in the data today</span>', '<span class="notes">No verified entry qualifies</span>', ''])));
}
/** A short quickstart block for an OpenAI-compatible chat provider: Python, then the three values a tool's settings take. */
function chatQuickstart(x, L, why) {
  if (!x) return p('No provider in the data has an OpenAI-compatible base URL and a free chat model ID that fits here, so there is no ready-made snippet. Each provider page links its docs.');
  const model = exampleChatModel(x);
  return p(`This is the repository’s chat quickstart, filled with ${L(x)}’s base URL and a free model from its entry: ${why}`) +
    pre('python', pythonChatQuickstart(x.openai_base_url, model)) +
    pre('bash', curlChatQuickstart(x.openai_base_url.replace(/\/$/, ''), model, { apiKeyVariable: keyVar(x, 'API_KEY') })) +
    `<ul><li><strong>Base URL:</strong> ${wrapCode(x.openai_base_url)}</li><li><strong>Model:</strong> ${wrapCode(model)}</li>` +
    `<li><strong>API key:</strong> ${httpsOnly(x.keys_url) ? `create one on ${ext(x.keys_url, `${esc(x.name)}’s key page`)}` : `see ${L(x)}`}${x.env_key ? ` (the usual variable is ${code(keyVar(x, 'API_KEY'))})` : ''}</li></ul>`;
}

// ---------- guide 8: free LLM APIs for coding assistants ----------
export const CODE_MODEL = /coder|codestral|devstral|laguna|-code\b|code-/i;
export const codeModel = (x) => (x.models_free || []).find((m) => CODE_MODEL.test(m)) || null;
export function codingSets(providers) {
  const text = textLlms(providers);
  const compat = text.filter((x) => x.openai_compatible === true && httpsOnly(x.openai_base_url));
  return {
    verified: providers.filter((x) => x.verified === true).length,
    text,
    compat,
    ongoing: compat.filter(isOngoing),
    trial: compat.filter((x) => !isOngoing(x)),
    other: text.filter((x) => !compat.includes(x)),
    fast: text.filter(topSpeed).sort((a, b) => topSpeed(b).value - topSpeed(a).value || byScore(a, b)),
    codeModels: text.filter(codeModel),
  };
}

function codingGuide({ providers, prefix, codingToolsOwnKey }) {
  const S = codingSets(providers);
  const L = (x) => provLink(x, prefix);
  const noCard = (x) => x.card_required === false;
  const fastNoCard = S.fast.filter((x) => noCard(x) && S.compat.includes(x));
  const byRpd = S.ongoing.filter((x) => rpd(x) != null).sort((a, b) => rpd(b) - rpd(a) || byScore(a, b));
  const byRpm = S.ongoing.filter((x) => rpm(x) != null).sort((a, b) => rpm(b) - rpm(a) || byScore(a, b));
  const commercialPick = S.ongoing.find((x) => noCard(x) && x.commercial_ok === true);
  const noTrainPick = S.ongoing.find((x) => noCard(x) && x.data_policy && x.data_policy.trains_on_prompts === false);
  const codePick = S.codeModels.find((x) => S.compat.includes(x)) || S.codeModels[0];
  const c = commercialSplit(S.compat);
  const t = trainsSplit(S.compat);
  const unpublished = S.compat.filter((x) => UNPUBLISHED_LIMITS.test(x.rate_limits || ''));
  const shared = quoteList(S.compat, /organi[sz]ation level|not per (api )?key|per account/i, L);
  const evalNotes = quoteList(S.compat, EVALUATION_ONLY, L);
  const ownKey = ((codingToolsOwnKey && codingToolsOwnKey.entries) || []).filter((e) => /^[a-z0-9-]+$/.test(e.slug || ''));
  const speeds = S.fast.flatMap((x) => (x.published_speed || []).filter((s) => s.metric === 'output_tokens_per_second' && Number.isFinite(s.value)).map((s) => ({ x, s })))
    .sort((a, b) => b.s.value - a.s.value);
  const planNamed = speeds.filter((e) => e.s.plan_named === true).length;
  const qs = [...S.ongoing].filter((x) => noCard(x) && exampleChatModel(x)).sort((a, b) => (topSpeed(b) ? topSpeed(b).value : -1) - (topSpeed(a) ? topSpeed(a).value : -1) || byScore(a, b))[0];

  const answer = `${S.compat.length} of the ${S.verified} verified providers in our dataset offer a free text LLM behind an OpenAI-compatible API: a base URL, a key and a model ID, the three values a coding tool’s custom-provider setting asks for. ${S.ongoing.length} have a renewing free tier and ${S.trial.length} a one-time credit. ${S.fast.length} publish an output speed, and ${S.codeModels.length} list a code-specialised model among their free models.`;
  const body =
    h2('Who this guide is for', 'who-its-for') +
    p(`Developers wiring a free model into a coding assistant, an IDE extension, a command-line agent or a code-review bot. If you want a coding tool that is free itself, see <a href="${prefix}coding-tools/">free AI coding tools</a>.${ownKey.length ? ` ${andList(ownKey.map((e) => `<a href="${prefix}coding-tools/${esc(e.slug)}/">${esc(e.name)}</a>`))} ${agree(ownKey, 'is free and runs', 'are free and run')} on your own API key, per ${agree(ownKey, 'its', 'their')} own pages; check ${agree(ownKey, 'its', 'each one’s')} provider settings for a custom OpenAI-compatible endpoint.` : ''}`) +
    p(`Several constraints at once? <a href="${findHref(prefix, { use: 'code', openai: 'yes' })}">Find my free API</a> opens with “code” and “OpenAI-compatible” already selected.`) +
    h2('Pick a stack', 'pick-a-stack') +
    pickTable('Pick a free LLM API for coding', [
      { need: 'The fastest published speed, no card', x: fastNoCard[0], why: (x) => `${speedWords(topSpeed(x))} on ${code(topSpeed(x).model)}, the provider’s own figure, sourced in the speed table below` },
      { need: 'The most requests per day on a renewing tier', x: byRpd[0], why: (x) => `${num(rpd(x))} requests per day (${esc(x.free_limits.scope || 'free plan')})` },
      { need: 'Commercial use confirmed, no card, renewing', x: commercialPick, why: (x) => esc(x.free_tier) },
      { need: 'Says it doesn’t train on your code, no card', x: noTrainPick, why: (x) => `${esc(dataUseWords(x))}; the sentence is linked in the table below` },
      { need: 'A code-specialised model', x: codePick, why: (x) => `Lists ${code(codeModel(x))} among its free models` },
    ], L) +
    related([compareLink(fastNoCard.length >= 2 ? fastNoCard : S.ongoing, prefix), `<a href="${explorerHref({ use: 'code', openai: 'yes' }, prefix)}">the same filter in the explorer</a>`].filter(Boolean)) +
    h2('Free LLM APIs for coding compared', 'compared') +
    p('Every provider below lists an OpenAI-compatible API and a base URL. Compatibility is recorded per provider, not per feature: streaming, tool calls and JSON mode vary, so check the provider page before a tool depends on one.') +
    `<h3>Renewing free tiers</h3>` +
    modalityTable('Renewing free LLM APIs for coding', S.ongoing, L, { baseUrl: true, model: true, extra: [{ head: 'Published speed', cell: speedCell }, { head: 'Structured free limits', cell: limitsCell }] }) +
    `<h3>One-time credits</h3>` +
    modalityTable('Free LLM APIs for coding with one-time credits', S.trial, L, { baseUrl: true, model: true, extra: [{ head: 'Published speed', cell: speedCell }, { head: 'Structured free limits', cell: limitsCell }] }) +
    (S.other.length ? p(`${S.other.length} more free text LLMs aren’t in the tables because a coding tool can’t point at them as an OpenAI-compatible endpoint today: ${andList(S.other.map((x) => `${L(x)} (OpenAI-compatible: ${esc(compatWords(x))})`))}.`) : '') +
    related([`<a href="${prefix}collections/openai-compatible">OpenAI-compatible collection</a>`, `<a href="${prefix}collections/renewing-free-tier">Renewing free tier collection</a>`, `<a href="${prefix}models/">Free model index</a>`]) +
    h2('Limits that survive an IDE session', 'limits') +
    p('A coding assistant sends a request for each completion, each chat turn and each agent step, so the per-minute and per-day limits are what you reach first, not the monthly headline. When no card is on file, reaching one normally means an HTTP 429 error until it resets, not a bill.') +
    `<ul>` +
    (byRpd.length ? `<li><strong>Requests per day, renewing tiers, most first:</strong> ${byRpd.map((x) => `${L(x)} ${num(rpd(x))}`).join(', ')}.</li>` : '') +
    (byRpm.length ? `<li><strong>Requests per minute:</strong> ${byRpm.map((x) => `${L(x)} ${num(rpm(x))}`).join(', ')}.</li>` : '') +
    `<li><strong>No structured figure</strong> for ${S.compat.filter((x) => !freeLimitBits(x).length).length} of the ${S.compat.length}: their published limits are in the table as the provider words them.${unpublished.length ? ` ${andList(unpublished.map(L))} publish no numeric free limit at all.` : ''}</li>` +
    (shared.length ? `<li><strong>Limits shared across keys:</strong> ${shared.join('; ')}.</li>` : '') +
    `</ul>` +
    h2('Fast models: the published speeds', 'speed') +
    (speeds.length
      ? p(`${S.fast.length} of the ${S.text.length} free text LLMs publish an output speed. These are the providers’ own figures, not our measurement, and ${planNamed === 0 ? 'none of the sentences names the free plan' : `${planNamed} of ${speeds.length} name the free plan`}.`) +
        tableHtml('Published output speeds of free text LLMs', ['Provider', 'Model', 'Published speed', 'Conditions', 'Read'], speeds.map(({ x, s }) => [
          L(x), wrapCode(s.model), `${speedWords(s)}<br><span class="notes">“${esc(s.quote)}”</span>`, s.conditions ? esc(s.conditions) : '<span class="notes">None stated</span>', `${time(s.checked)} (${ext(s.source, 'source')})`,
        ]))
      : p('No provider in the data publishes an output speed for a free text model.')) +
    h2('Quickstart', 'quickstart') +
    chatQuickstart(qs, L, `a renewing free tier with no card required${qs && topSpeed(qs) ? `, and the fastest published speed among those (${speedWords(topSpeed(qs))})` : ''}. In a coding tool, put the same three values in its custom OpenAI-compatible provider settings.`) +
    modalityGotchas(S.compat, L, { what: 'text', catches: false }) +
    (evalNotes.length ? `<h3>Evaluation-only wording in the entries</h3><ul>${evalNotes.map((e) => `<li>${e}.</li>`).join('')}</ul>` : '') +
    `<h3>Your code</h3>` +
    p(`Everything a coding assistant sends, files and diffs included, goes to the provider. ${t.no.length ? `${andList(t.no.map(L))} ${agree(t.no, 'says it doesn’t', 'say they don’t')} train on your inputs.` : ''}${t.yes.length ? ` ${andList(t.yes.map(L))} ${agree(t.yes, 'says it can', 'say they can')}.` : ''}${t.open.length ? ` For ${t.open.length} more, no quoted policy settles it.` : ''} See <a href="${prefix}collections/no-training">the no-training collection</a> and <a href="${prefix}data-policy/">data policy, provider by provider</a>.`) +
    related([`<a href="${prefix}guides/free-llm-api-for-ai-agents">Free LLM APIs for AI agents</a>`, `<a href="${prefix}guides/openai-api-alternatives">Free OpenAI API alternatives</a>`, `<a href="${prefix}guides/choose-free-llm-api-for-production">Can you use a free API in production?</a>`]);

  const noCardOngoing = S.ongoing.filter(noCard);
  const faq = [
    {
      q: 'Is there a free LLM API for coding?',
      a: `Yes. ${S.compat.length} of the ${S.verified} verified providers in our dataset offer a free text LLM behind an OpenAI-compatible API.${noCardOngoing.length ? ` ${names(noCardOngoing.slice(0, 4))} ${agree(noCardOngoing.slice(0, 4), 'has a renewing free tier', 'have renewing free tiers')} with no card required.` : ''}`,
    },
    {
      q: 'Which free LLM API is fastest for coding?',
      a: S.fast.length
        ? `By the providers’ own published figures: ${S.fast.slice(0, 3).map((x) => `${esc(x.name)} (${speedWords(topSpeed(x))} on ${esc(topSpeed(x).model)})`).join(', ')}. ${S.text.length - S.fast.length} of the ${S.text.length} free text LLMs publish no speed, so they may be fast too; nobody has published it.`
        : 'No provider in the data publishes an output speed for a free model.',
    },
    { q: 'Can I use a free LLM API in my IDE or coding assistant?', a: `If the tool accepts a custom OpenAI-compatible base URL, a key and a model ID, the ${S.compat.length} providers in the tables are the ones to try. Compatibility is often partial (tool calls, streaming, JSON mode), so check the provider page.` },
    { q: 'Do free coding APIs train on my code?', a: `${t.no.length ? `${names(t.no)} ${agree(t.no, 'says it doesn’t', 'say they don’t')}.` : 'None says it doesn’t.'}${t.yes.length ? ` ${names(t.yes)} ${agree(t.yes, 'says it can', 'say they can')}.` : ''}${t.open.length ? ` For the other ${t.open.length}, no quoted policy settles it.` : ''}` },
    { q: 'Can I use a free coding API commercially?', a: `${c.yes.length} of the ${S.compat.length} allow commercial use on the free tier, per their terms.${c.no.length ? ` ${names(c.no)} ${agree(c.no, 'doesn’t', 'don’t')}.` : ''}${c.cond.length ? ` ${names(c.cond)} ${agree(c.cond, 'allows', 'allow')} it under a condition.` : ''}${c.unk.length ? ` For ${c.unk.length} it isn’t confirmed.` : ''}` },
  ];
  return { count: S.compat.length, answer, body, faq, featured: S.compat };
}

// ---------- guide 9: free APIs to build a RAG app ----------
export function ragSets(providers) {
  const M = modalitySets(providers);
  const v = providers.filter((x) => x.verified === true);
  const rerank = v.filter((x) => hasModality('rerank')(x) && !NO_FREE_MODEL_CALLS.includes(x.slug)).sort(byScore);
  const llm = textLlms(providers).filter(isOngoing);
  const embeddings = M.embeddings;
  const all = [...new Set([...embeddings, ...rerank, ...llm])];
  const parts = (x) => [embeddings.includes(x) && 'embeddings', rerank.includes(x) && 'reranking', llm.includes(x) && 'a renewing text LLM'].filter(Boolean);
  return { verified: M.verified, embeddings, rerank, llm, ocr: M.ocr, all, parts, multi: all.filter((x) => parts(x).length >= 2).sort(byScore) };
}
// The easiest pick for each part: no card and no phone (both confirmed) first, then no card; a renewing tier before a
// one-time credit; then by score. The embeddings and LLM picks also need what the snippet calls (a base URL and a model ID).
const easyRank = (x) => (x.card_required === false && x.phone_required === false ? 0 : x.card_required === false ? 1 : 2);
const pickEasy = (list) => [...list].sort((a, b) => easyRank(a) - easyRank(b) || (isOngoing(b) - isOngoing(a)) || byScore(a, b))[0] || null;
export function ragStack(providers) {
  const S = ragSets(providers);
  const embed = pickEasy(S.embeddings.filter((x) => x.openai_compatible === true && httpsOnly(x.openai_base_url) && embeddingModel(x)));
  const llm = pickEasy(S.llm.filter(chatReady));
  const rerank = pickEasy(S.rerank);
  const commercial = (list) => pickEasy(list.filter((x) => x.commercial_ok === true));
  const noTrain = (list) => pickEasy(list.filter((x) => x.data_policy && x.data_policy.trains_on_prompts === false));
  return {
    easy: { embeddings: embed, rerank, llm },
    commercial: { embeddings: commercial(S.embeddings), rerank: commercial(S.rerank), llm: commercial(S.llm) },
    noTrain: { embeddings: noTrain(S.embeddings), rerank: noTrain(S.rerank), llm: noTrain(S.llm) },
  };
}

function ragSnippet(E, C, R) {
  const client = (x, fallback) => `OpenAI(base_url=${pythonStringLiteral(x.openai_base_url)}, api_key=os.environ[${pythonStringLiteral(keyVar(x, fallback))}])`;
  const same = E === C;
  return `import math
import os
from openai import OpenAI

${same ? `client = ${client(E, 'API_KEY')}
embed = llm = client` : `embed = ${client(E, 'EMBEDDINGS_API_KEY')}
llm = ${client(C, 'LLM_API_KEY')}`}

docs = [
    "Our office is open on weekdays.",
    "Refunds go back to the card used for the order.",
    "Support answers by email.",
]
question = "Where does my refund go?"

def vectors(texts):
    resp = embed.embeddings.create(model=${pythonStringLiteral(embeddingModel(E))}, input=texts)
    return [d.embedding for d in resp.data]

def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))

doc_vectors = vectors(docs)
query = vectors([question])[0]
ranked = sorted(zip(docs, doc_vectors), key=lambda d: cosine(query, d[1]), reverse=True)
${R ? `# Optional: reorder \`ranked\` with ${R.name.replace(/[\r\n]/g, ' ')}'s reranker before this step (see its docs).\n` : ''}context = "\\n".join(doc for doc, _ in ranked[:2])

resp = llm.chat.completions.create(
    model=${pythonStringLiteral(exampleChatModel(C))},
    messages=[
        {"role": "system", "content": "Answer only from the context."},
        {"role": "user", "content": f"Context:\\n{context}\\n\\nQuestion: {question}"},
    ],
)
print(resp.choices[0].message.content)`;
}

function ragGuide({ providers, prefix }) {
  const S = ragSets(providers);
  const K = ragStack(providers);
  const L = (x) => provLink(x, prefix);
  const { embeddings: E, rerank: R, llm: C } = K.easy;
  const PARTS = [['Embeddings', 'embeddings'], ['Reranking', 'rerank'], ['Text LLM (renewing)', 'llm']];
  const cell = (x) => (x ? `${L(x)}<br><span class="notes">Card: ${esc(flagWords(x, 'card_required'))} · ${typeLine(x)}</span>` : '<span class="notes">None in the data today</span>');
  const stackParts = [E, R, C].filter(Boolean);
  const stackDistinct = [...new Set(stackParts)];
  const tStack = trainsSplit(stackDistinct);
  const missingCommercial = PARTS.filter(([, k]) => !K.commercial[k]).map(([w]) => w.toLowerCase());
  const bothER = S.embeddings.filter((x) => S.rerank.includes(x));

  const answer = `A RAG app needs three parts: embeddings to index your documents, an optional reranker to sort what retrieval finds, and a text LLM to write the answer. Of the ${S.verified} verified providers in our dataset, ${S.embeddings.length} include embeddings in their free access, ${S.rerank.length} a reranker and ${S.llm.length} a renewing free text LLM: ${S.all.length} providers in all. The worked example below builds the whole stack with no card${E && C ? `, on ${names(stackDistinct)}` : ''}.`;
  const body =
    h2('Who this guide is for', 'who-its-for') +
    p(`Developers building retrieval-augmented generation (RAG): a chatbot over your docs, search with answers, a support assistant, a notebook over papers. If your documents are PDFs or scans, extract the text first: ${S.ocr.length} providers offer free OCR or document parsing (see <a href="${prefix}guides/free-ocr-document-ai-apis">free OCR APIs</a>).`) +
    p(`<a href="${findHref(prefix, { use: 'embeddings' })}">Find my free API</a> opens with embeddings selected; add your card, phone and commercial-use answers there.`) +
    h2('Pick a stack', 'pick-a-stack') +
    p('One provider per part and per priority, picked from the data: no card and no phone first, then no card, a renewing tier before a one-time credit, then by our score.') +
    tableHtml('Pick a free RAG stack', ['Part', 'Easiest start', 'Commercial use confirmed', 'Says it doesn’t train on your data'],
      PARTS.map(([w, k]) => [esc(w), cell(K.easy[k]), cell(K.commercial[k]), cell(K.noTrain[k])])) +
    (missingCommercial.length ? p(`No verified entry confirms commercial use on the free tier for ${andList(missingCommercial)}, so an all-commercial stack isn’t possible from the data today.`) : '') +
    (S.multi.length ? p(`<strong>One key, several parts:</strong> ${S.multi.map((x) => `${L(x)} (${andList(S.parts(x))})`).join('; ')}.`) : '') +
    h2('A worked example', 'worked-example') +
    (E && C
      ? `<ol>` +
        `<li><strong>Embeddings: ${L(E)}.</strong> ${escProse(E.free_tier)}. Free embedding model in its entry: ${code(embeddingModel(E))}. Checked ${time(E.last_verified)}.</li>` +
        (R ? `<li><strong>Reranking: ${L(R)}.</strong> ${escProse(R.free_tier)}. ${R.openai_compatible === true ? 'Its entry lists an OpenAI-compatible API, but the OpenAI SDK has no rerank call, so use its own endpoint.' : 'It uses its own API, not the OpenAI format.'} Checked ${time(R.last_verified)}.</li>` : `<li><strong>Reranking:</strong> no verified entry offers a free reranker today; skip the step.</li>`) +
        `<li><strong>Answers: ${L(C)}.</strong> ${escProse(C.free_tier)}. Free model in its entry: ${code(exampleChatModel(C))}. Published limits: ${escProse(C.rate_limits)}. Checked ${time(C.last_verified)}.</li>` +
        `</ol>` +
        p(`The script embeds three short documents, finds the closest to the question by cosine similarity and asks the LLM to answer from them. It needs only the <code>openai</code> package; a real app keeps the vectors in a vector store.`) +
        pre('python', ragSnippet(E, C, R)) +
        `<ul>${stackDistinct.map((x) => `<li><strong>${L(x)}:</strong> ${flagsLine(x, [['Card', 'card_required'], ['Phone', 'phone_required'], ['Commercial use', 'commercial_ok']])}.</li>`).join('')}</ul>` +
        (stackDistinct.length >= 2 ? related([`<a href="${prefix}compare/?compare=${stackDistinct.slice(0, 3).map((x) => esc(x.slug)).join(',')}">Compare the stack side by side</a>`]) : '')
      : p('The data doesn’t hold an OpenAI-compatible embeddings provider and a renewing chat provider with model IDs today, so there is no ready-made example.')) +
    h2('Embeddings', 'embeddings') +
    p(`Pick the model before you index: vectors from different models can’t be compared, so a later switch means embedding everything again. The full comparison is in <a href="${prefix}guides/free-embeddings-apis">free embedding APIs</a>.`) +
    modalityTable('Free embedding APIs for RAG', S.embeddings, L, { baseUrl: true }) +
    h2('Reranking', 'reranking') +
    p(`A reranker reads the question with each retrieved passage and reorders them by relevance. See <a href="${prefix}guides/free-reranking-apis">free reranking APIs</a>.`) +
    modalityTable('Free reranking APIs for RAG', S.rerank, L) +
    h2('The text LLM', 'llm') +
    p(`Renewing free tiers only: a RAG app answers every day. One-time credits are in <a href="${prefix}guides/openai-api-alternatives">free OpenAI API alternatives</a>.`) +
    modalityTable('Renewing free text LLMs for RAG', S.llm, L, { baseUrl: true, model: true }) +
    related([`<a href="${prefix}collections/openai-compatible">OpenAI-compatible collection</a>`, `<a href="${prefix}collections/renewing-free-tier">Renewing free tier collection</a>`, `<a href="${prefix}collections/no-training">No-training collection</a>`]) +
    h2('Your documents go to every part', 'data') +
    p(`Embeddings see every document you index, the reranker and the LLM see the passages you retrieve and every question.${E && C ? ` In the worked example: ${tStack.no.length ? `${names(tStack.no)} ${agree(tStack.no, 'says it doesn’t', 'say they don’t')} train on your inputs` : 'no part says it doesn’t train on your inputs'}${tStack.yes.length ? `; ${names(tStack.yes)} ${agree(tStack.yes, 'says it can', 'say they can')}` : ''}${tStack.open.length ? `; for ${names(tStack.open)} no quoted policy settles it` : ''}.` : ''} The third column of the stack table is the no-training choice for each part. See <a href="${prefix}data-policy/">data policy, provider by provider</a>.`) +
    modalityGotchas(S.all, L, { what: 'RAG', catches: false }) +
    related([`<a href="${prefix}guides/choose-free-llm-api-for-production">Can you use a free API in production?</a>`, `<a href="${prefix}coverage/">What the dataset doesn’t know yet</a>`]);

  const faq = [
    { q: 'Can I build a RAG app with free APIs only?', a: `Yes. Of the ${S.verified} verified providers in our dataset, ${S.embeddings.length} include embeddings in their free access, ${S.rerank.length} a reranker and ${S.llm.length} a renewing free text LLM.${E && C ? ` The worked example uses ${names(stackDistinct)}.` : ''}` },
    { q: 'Which free API has both embeddings and reranking?', a: bothER.length ? `${names(bothER)} ${agree(bothER, 'lists', 'list')} both in ${agree(bothER, 'its', 'their')} free access, so one key covers retrieval.` : 'None of the verified entries lists both today.' },
    { q: 'Can I use a free RAG stack commercially?', a: missingCommercial.length ? `Not end to end from the data today: no verified entry confirms commercial use on the free tier for ${andList(missingCommercial)}.` : `Yes, with ${names(PARTS.map(([, k]) => K.commercial[k]).filter((x, i, a) => a.indexOf(x) === i))}: each confirms commercial use on its free tier.` },
    { q: 'Do I need a reranker?', a: `No. Retrieval works with embeddings alone. A reranker reorders the retrieved passages by relevance to the question, which helps when the closest matches are hard to tell apart. ${S.rerank.length} providers list one in their free access.` },
  ];
  return { count: S.all.length, answer, body, faq, featured: S.all };
}

// ---------- guide 10: free LLM APIs for AI agents ----------
export const AGENT_WORDS = /(?<!user-)\bagents?\b|\bagentic\b|tool[- ](use|calling|calls)|function[- ]calling/i;
export function agentSets(providers) {
  const text = textLlms(providers);
  return {
    verified: providers.filter((x) => x.verified === true).length,
    text,
    ongoing: text.filter(isOngoing),
    trial: text.filter((x) => !isOngoing(x)),
    compat: text.filter((x) => x.openai_compatible === true),
    compatStated: text.filter((x) => x.openai_compatible === true && fieldCheck(x, 'openai_compatible') && fieldCheck(x, 'openai_compatible').status === 'stated'),
    notCompat: text.filter((x) => x.openai_compatible === false),
    compatUnknown: text.filter((x) => x.openai_compatible == null),
    mentions: text.filter((x) => sentencesOf(x, AGENT_WORDS).length || AGENT_WORDS.test(x.best_for || '')),
    byRpm: text.filter((x) => rpm(x) != null).sort((a, b) => rpm(b) - rpm(a) || byScore(a, b)),
  };
}

function agentsGuide({ providers, prefix }) {
  const S = agentSets(providers);
  const L = (x) => provLink(x, prefix);
  const ready = S.ongoing.filter((x) => chatReady(x) && x.card_required === false);
  const [main, fallback] = ready;
  const commercialPick = S.ongoing.find((x) => x.openai_compatible === true && x.commercial_ok === true) || S.compat.find((x) => x.commercial_ok === true);
  const noTrainPick = S.ongoing.find((x) => x.openai_compatible === true && x.card_required === false && x.data_policy && x.data_policy.trains_on_prompts === false);
  const c = commercialSplit(S.text);
  const t = trainsSplit(S.text);
  const evalNotes = quoteList(S.text, EVALUATION_ONLY, L);
  const mentionQuotes = S.mentions.map((x) => {
    const s = sentencesOf(x, AGENT_WORDS);
    return `${L(x)}: “${escProse((s.length ? s.join(' ') : x.best_for).replace(/[.;]$/, ''))}”`;
  });
  const unpublished = S.text.filter((x) => UNPUBLISHED_LIMITS.test(x.rate_limits || ''));
  const cardOnFile = S.text.filter((x) => x.card_required === true);
  const ex = (x) => [x.name.replace(/[\r\n]/g, ' '), x];
  const snippet = main && fallback ? `import os
from openai import OpenAI, RateLimitError

# Two free providers behind the same SDK: when the first is rate limited, the agent moves on.
PROVIDERS = [
${[main, fallback].map((x, i) => `    (${pythonStringLiteral(ex(x)[0])}, OpenAI(base_url=${pythonStringLiteral(x.openai_base_url)}, api_key=os.environ[${pythonStringLiteral(keyVar(x, i ? 'FALLBACK_API_KEY' : 'MAIN_API_KEY'))}]), ${pythonStringLiteral(exampleChatModel(x))}),`).join('\n')}
]

def chat(messages, **kwargs):
    # Pass tools=[...] in kwargs only to a provider whose docs describe tool calling.
    for name, client, model in PROVIDERS:
        try:
            return client.chat.completions.create(model=model, messages=messages, **kwargs)
        except RateLimitError:
            print(f"{name} is rate limited, trying the next provider")
    raise RuntimeError("every provider is rate limited")

resp = chat([{"role": "user", "content": "List the steps to rename a file safely."}])
print(resp.choices[0].message.content)` : '';

  const answer = `${S.text.length} of the ${S.verified} verified providers in our dataset give free calls to a text LLM, and ${S.compat.length} of them list an OpenAI-compatible API, so an agent framework built on the OpenAI SDK can use them with a different <code>base_url</code>. Our dataset doesn’t record tool or function calling, so this guide shows what it does record: compatibility, per-minute limits and commercial use.`;
  const body =
    h2('Who this guide is for', 'who-its-for') +
    p(`Developers building agents: a loop where the model plans, calls tools and reads the results, in a framework or by hand. An agent makes a model call for every step, so it reaches rate limits and terms sooner than a chat app. For an agent in your editor, see <a href="${prefix}guides/free-llm-api-for-coding">free LLM APIs for coding assistants</a>.`) +
    p(`<a href="${findHref(prefix, { use: 'chat', commercial: 'yes', openai: 'yes' })}">Find my free API</a> opens with chat, commercial use and OpenAI compatibility selected.`) +
    h2('Tool calling: what the data says, and what it doesn’t', 'tool-calling') +
    `<ul>` +
    `<li><strong>Not recorded:</strong> the dataset has no field for tool or function calling, per provider or per model. A provider that lists an OpenAI-compatible API accepts the SDK’s <code>tools</code> parameter only if its docs say so; check the provider page before an agent depends on it.</li>` +
    `<li><strong>OpenAI compatibility:</strong> ${S.compat.length} of the ${S.text.length} free text LLMs list it${S.compatStated.length ? `, ${S.compatStated.length} with the provider’s own sentence on file` : ''}; ${S.notCompat.length} use their own API${S.notCompat.length ? ` (${andList(S.notCompat.map(L))})` : ''}${S.compatUnknown.length ? `; for ${andList(S.compatUnknown.map((x) => `${L(x)}${notConfirmed(x, 'openai_compatible') === 'Not confirmed' ? '' : ` (${esc(reasonOf(x, 'openai_compatible'))})`}`))} it isn’t confirmed` : ''}.</li>` +
    (mentionQuotes.length ? `<li><strong>Entries that mention agents or tools</strong>, in their own words: ${mentionQuotes.join('; ')}. A mention is not a statement that tool calling works on the free tier.</li>` : '') +
    `</ul>` +
    h2('Pick a stack', 'pick-a-stack') +
    pickTable('Pick a free LLM API for an AI agent', [
      { need: 'Main model: OpenAI-compatible, renewing, no card', x: main, why: (x) => `${esc(x.free_tier)}<br><span class="notes">${esc(x.rate_limits)}</span>` },
      { need: 'Fallback: a second one behind the same SDK', x: fallback, why: (x) => `${esc(x.free_tier)}<br><span class="notes">${esc(x.rate_limits)}</span>` },
      { need: 'The most requests per minute', x: S.byRpm[0], why: (x) => `${num(rpm(x))} requests per minute (${esc(x.free_limits.scope || 'free plan')})` },
      { need: 'Commercial use confirmed, OpenAI-compatible', x: commercialPick, why: (x) => esc(x.free_tier) },
      { need: 'Says it doesn’t train on your prompts, no card', x: noTrainPick, why: (x) => `${esc(dataUseWords(x))}; the sentence is linked in the table below` },
    ], L) +
    related([compareLink(ready, prefix), `<a href="${explorerHref({ use: 'chat', openai: 'yes' }, prefix)}">OpenAI-compatible text LLMs in the explorer</a>`].filter(Boolean)) +
    h2('Free LLM APIs for agents compared', 'compared') +
    `<h3>Renewing free tiers</h3>` +
    modalityTable('Renewing free LLM APIs for AI agents', S.ongoing, L, { baseUrl: true, extra: [{ head: 'OpenAI-compatible', cell: compatCell }, { head: 'Structured free limits', cell: limitsCell }] }) +
    `<h3>One-time credits</h3>` +
    modalityTable('Free LLM APIs for AI agents with one-time credits', S.trial, L, { baseUrl: true, extra: [{ head: 'OpenAI-compatible', cell: compatCell }, { head: 'Structured free limits', cell: limitsCell }] }) +
    related([`<a href="${prefix}collections/openai-compatible">OpenAI-compatible collection</a>`, `<a href="${prefix}collections/commercial-use">Commercial use collection</a>`]) +
    h2('Rate limits: an agent loop spends them fast', 'rate-limits') +
    `<ul>` +
    (S.byRpm.length ? `<li><strong>Requests per minute, most first:</strong> ${S.byRpm.map((x) => `${L(x)} ${num(rpm(x))}${rpd(x) != null ? ` (${num(rpd(x))} per day)` : ''}`).join(', ')}.</li>` : '') +
    `<li><strong>No structured figure</strong> for ${S.text.filter((x) => !freeLimitBits(x).length).length} of the ${S.text.length}: read their published limits in the table.${unpublished.length ? ` ${andList(unpublished.map(L))} publish no numeric free limit.` : ''}</li>` +
    `<li><strong>At the limit:</strong> with no card on file, crossing a limit normally means HTTP 429, not a bill. Catch it and back off, or move to a second provider (the quickstart below does).${cardOnFile.length ? ` With a card on file (${andList(cardOnFile.map(L))}), read the billing page for what follows the free amount.` : ''}</li>` +
    `</ul>` +
    h2('The commercial-use caveat', 'commercial-use') +
    p(`An agent you ship is a commercial use for most terms. Of the ${S.text.length} free text LLMs, ${c.yes.length} allow commercial use on the free tier${c.yes.length ? ` (${andList(c.yes.map(L))})` : ''}; ${c.no.length} don’t${c.no.length ? ` (${andList(c.no.map(L))})` : ''}${c.cond.length ? `; ${c.cond.map((x) => `${L(x)} allows it if ${esc(String(x.commercial_ok_condition || 'a stated condition holds').replace(/\.$/, '').replace(/^./, (m) => m.toLowerCase()))}`).join('; ')}` : ''}; for ${c.unk.length} the provider’s pages don’t settle it. Don’t ship an agent on a “not confirmed”: ask the provider in writing first.`) +
    (evalNotes.length ? `<ul>${evalNotes.map((e) => `<li>${e}.</li>`).join('')}</ul>` : '') +
    related([`<a href="${prefix}guides/choose-free-llm-api-for-production">Can you use a free API in production?</a>`, `<a href="${prefix}collections/commercial-use">Commercial use collection</a>`]) +
    h2('Quickstart: two providers, one SDK', 'quickstart') +
    (snippet
      ? p(`The two providers are the first two renewing, OpenAI-compatible, no-card entries with a free model ID: ${L(main)} and ${L(fallback)}. Each base URL and model comes from its entry.`) + pre('python', snippet)
      : chatQuickstart(main, L, 'renewing, OpenAI-compatible and no card.')) +
    modalityGotchas(S.text, L, { what: 'text', catches: false }) +
    `<h3>Prompts and tool results</h3>` +
    p(`An agent sends the provider everything it reads: tool output, files and web pages included. ${t.no.length} of the ${S.text.length} say they don’t train on your inputs, ${t.yes.length} say they can, and for ${t.open.length} no quoted policy settles it. See <a href="${prefix}data-policy/">data policy, provider by provider</a>.`);

  const noCardOngoingCompat = ready;
  const faq = [
    { q: 'Which free LLM APIs support tool calling?', a: `Our dataset doesn’t record tool or function calling. It records OpenAI compatibility: ${S.compat.length} of the ${S.text.length} free text LLMs list an OpenAI-compatible API, and the SDK’s tools parameter works only where the provider documents it. Check the provider page.` },
    { q: 'Is there a free LLM API for AI agents?', a: noCardOngoingCompat.length ? `Yes. ${names(noCardOngoingCompat.slice(0, 4))} ${agree(noCardOngoingCompat.slice(0, 4), 'has', 'have')} a renewing free tier, an OpenAI-compatible API and no card requirement.` : 'No provider in the data combines a renewing free tier, an OpenAI-compatible API and no card today.' },
    { q: 'Can I run an AI agent on a free tier in production?', a: `Only where the terms allow it: ${c.yes.length} of the ${S.text.length} free text LLMs allow commercial use on the free tier, ${c.no.length} don’t, and for ${c.unk.length} it isn’t confirmed.` },
    { q: 'What happens when an agent hits a free rate limit?', a: 'With no card on file, the API normally returns HTTP 429 until the limit resets. Catch it, back off, or send the call to a second free provider behind the same SDK.' },
  ];
  return { count: S.text.length, answer, body, faq, featured: S.text };
}

// ---------- guide 11: free LLM APIs for a chatbot side project ----------
// The four checks are the /find/ wizard's own (lib/find.mjs): no card, no phone, commercial use, no training. A
// conditional commercial use is not a confirmed yes there, so it isn't here either.
export const CHATBOT_CHECKS = ['card', 'phone', 'commercial', 'train'].map((k) => CONSTRAINTS.find((c) => c.key === k));
const CHECK_HEAD = { card: 'No card', phone: 'No phone', commercial: 'Commercial use', train: 'No training on prompts' };
export const chatbotPasses = (x) => CHATBOT_CHECKS.filter((c) => constraintState(x, c) === 'yes').length;
export function chatbotSets(providers) {
  const text = textLlms(providers);
  const state = (x) => Object.fromEntries(CHATBOT_CHECKS.map((c) => [c.key, constraintState(x, c)]));
  const ranked = [...text].sort((a, b) => chatbotPasses(b) - chatbotPasses(a) || byScore(a, b));
  return {
    verified: providers.filter((x) => x.verified === true).length,
    text, ranked, state,
    all: ranked.filter((x) => chatbotPasses(x) === CHATBOT_CHECKS.length),
    close: ranked.filter((x) => chatbotPasses(x) === CHATBOT_CHECKS.length - 1 && Object.values(state(x)).filter((s) => s === 'no').length === 0),
    anon: text.filter((x) => x.anonymous_access && x.anonymous_access.quote),
  };
}
const CHATBOT_REASON_FIELD = { card: 'card_required', phone: 'phone_required', commercial: 'commercial_ok' };

function chatbotGuide({ providers, prefix }) {
  const S = chatbotSets(providers);
  const L = (x) => provLink(x, prefix);
  const st = (x, k) => S.state(x)[k];
  const passes = (keys) => S.ranked.find((x) => keys.every((k) => st(x, k) === 'yes'));
  const checkCell = (x, c) => {
    const s = constraintState(x, c);
    if (s === 'yes') return 'Yes';
    if (s === 'no') return c.key === 'commercial' && x.commercial_ok === 'conditional' ? `Conditional<br><span class="notes">${esc(x.commercial_ok_condition || 'see its page')}</span>` : '<strong>No</strong>';
    if (c.key === 'commercial' && x.commercial_ok === 'conditional') return `Conditional<br><span class="notes">${esc(x.commercial_ok_condition || 'see its page')}</span>`;
    if (c.key === 'train') return `Not stated<br><span class="notes">${esc(dataUseWords(x))}</span>`;
    return `Not confirmed<br><span class="notes">${esc(reasonOf(x, CHATBOT_REASON_FIELD[c.key]))}</span>`;
  };
  const unknownOf = (x) => CHATBOT_CHECKS.find((c) => st(x, c.key) === 'unknown');
  const phone = { no: S.text.filter((x) => x.phone_required === false), yes: S.text.filter((x) => x.phone_required === true), unk: S.text.filter((x) => x.phone_required == null) };
  const t = trainsSplit(S.text);
  const retention = [...S.all, ...S.close].filter((x) => x.data_policy && x.data_policy.retention);
  const withRetention = S.text.filter((x) => x.data_policy && x.data_policy.retention).length;
  const qsPick = [...S.all, ...S.ranked.filter((x) => st(x, 'card') === 'yes' && st(x, 'commercial') === 'yes'), ...S.ranked.filter((x) => st(x, 'card') === 'yes')].find(chatReady);
  const noCardCommercial = S.ranked.filter((x) => st(x, 'card') === 'yes' && st(x, 'commercial') === 'yes');
  const ANSWERS = { use: 'chat', card: 'no', phone: 'no', commercial: 'yes', train: 'yes' };

  const answer = `We checked all ${S.text.length} free text LLMs in our dataset against four questions a side project asks: no card, no phone, commercial use allowed, and no training on your prompts. ${S.all.length ? `${S.all.length} ${agree(S.all, 'passes', 'pass')} all four: ${names(S.all)}.` : 'None passes all four today.'} ${S.close.length} more pass three, with the fourth not confirmed by the provider’s pages rather than failed. A check the pages don’t settle is shown as not confirmed, never as yes.`;
  const body =
    h2('Who this guide is for', 'who-its-for') +
    p('Developers building a chatbot on the side: a Discord or Telegram bot, a help widget on a website, a small assistant for a club or a shop. It may earn money later, so the terms matter now.') +
    h2('The four checks', 'checks') +
    `<ol>` +
    `<li><strong>No card.</strong> With no card on file, reaching a limit stops the bot instead of billing you.</li>` +
    `<li><strong>No phone.</strong> Phone verification is the least documented fact: ${phone.unk.length} of the ${S.text.length} free text LLMs don’t state it; ${phone.no.length} confirm no phone and ${phone.yes.length} require one.</li>` +
    `<li><strong>Commercial use.</strong> A bot that takes payments or ads is commercial. Conditional terms count as not confirmed here, as in the explorer.</li>` +
    `<li><strong>Your users’ messages.</strong> Whether the provider says it trains on prompts, quoted from its own data policy.</li>` +
    `</ol>` +
    p(`<a href="${findHref(prefix, ANSWERS)}">Find my free API</a> opens with these four answers selected, and <a href="${explorerHref(ANSWERS, prefix)}">the explorer</a> applies the same filters.`) +
    h2('Pick a stack', 'pick-a-stack') +
    pickTable('Pick a free chatbot API', [
      { need: 'Every check confirmed', x: S.all[0], why: (x) => esc(x.free_tier) },
      { need: 'No card and commercial use', x: passes(['card', 'commercial']), why: (x) => esc(x.free_tier) },
      { need: 'No card and no phone', x: passes(['card', 'phone']), why: (x) => esc(x.free_tier) },
      { need: 'No card and no training on prompts', x: passes(['card', 'train']), why: (x) => `${esc(dataUseWords(x))}; its provider page quotes the sentence` },
      { need: 'No account at all, to try it out', x: S.anon[0], why: (x) => `“${escProse(x.anonymous_access.quote)}”` },
    ], L) +
    h2('Every free text LLM, checked', 'checked') +
    p('Most checks passed first, then by our score. “Not confirmed” carries the reason recorded for the flag.') +
    tableHtml('Free chatbot APIs checked for card, phone, commercial use and training', ['Provider', 'What’s free', ...CHATBOT_CHECKS.map((c) => CHECK_HEAD[c.key]), 'Confirmed', 'Checked'],
      S.ranked.map((x) => [`${L(x)}<br><small>${typeLine(x)}</small>`, `${esc(x.free_tier)}<br><span class="notes">${esc(x.rate_limits)}</span>`, ...CHATBOT_CHECKS.map((c) => checkCell(x, c)), `${chatbotPasses(x)} of ${CHATBOT_CHECKS.length}`, checkedCell(x)])) +
    related([`<a href="${prefix}collections/no-credit-card">No credit card collection</a>`, `<a href="${prefix}collections/no-phone">No phone collection</a>`, `<a href="${prefix}collections/commercial-use">Commercial use collection</a>`, `<a href="${prefix}collections/no-training">No-training collection</a>`]) +
    h2('Three of four: what is missing', 'close') +
    (S.close.length
      ? `<ul>${S.close.map((x) => { const u = unknownOf(x); const f = CHATBOT_REASON_FIELD[u.key]; const fc = f && fieldCheck(x, f); return `<li><strong>${L(x)}:</strong> ${esc(CHECK_HEAD[u.key].toLowerCase())} isn’t confirmed${fc && fc.note ? `: “${escProse(fc.note)}” (read ${time(fc.checked)})` : u.key === 'train' ? ` (${esc(dataUseWords(x).toLowerCase())})` : ` (${esc(reasonOf(x, f))})`}.</li>`; }).join('')}</ul>` + p('Ask the provider in writing before you rely on the missing check.')
      : p('No free text LLM passes three checks with the fourth only unconfirmed today.')) +
    (S.close.length >= 2 || S.all.length >= 2 ? related([compareLink([...S.all, ...S.close], prefix)]) : '') +
    h2('What happens to your users’ messages', 'data') +
    p(`Of the ${S.text.length}, ${t.no.length} say they don’t train on your inputs, ${t.yes.length} say they can, and for ${t.open.length} no quoted policy settles it. Retention is a separate question: ${withRetention} of the ${S.text.length} have a quoted retention sentence.${retention.length ? ` For the providers above: ${retention.map((x) => `${L(x)}: ${escProse(x.data_policy.retention)}`).join('; ')}.` : ''} Tell your users which provider reads their messages. See <a href="${prefix}data-policy/">data policy, provider by provider</a>.`) +
    h2('Quickstart', 'quickstart') +
    chatQuickstart(qsPick, L, `the first OpenAI-compatible entry in the stack order above. ${qsPick ? `${flagsLine(qsPick, [['Card', 'card_required'], ['Phone', 'phone_required'], ['Commercial use', 'commercial_ok']])}.` : ''}`) +
    modalityGotchas(S.text, L, { what: 'text', catches: false }) +
    related([`<a href="${prefix}guides/free-llm-api-no-credit-card-no-phone">No card, no phone: every API</a>`, `<a href="${prefix}guides/choose-free-llm-api-for-production">Can you use a free API in production?</a>`]);

  const faq = [
    { q: 'Is there a free chatbot API?', a: `Yes. ${S.text.length} of the ${S.verified} verified providers in our dataset give free calls to a text LLM. ${S.all.length ? `${names(S.all)} ${agree(S.all, 'passes', 'pass')} all four side-project checks.` : 'None passes all four side-project checks today.'}` },
    { q: 'Which free chatbot API needs no card and allows commercial use?', a: noCardCommercial.length ? `${names(noCardCommercial)}, per their entries.` : 'None confirms both today.' },
    { q: 'Does a free chatbot API need a phone number?', a: `Of the ${S.text.length} free text LLMs, ${phone.no.length} confirm no phone, ${phone.yes.length} require one, and ${phone.unk.length} don’t state it.` },
    { q: 'Will my users’ messages be used for training?', a: `It depends on the provider. ${t.no.length} of the ${S.text.length} say they don’t train on your inputs, ${t.yes.length} say they can, and for ${t.open.length} no quoted policy settles it.` },
  ];
  return { count: S.text.length, answer, body, faq, featured: S.text };
}

// ---------- guide 12: free AI APIs for students and learning ----------
const STUDENT_AUDIENCE = /student|both/i;
export function studentSets(providers, programs) {
  const v = providers.filter((x) => x.verified === true && !NO_FREE_MODEL_CALLS.includes(x.slug));
  const noCard = v.filter((x) => isOngoing(x) && x.card_required === false).sort(byScore);
  const M = modalitySets(providers);
  return {
    verified: providers.filter((x) => x.verified === true).length,
    noCard,
    anon: v.filter((x) => x.anonymous_access && x.anonymous_access.quote).sort(byScore),
    byRpd: noCard.filter((x) => rpd(x) != null).sort((a, b) => rpd(b) - rpd(a) || byScore(a, b)),
    noExpiry: v.filter((x) => !isOngoing(x) && x.card_required === false && x.no_expiry && x.no_expiry.quote).sort(byScore),
    imageGeneration: M.imageGeneration,
    programs: ((programs && programs.research) || []).filter((r) => STUDENT_AUDIENCE.test(r.audience || '')),
  };
}

function studentsGuide({ providers, prefix, programs }) {
  const S = studentSets(providers, programs);
  const L = (x) => provLink(x, prefix);
  const easy = (list) => pickEasy(list);
  const of = (f) => S.noCard.filter(f);
  const text = of((x) => x.is_text_llm === true);
  const picks = [
    { need: 'Try a model with no account', x: S.anon.find((x) => x.is_text_llm === true) || S.anon[0], why: (x) => `“${escProse(x.anonymous_access.quote)}”` },
    { need: 'Chat and text generation', x: easy(text), why: (x) => esc(x.free_tier) },
    { need: 'Embeddings and search', x: easy(of(hasModality('embeddings'))), why: (x) => esc(x.free_tier) },
    { need: 'Speech to text or text to speech', x: easy(of(hasModality('audio'))), why: (x) => esc(x.free_tier) },
    { need: 'Image generation', x: easy(of((x) => S.imageGeneration.includes(x))), why: (x) => esc(x.free_tier) },
    { need: 'OCR and documents', x: easy(of(hasModality('ocr'))), why: (x) => esc(x.free_tier) },
    { need: 'A one-time credit that doesn’t expire', x: S.noExpiry[0], why: (x) => `“${escProse(x.no_expiry.quote)}”` },
  ];
  const qs = [...text].filter(chatReady).sort((a, b) => easyRank(a) - easyRank(b) || byScore(a, b))[0];
  const noPhone = S.noCard.filter((x) => x.phone_required === false);
  const goodFor = (x) => esc((x.modalities || []).join(', '));
  const ANSWERS = { use: 'chat', card: 'no', phone: 'no' };

  const answer = `${S.noCard.length} of the ${S.verified} verified providers in our dataset have a renewing free tier with no credit card, ${noPhone.length} of them with no phone verification either. ${S.anon.length} can be called with no account at all. Quotas renew, so a class project or a hackathon doesn’t run out of credit; the structured limits below show how much each one gives.`;
  const body =
    h2('Who this guide is for', 'who-its-for') +
    p('Students, teachers, bootcamp learners and anyone learning to build with AI: a class project, a thesis prototype, a hackathon, or a first API call. You want no card, as little signup as possible, and a quota that comes back.') +
    p(`<a href="${findHref(prefix, ANSWERS)}">Find my free API</a> opens with “no card” and “no phone” selected; pick what you’re building there.`) +
    h2('Pick a stack', 'pick-a-stack') +
    p('One provider per thing to learn: renewing and no card, no phone first, then by our score.') +
    pickTable('Pick a free AI API for learning', picks, L) +
    h2('No account at all', 'no-account') +
    (S.anon.length
      ? p(`${S.anon.length === 1 ? 'One provider' : `${S.anon.length} providers`} can be called with no account, each in the provider’s own words: ${S.anon.map((x) => `${L(x)} (“${escProse(x.anonymous_access.quote)}”${x.anonymous_access.note ? `; ${escProse(x.anonymous_access.note)}` : ''})`).join('; ')}.`)
      : p('No provider in the dataset records anonymous access today.')) +
    related([`<a href="${prefix}collections/anonymous-access">No-account collection</a>`, `<a href="${prefix}guides/free-llm-api-no-signup">Free LLM APIs with no signup</a>`]) +
    h2('Renewing free tiers with no card', 'renewing-no-card') +
    modalityTable('Renewing free AI APIs with no credit card', S.noCard, L, { baseUrl: true, extra: [{ head: 'Good for', cell: goodFor }, { head: 'Structured free limits', cell: limitsCell }] }) +
    related([`<a href="${prefix}collections/no-credit-card">No credit card collection</a>`, `<a href="${prefix}collections/renewing-free-tier">Renewing free tier collection</a>`, compareLink(text, prefix)].filter(Boolean)) +
    h2('How much each quota gives', 'quotas') +
    (S.byRpd.length
      ? p(`Structured daily limits, most first: ${S.byRpd.map((x) => `${L(x)} ${num(rpd(x))} requests per day`).join(', ')}. ${S.noCard.length - S.byRpd.length} of the ${S.noCard.length} have no structured daily figure; their published limits are in the table, in the provider’s words.`)
      : p('None of these entries has a structured daily figure; their published limits are in the table, in the provider’s words.')) +
    (S.noExpiry.length ? h2('One-time credit that doesn’t expire', 'no-expiry') + p(`Not renewing, but no card and no deadline, in the provider’s words: ${S.noExpiry.map((x) => `${L(x)}: “${escProse(x.no_expiry.quote)}”`).join('; ')}.`) : '') +
    h2('Student programs', 'programs') +
    (S.programs.length
      ? p(`Some cloud and AI programs give students credit or tools on top of the free tiers. From our <a href="${prefix}programs/research">research and student programs</a> list:`) +
        tableHtml('Student programs', ['Program', 'For', 'What you get', 'Who qualifies'], S.programs.map((r) => [ext(r.url, esc(r.name)), esc(r.audience), esc(r.what), esc(r.who)]))
      : p(`See <a href="${prefix}programs/">credit programs</a> for startup and research credit.`)) +
    h2('Quickstart', 'quickstart') +
    chatQuickstart(qs, L, `a renewing free tier with no card required. ${qs ? `${flagsLine(qs, [['Phone', 'phone_required'], ['Commercial use', 'commercial_ok']])}. ` : ''}Install the SDK with <code>pip install openai</code>, put your key in the script and run it.`) +
    modalityGotchas(S.noCard, L, { what: 'AI', catches: false }) +
    `<h3>If you publish what you build</h3>` +
    p(`Commercial-use flags describe the provider’s terms for products. If you plan to sell or publish what you build, check that column: ${commercialSplit(S.noCard).yes.length} of the ${S.noCard.length} allow commercial use on the free tier. See <a href="${prefix}guides/choose-free-llm-api-for-production">can you use a free API in production?</a>`) +
    related([`<a href="${prefix}guides/free-chatbot-api">Free LLM APIs for a chatbot side project</a>`, `<a href="${prefix}guides/free-llm-api-no-credit-card-no-phone">No card, no phone: every API</a>`]);

  const faq = [
    { q: 'Is there a free AI API for students?', a: `Yes. ${S.noCard.length} of the ${S.verified} verified providers in our dataset have a renewing free tier with no credit card${text.length ? `; for chat and text, ${names(text.slice(0, 4))} among them` : ''}.` },
    { q: 'Can I use an AI API without signing up?', a: S.anon.length ? `Yes, with tighter limits: ${names(S.anon)} can be called with no account, per their own pages.` : 'No provider in the dataset records anonymous access today.' },
    { q: 'Which free AI APIs need no credit card and no phone?', a: noPhone.length ? `Among the renewing free tiers: ${names(noPhone)}.` : 'None of the renewing free tiers confirms both today.' },
    { q: 'Are there free AI credits for students?', a: S.programs.length ? `Yes: ${names(S.programs)} are listed for students in our programs list, each with its own conditions.` : 'Our programs list has none marked for students today.' },
  ];
  return { count: S.noCard.length, answer, body, faq, featured: S.noCard };
}

const RENDER = {
  'openai-api-alternatives': alternativesGuide,
  'choose-free-llm-api-for-production': productionGuide,
  'free-llm-api-no-credit-card-no-phone': noCardNoPhoneGuide,
  'free-embeddings-apis': embeddingsGuide,
  'free-speech-to-text-apis': speechGuide,
  'free-ocr-document-ai-apis': ocrGuide,
  'free-image-generation-apis': imageGuide,
  'free-llm-api-for-coding': codingGuide,
  'free-api-for-rag': ragGuide,
  'free-llm-api-for-ai-agents': agentsGuide,
  'free-chatbot-api': chatbotGuide,
  'free-ai-api-for-students': studentsGuide,
};

/** The page parts of one long guide: { count, answer, body, faq, featured, title, metaDesc }. `programs`
 * (data/programs.json) and `codingToolsOwnKey` (data/coding-tools-own-key.json) are optional: without them the
 * students and coding guides leave their lists out. */
export function longGuidePage(guide, { providers, notFree, prefix = '../', programs = null, codingToolsOwnKey = null }) {
  const render = RENDER[guide.slug];
  if (!render) throw new Error(`long-guides: no renderer for ${guide.slug}`);
  const out = render({ providers, notFree, prefix, programs, codingToolsOwnKey });
  const fill = (t) => t.replaceAll('{n}', String(out.count));
  return { ...out, title: fill(guide.title), metaDesc: fill(guide.metaDesc) };
}
