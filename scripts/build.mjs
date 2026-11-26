#!/usr/bin/env node
// Regenerates derived artifacts from canonical datasets, companion metadata and authored inputs.
// See docs/architecture.md for source inputs, generated regions and separate OG generation.
//   - README provider tables (between AUTOGEN markers)
//   - site/badge-freshness.json (served by the site, for the shields.io endpoint badge; built on deploy, not committed)
//   - site/providers.json so the interactive site ships the data
//   - site/providers.csv, the documented scalar projection for spreadsheets
// Zero dependencies. Run with: node scripts/build.mjs   (or `npm run build`)

import { shortenProse } from './lib/short-text.mjs';
import { measurementId, analyticsCspSources, consentScript, withAnalytics, CLOUDFLARE_WEB_ANALYTICS_CSP as CF_WA_CSP } from './lib/analytics.mjs';
import { providerLinkTargets, tagProviderLinks } from './lib/provider-links.mjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { recScore, intentRank, recommendedCmp, FREE_TYPE_RANK, freeTypeRank, FLAG_PAIRS, SLA_DAYS, DUE_SOON_DAYS, ageInDays, freshnessColor, freshnessBadge, freshnessStatus } from './lib/rules.mjs';
import * as rows from './lib/rows.mjs';
import * as sortLib from './lib/sort.mjs';
import { esc, stripTags } from './lib/escape.mjs';
import { mineHistoryAndSnapshots, HISTORY_FIELDS } from './lib/history.mjs';
import { flattenFieldChanges, groupChangesByWeek, changesRss, weekTitle, formatValue, beforeAfter } from './lib/changes.mjs';
import { monthlyReport, reportMonths, monthEndDate, monthName, monthLabel, pct, monthSummary, monthBrief } from './lib/state.mjs';
import { resolveBestEntries, topEntries, PODIUM_SIZE } from './lib/best.mjs';
import { agreementsTableHtml, sponsoredBlockHtml, disclosureHtml, inForce, NOT_IN_DATA_SENTENCE, MACHINE_SENTENCE } from './lib/agreements.mjs';
import { coverage, coverageMainHtml } from './lib/coverage.mjs';
import { freshnessHistogram, CLUSTER_LIMIT } from './lib/freshness-histogram.mjs';
import { quality, qualityMainHtml } from './lib/quality.mjs';
import { fieldCheck, REASON_LABEL } from './lib/field-checks.mjs';
import { publishedSpeed, speedFigure } from './lib/published-speed.mjs';
import { apiV1ProviderSchema, projectApiV1Changes, toApiV1Provider } from './lib/api-v1.mjs';
import { freeGpuMainHtml } from './lib/free-gpu.mjs';
import { labelTables } from './lib/tables.mjs';
import { markNewTabLinks } from './lib/links.mjs';
import { codingToolsMainHtml, codingToolMainHtml, codingToolTitle, codingToolDescription } from './lib/free-coding-tools.mjs';
import { dataPolicyRows, dataPolicyMainHtml, trainState } from './lib/data-policy-page.mjs';
import { quotesReportHtml } from './lib/quotes-report.mjs';
import { SCORE_WEIGHTS, EDITORIAL_WEIGHT, EDITORIAL_DEFAULT, MATH_INPUTS, MIN_CONFIRMED, TOP_SIZE, EDITORIAL_NOTE_THRESHOLD, STABILITY_MIN_DAYS, STABILITY_MIN_SAMPLES, rankProviders, editorialRating, inputFractions, stabilityFromProbe } from './lib/score.mjs';
import { scoreBlockHtml } from './lib/score-bar.mjs';
import { publishableClientConfigs } from './lib/client-config.mjs';
import { COLLECTIONS as SHARED_COLLECTIONS } from './lib/collections.mjs';
import * as compareLib from './lib/compare.mjs';
import * as findLib from './lib/find.mjs';
import { FIND_PATH, FIND_TITLE, FIND_DESC, findMainHtml, findJsonLd } from './lib/find-page.mjs';
import { requirementsHtml, limitsHtml, glanceHtml, modelsHtml, dataPolicyHtml, speedHtml } from './lib/provider-sections.mjs';
import { aboutHtml } from './lib/provider-summaries.mjs';
import { fontHead, fingerprintSite } from './lib/assets.mjs';
import { securityTxt } from './lib/security-txt.mjs';
import { markdownToHtml } from './lib/markdown.mjs';
import { bestFactsHtml } from './lib/best-facts.mjs';
import { providerFigures, expandFigures, injectInlineFigures, figureErrors } from './lib/figures.mjs';
import { firstUseHtml } from './lib/home-first-use.mjs';
import { badgeSvg } from './lib/badge-svg.mjs';
import { codeHtmlEsc, curlChatQuickstart, pythonChatQuickstart, pythonEmbeddingsQuickstart, pythonStringLiteral } from './lib/quickstart.mjs';
import { providersCsv } from './lib/provider-csv.mjs';
import { writeSchemaDocs } from './schema-docs.mjs';
import { datasetAsOf } from './lib/release-stamp.mjs';
import { parseCitation, homeJsonLd, datasetJsonLdScript } from './lib/dataset-jsonld.mjs';
import { websiteRef, datasetRef } from './lib/site-entity.mjs';
import { SITEMAP_INDEX, sitemapIndexXml } from './lib/state-sitemap.mjs';
import { SITEMAPS as INDEXNOW_SITEMAPS } from './lib/indexnow.mjs';
import { groupModels, modelKey } from './lib/model-keys.mjs';
import { providerMetaDescription } from './lib/provider-meta.mjs';
import { isIndexable, modelPageMainHtml, modelPageTitle, modelPageDescription, modelPageJsonLd } from './lib/model-pages.mjs';
import { collectionPageJsonLd as pageJsonLd, comparePageJsonLd } from './lib/page-jsonld.mjs';
import { notFreeErrors, notFreeReadmeMd, notFreeModel, notFreeMainHtml, notFreeJsonLd, notFreeTitle, notFreeDescription, NOT_FREE_PATH } from './lib/not-free.mjs';
import { embedMainHtml, embedTitle, embedDescription, EMBED_PATH } from './lib/embed-page.mjs';
import { citationRecord, citeBlockHtml } from './lib/citation.mjs';
import { LONG_GUIDES, longGuidePage } from './lib/long-guides.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FRESH_DAYS = SLA_DAYS; // the freshness SLA, defined once in lib/rules.mjs

const data = JSON.parse(readFileSync(join(ROOT, 'data/providers.json'), 'utf8'));
// `data.generated` in data/providers.json is the release stamp: it moves only with `version` (lib/release-stamp.mjs), and only
// CITATION.cff (`date-released`) prints it. Every public "generated"/"data of" date — the API envelopes, the CSV column,
// providers.json on the site, llms.txt, sitemap lastmod, "Data of …" lines — and every age the build computes keep their
// documented meaning, "the date of the last dataset change": ASOF, the newest date recorded in the data (datasetAsOf). It is
// derived from the committed data only (no clock), so the build stays byte-stable for a given dataset.
const ASOF = datasetAsOf(data);
// The dataset month in page titles ("Free LLM APIs (Nov 2026): ..."), Q10: from ASOF, the date of the last dataset
// change, never the clock, so a title moves only when the data does and the build stays deterministic.
const TITLE_MONTH = `${monthName(ASOF.slice(0, 7)).slice(0, 3)} ${ASOF.slice(0, 4)}`;
const datedTitle = (t) => (t.includes(' · Free LLM API Hub') ? t.replace(' · Free LLM API Hub', ` (${TITLE_MONTH}) · Free LLM API Hub`) : `${t} (${TITLE_MONTH})`);
const providers = data.providers;
const summaryBySlug = new Map(JSON.parse(readFileSync(join(ROOT, 'data/provider-summaries.json'), 'utf8')).summaries.map((x) => [x.id, x]));
// Counts quoted in prose come from the data, never from a typed number (lib/figures.mjs).
const FIGS = providerFigures(providers);

// ---------- freshness ----------
const today = new Date();
const isFresh = (p) => {
  if (!p.verified || !p.last_verified) return false;
  const a = ageInDays(p.last_verified, today);
  return a !== null && a <= FRESH_DAYS;
};
const total = providers.length;
const ongoing = providers.filter((p) => p.category === 'ongoing');
const trial = providers.filter((p) => p.category === 'trial');
const freshCount = providers.filter(isFresh).length;
const verifiedCount = providers.filter((p) => p.verified).length;
// The footer badge: its data is one object (written as badge-verified.json and drawn as badge-verified.svg), and its width
// goes into every <img> so the footer does not move when the image arrives.
const badgeVerified = { schemaVersion: 1, label: 'verified', message: `${verifiedCount}/${total}`, color: 'brightgreen' };
const BADGE_W = badgeSvg(badgeVerified).width;

// ---------- markdown helpers ----------
function flags(p) {
  const parts = [];
  if (p.card_required === false) parts.push('💳 no card');
  if (p.card_required === true) parts.push('💳 card required');
  if (p.phone_required === false) parts.push('📵 no phone');
  if (p.phone_required === true) parts.push('📱 phone');
  if (p.commercial_ok === true) parts.push('🏢 commercial OK');
  if (p.commercial_ok === 'conditional') parts.push('🏢 commercial OK (conditional)');
  if (p.commercial_ok === false) parts.push('🔬 eval only');
  if (p.openai_compatible === true) parts.push('🔌 OpenAI-compat');
  return parts.length ? `<br><sub>${parts.join(' · ')}</sub>` : '';
}

// docs_url becomes a link only when it is an https URL. The validator enforces
// this for every entry; the guard keeps an unexpected value (an empty string,
// another scheme) from ever turning into a self-link or a script URL.
const docsHref = (u) => (typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u) ? u : '');

function nameCell(p) {
  const label = `**${esc(p.name)}**`;
  const linked = docsHref(p.docs_url) ? `**[${esc(p.name)}](${docsHref(p.docs_url)})**` : label;
  return `${linked}${flags(p)}`;
}

function verifiedCell(p) {
  return p.verified ? `✅ ${p.last_verified}` : '⚠️ unverified';
}

// The single README table: the top 10 by the FLLMAPIHUB score, in rank order. The score and
// how many of its six inputs are confirmed sit next to the name; the method is on /best/methodology/.
function bestTable(entries) {
  const head =
    '| # | Provider | Score | What\'s free | The catch | Verified |\n' +
    '|---|---|---|---|---|---|';
  const body = entries
    .map((e) => {
      const { p } = e;
      const label = docsHref(p.docs_url) ? `**[${esc(p.name)}](${docsHref(p.docs_url)})**` : `**${esc(p.name)}**`;
      // Long catches are cut at a sentence for the README; the provider page keeps the full text.
      const catchText = shortenProse(p.notes);
      const catchCell = esc(catchText.text) + (catchText.shortened ? ` [More ↗](${SITE}/p/${p.slug})` : '');
      return `| ${e.rank} | ${label}${flags(p)} | ${e.total.toFixed(1)}<br><sub>${e.confirmed} of ${e.of} inputs</sub> | ${esc(p.free_tier)} | ${catchCell} | ${verifiedCell(p)} |`;
    })
    .join('\n');
  return `${head}\n${body}`;
}

// ---------- editorial collections (generated from the data) ----------
const SITE = 'https://freellmapihub.com';
const collectionPageJsonLd = (args) => pageJsonLd({ site: SITE, ...args });

const COLLECTION_COPY = [
  {
    slug: 'no-credit-card',
    answer: '{n} of {total} tracked providers need no payment method to start. That includes trial credits as well as permanent free tiers, so read the Type column. Each row says what is free and the catch. The list is a live filter and changes when a provider changes its terms.',
    metaDesc: '{n} LLM APIs you can start calling without a payment method, filtered live from a dated dataset. Dataset of {date}.',
    title: 'Free LLM APIs with no credit card',
    h1: 'Free LLM APIs with no credit card required',
    desc: 'LLM APIs you can start calling without entering a payment method — filtered live from a continuously-verified dataset.',
    intro: 'Every provider below offers free API access with **no card required** to get started (`card_required: false`, confirmed against their own docs). Rows where the requirement is unknown are excluded rather than assumed.',
    guides: ['free-llm-api-without-credit-card', 'free-llm-api-no-signup', 'free-llm-api-no-credit-card-no-phone'],
    faq: [
      { q: 'Can I use an LLM API for free without a credit card?', a: 'Yes — every provider on this page offers a free tier with no card required, confirmed against its own docs. You are limited by rate, not billing.' },
      { q: 'Will I be charged if I go over the free limit?', a: 'Usually not. Without a payment method on file there is nothing to charge, so reaching a limit means being rate-limited (HTTP 429). Read the catch on each row, because terms change.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
  {
    slug: 'no-phone',
    answer: '{n} of {total} tracked providers do not ask for a phone number at signup. Some still require an email or a sign-in with another account. A provider whose phone rule is not known is left out rather than assumed, and the list updates when a provider changes its signup.',
    metaDesc: '{n} LLM APIs whose signup needs no SMS or phone verification, filtered live from a dated dataset. Dataset of {date}.',
    title: 'Free LLM APIs with no phone verification',
    h1: 'Free LLM APIs with no phone number required',
    desc: 'LLM APIs whose signup needs no SMS/phone verification — a live slice of a continuously-verified dataset.',
    intro: 'Providers you can sign up for **without phone verification** (`phone_required: false`). Providers that gate signup behind a phone number, or whose rule is not known, are left out.',
    guides: ['free-llm-api-no-signup', 'free-llm-api-no-credit-card-no-phone'],
    faq: [
      { q: 'Is there a free LLM API with no phone verification?', a: 'Yes — every provider on this page asks for no phone number at signup, according to its own docs. A provider whose rule is not known is not listed.' },
      { q: 'Do these APIs need any account at all?', a: 'Almost always: they ask for an email or a sign-in with an existing account, only not for a phone number.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
  {
    slug: 'anonymous-access',
    answer: '{n} of {total} tracked providers say on their own pages that their API can be called with no account, through an anonymous endpoint or a shared key. Anonymous use has the tightest limits and lowest priority, and each row quotes the sentence it rests on. Providers whose pages do not say so are left out.',
    metaDesc: '{n} AI APIs whose own pages say they can be called with no account: anonymous endpoint or shared key, each with the quoted sentence. Dataset of {date}.',
    title: 'Free AI APIs with no account needed',
    h1: 'Free AI APIs you can call with no account',
    desc: 'APIs whose own pages say they work with no account at all: an anonymous endpoint or a shared public key. Each row quotes the provider. A live slice of a verified dataset.',
    intro: 'Providers whose **own page says the API can be called with no account** (`anonymous_access`: the page, the day it was read and the sentence). Expect the lowest limits and queue priority. A provider whose pages do not say it is not listed, which never means it needs an account.',
    header: 'Each row ends with the provider’s own sentence about anonymous access and any condition its pages attach to it.',
    rowMark: (p) => anonMark(p.anonymous_access),
    guides: ['free-llm-api-no-signup', 'free-llm-api-no-credit-card-no-phone'],
    faq: [
      { q: 'Can I call an AI API with no account at all?', a: 'Yes, a few providers allow it, according to their own pages: each row on this page quotes the sentence and the day it was read. Anonymous use has the tightest limits and the lowest priority.' },
      { q: 'Is anonymous access the same as no signup form?', a: 'No. Most providers with no card and no phone still ask for an email or a sign-in; those are in the no-card and no-phone collections. This page lists only APIs that work with no account.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
  {
    slug: 'commercial-use',
    answer: '{n} of {total} tracked free tiers say commercial or production use is allowed, according to each provider’s own terms. Evaluation-only tiers are left out, and so is any tier whose terms do not say. Confirm with the provider before you launch.',
    metaDesc: '{n} free LLM API tiers that allow production use, checked against each provider’s terms. Dataset of {date}.',
    title: 'Free LLM APIs for commercial use',
    h1: 'Free LLM APIs you can use commercially',
    desc: 'Free LLM API tiers that permit production/commercial use — not restricted to evaluation. Verified against each provider’s terms.',
    intro: 'Free tiers that **allow commercial/production use** (`commercial_ok: true`). Evaluation-only tiers (`commercial_ok: false`) and tiers whose terms do not say are deliberately left out — read their rows in the main list for the restriction.',
    guides: ['openai-compatible-free-apis', 'free-llm-api-without-credit-card', 'choose-free-llm-api-for-production'],
    faq: [
      { q: 'Can I use this list in a commercial product?', a: 'Yes. Free LLM API Hub and its dataset are MIT licensed, so you can reuse, fork and adapt them, including commercially. A link back is appreciated but not required. Each provider’s page has a Commercial use line that reads allowed, evaluation only or not confirmed, and the explorer on the home page marks the first two with an icon. Not confirmed means no reading of the provider’s terms has confirmed that commercial use is allowed: some terms do not clearly say so, and for other providers the question is still open. It is not a permission. The data describes other companies’ free tiers, whose terms change without notice, so confirm against the provider’s own docs before you ship. This list is independent: it is not affiliated with, endorsed by or sponsored by any provider on it, and it is not legal advice.' },
      { q: 'Which free LLM APIs allow commercial use?', a: 'Every provider on this page permits commercial/production use on its free tier (`commercial_ok: true`), confirmed against its own terms. Evaluation-only tiers are excluded.' },
      { q: 'Is a free tier safe to ship to production?', a: 'Check the rate limits and whether the free tier is renewing or a one-time credit — both are on each provider’s row. For steady load, a renewing free tier or a paid plan is safer than a trial credit.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
  {
    slug: 'openai-compatible',
    answer: '{n} of {total} tracked free APIs accept OpenAI-style requests, so you point the OpenAI SDK at a new base_url and key and keep your code. The table gives each provider’s base URL. Compatibility can be partial: the catch column notes limits.',
    metaDesc: '{n} free LLM APIs with an OpenAI-compatible endpoint: change base_url and key, keep your SDK. Dataset of {date}.',
    title: 'OpenAI-compatible free LLM APIs',
    h1: 'Free LLM APIs with an OpenAI-compatible endpoint',
    desc: 'Free LLM APIs that expose an OpenAI-compatible endpoint — point the OpenAI SDK at a new base_url and you are done.',
    intro: 'These providers expose an **OpenAI-compatible endpoint** (`openai_compatible: true`), so migrating is usually a one-line change: keep the OpenAI SDK, swap `base_url` and `api_key`. Grab each provider’s exact base URL from its linked docs.',
    quickstart: true,
    guides: ['openai-compatible-free-apis', 'openai-api-alternatives'],
    faq: [
      { q: 'What does OpenAI-compatible mean?', a: 'The API accepts the same request format as OpenAI’s <code>/chat/completions</code>, so the OpenAI SDK works by changing only <code>base_url</code> and the API key.' },
      { q: 'Is every feature supported?', a: 'Not necessarily: compatibility can be partial, and a feature a provider lacks fails at the provider. Read the catch on each row.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
  {
    slug: 'always-free',
    answer: '{n} of {total} tracked providers list models at $0 on a perpetual basis, with no trial window counting down. That describes what the provider says today, not a promise: prices and limits can change, so each row shows the day it was read.',
    metaDesc: '{n} LLM APIs with models priced at $0 on an ongoing basis, not a trial countdown. Dataset of {date}.',
    title: 'Permanently free LLM APIs',
    h1: 'Permanently free LLM APIs (no trial clock)',
    desc: 'LLM APIs with models priced at $0 on an ongoing basis — no trial window counting down. Verified from a live dataset.',
    intro: 'Providers with models that are **free on a permanent basis** (`free_type: perpetual`) — not a trial credit that runs out. Rate limits still apply; check each row.',
    faq: [
      { q: 'Are there LLM APIs that are free with no trial clock?', a: 'Yes — the providers on this page list models at $0 on a perpetual basis, according to their own pages. Rate limits still apply.' },
      { q: 'Does permanently free mean free forever?', a: 'No. It describes what the provider says today; prices and limits can change, so every row shows the day it was read.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
  {
    slug: 'multimodal',
    answer: '{n} of {total} tracked free tiers go beyond text: vision, image, speech, embeddings, rerank or OCR. The What’s free column describes each tier and the catch column its limits. The guides linked below go deeper on each modality, with the limits side by side.',
    metaDesc: '{n} free API tiers beyond text: vision, image, audio, embeddings, rerank and OCR. Dataset of {date}.',
    title: 'Free multimodal LLM APIs',
    h1: 'Free multimodal APIs — vision, audio, embeddings',
    desc: 'Free API tiers that go beyond text: vision, image, audio/speech, embeddings and rerank. A live slice of a verified dataset.',
    intro: 'Free tiers that reach **beyond plain text** — vision, image, audio/speech, embeddings or rerank on the free plan.',
    guides: ['free-embeddings-apis', 'free-speech-to-text-apis', 'free-image-generation-apis', 'free-ocr-document-ai-apis'],
    faq: [
      { q: 'Are there free APIs for images, speech and embeddings — not just text?', a: 'Yes — the providers here reach beyond text on their free tier: vision, image generation, speech (STT/TTS), embeddings or rerank. See the modality-specific guides linked above.' },
      { q: 'Can one free API cover several modalities?', a: 'Some do: a provider can span text, vision, audio and embeddings on a single free key. The What’s free column of each row says which modalities that provider offers free.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
  {
    slug: 'no-training',
    answer: 'Only providers with a sentence of their own saying they do not train on prompts are listed: {n} of {total}. Each provider page cites its source and read date. A provider that says nothing is not listed, which does not mean it trains. Many sources do not say if it covers the free plan.',
    metaDesc: '{n} of {total} tracked providers say in their own terms that they do not train on your prompts. Source and date on each provider page.',
    title: 'Free LLM APIs that say they do not train on your prompts',
    h1: 'Free LLM APIs that say they do not train on your prompts',
    desc: 'Free LLM and AI APIs whose own terms or privacy page say they do not use your prompts to train their models; each provider’s page on this site cites the source and the day it was read. A live slice of a verified dataset.',
    intro: 'Providers whose **own page says they do not train on your prompts** (`data_policy.trains_on_prompts: false`). Each provider’s own page on this site shows the page its policy rests on (a link, with the day it was read). Read the conditions: some say it only holds unless you opt in, or in a privacy notice rather than a contract. Providers that do not state it are not listed, which never means they train.',
    // A row is the provider's own sentence; whether it covers the free plan is a separate fact, shown per row (see planMark).
    header: 'Each row is the provider’s own sentence. Many sources do not say whether it covers the free plan; read the row’s note.',
    rowMark: (p) => planMark(p.data_policy),
    guides: ['choose-free-llm-api-for-production'],
    faq: [
      { q: 'Which free LLM APIs say they do not train on my prompts?', a: 'The providers on this page, each according to its own terms or privacy page, cited with the day it was read on the provider’s page on this site. The wording differs: for some it holds only while you have not opted in to training, and a privacy notice is not a contract.' },
      { q: 'Does a provider missing from this list train on my data?', a: 'Not necessarily. A provider is missing when its own page says it may train on prompts, says nothing we could cite, or could not be read. Check the provider before you send sensitive data.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
  {
    slug: 'renewing-free-tier',
    answer: '{n} of {total} tracked providers give a free allowance that renews: a daily or monthly quota or credit that resets, not a one-time balance. Renewing does not mean unlimited — limits are hard and some tiers are evaluation-only, so read the Type and catch columns. The list is a live filter.',
    metaDesc: '{n} AI APIs whose free allowance renews instead of running out once, filtered live from a dated dataset. Dataset of {date}.',
    title: 'Free LLM APIs whose free tier renews',
    h1: 'Free LLM APIs with a renewing free allowance',
    desc: 'LLM and AI APIs whose free allowance resets (daily, monthly or per minute) instead of running out once — a live slice of a verified dataset.',
    intro: 'Providers whose free access **renews**: a quota (`free_type: renewing-quota`) or a credit (`free_type: recurring-credit`) that resets on a schedule. One-time signup credits and permanently free models are listed in other collections. A renewing allowance can still be evaluation-only (for example Cohere) — read the catch.',
    guides: ['free-llm-api-without-credit-card', 'openai-compatible-free-apis'],
    faq: [
      { q: 'Which free LLM APIs reset their limits?', a: 'The providers on this page: their free allowance renews on a schedule rather than being a one-time credit.' },
      { q: 'Is a renewing allowance the same as permanently free?', a: 'No. Permanently free (see that collection) means models priced at $0 with no trial window; a renewing allowance resets and may change or carry commercial restrictions.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
  {
    slug: 'free-signup-credit',
    answer: '{n} of {total} tracked providers start you with a one-time credit or token balance rather than a renewing quota. It is the right choice for a prototype or an evaluation, and it ends: check whether it expires and whether a card is needed.',
    metaDesc: '{n} AI APIs that start with a one-time free credit, filtered live from a dated dataset. Dataset of {date}.',
    title: 'Free LLM APIs with a free signup credit',
    h1: 'Free LLM APIs that start with a free credit',
    desc: 'AI APIs that give a one-time free credit or token balance at signup, which runs out instead of renewing — a live slice of a verified dataset.',
    intro: 'Providers whose free access is a **one-time credit** (`free_type: trial-credit`): it is spent, not renewed. Renewing allowances are in their own collection. Some credits expire, with windows from 30 days to a year in the dataset, and a provider that has not been re-verified is left out.',
    guides: ['free-llm-api-without-credit-card'],
    faq: [
      { q: 'Do free signup credits expire?', a: 'Some do, with windows from 30 days to a year in the dataset; others say the credit does not expire. Each row shows the catch.' },
      { q: 'Is a signup credit the same as a free tier?', a: 'No. A credit is a balance that runs out; a free tier renews or is permanent. See the renewing and permanently free collections.' },
      { q: 'How often does this list change?', a: 'It is a live filter of the dataset: it is regenerated whenever the dataset changes, and every row shows the day its source was read.' },
      { q: 'How do I report a mistake?', a: 'Open an issue on GitHub with the row and the evidence; the maintainers re-read the provider’s own page.' },
    ],
  },
];

const COLLECTIONS = SHARED_COLLECTIONS.map(({ slug, filter }) => {
  const copy = COLLECTION_COPY.find((c) => c.slug === slug);
  if (!copy) throw new Error(`Missing collection copy: ${slug}`);
  return { ...copy, filter };
});
if (COLLECTION_COPY.length !== COLLECTIONS.length) throw new Error('Collection copy and filters must cover the same collections');

// SEO guides — intent-matched landing pages generated from the data. Declared
// here (before the provider loop) so provider pages can cross-link to them.
const GUIDES = [
  {
    slug: 'free-llm-api-without-credit-card',
    answer: 'Yes. {n} providers in the verified dataset give a free tier without asking for a card at signup, so reaching a limit usually means being rate-limited rather than billed, because no card is on file. Before you choose, compare two columns in the table: the rate limits, and whether the free tier allows commercial use.',
    metaDesc: '{n} free LLM APIs that need no credit card at signup. Rate limits and commercial-use flags side by side. Dataset of {date}; each row is dated.',
    card: 'No credit card',
    blurb: 'Production-grade free tiers that never ask for a card.',
    h1: 'Free LLM APIs with no credit card required',
    title: 'Free LLM API — no credit card required · Free LLM API Hub',
    desc: 'Verified LLM APIs with a genuinely free tier that requires no credit card at signup. Rate limits and commercial-use terms compared.',
    lede: 'Yes — several production-grade LLM APIs give you a free tier without ever asking for a card.',
    intro: `<p>The fastest way to start building is an API that doesn't gate its free tier behind a payment method. Every provider below was verified to require <strong>no credit card</strong> at signup for its free access — so there's no risk of a surprise charge when you cross a limit; you simply get rate-limited.</p><p>Watch two things as you choose: the per-minute / per-day <em>rate limits</em> (fine for prototypes, tight for production) and whether <em>commercial use</em> is allowed on the free tier. Both are in the table.</p>`,
    filter: (p) => p.card_required === false && p.category === 'ongoing',
    query: '?cat=ongoing&nocard=1#explorer',
    faq: [
      { q: 'Can I use an LLM API for free without a credit card?', a: 'Yes. Providers such as Google Gemini, Groq and Cloudflare Workers AI give a free tier with no card required — you are limited by rate, not billing, so you cannot be charged by surprise.' },
      { q: 'Will I be charged if I exceed the free limits?', a: 'No. On a no-card free tier you get rate-limited (HTTP 429) rather than billed. You would have to explicitly add a payment method before any spend is possible.' },
      { q: 'Are these free tiers okay for commercial use?', a: 'Some are, some are not — each row shows a commercial-use flag, confirmed against the provider’s own terms.' },
    ],
  },
  {
    slug: 'openai-compatible-free-apis',
    answer: '{n} verified free APIs expose an OpenAI-compatible endpoint. With the official OpenAI SDK you change the base_url and the API key and keep the rest of your code. Compatibility can be partial, so check which endpoints and features, such as tools or streaming, each provider supports.',
    metaDesc: "{n} free LLM APIs with an OpenAI-compatible endpoint: change base_url and your key, keep your SDK. Dataset of {date}; every row carries its own verification date.",
    card: 'OpenAI-compatible',
    blurb: 'Keep your code — just swap base_url and key.',
    h1: 'Free OpenAI-compatible APIs (drop-in base_url)',
    title: 'Free OpenAI-compatible APIs — drop-in base_url · Free LLM API Hub',
    desc: 'Free LLM APIs that expose an OpenAI-compatible endpoint, so you only change base_url and the API key. Confirmed against each provider’s docs.',
    lede: 'Point the OpenAI SDK at a different base_url and keep all of your existing code.',
    intro: `<p>An OpenAI-compatible API exposes the same <code>/chat/completions</code> shape, so switching is usually a one-line change: swap <code>base_url</code> and the key. That makes these the lowest-friction way to move side projects off paid OpenAI usage, or to add a free fallback behind the same SDK.</p><p>Each provider's exact base URL is on its page, and the free models you can pass as <code>model</code> are in the <a href="../models/">model index</a>.</p>`,
    filter: (p) => p.openai_compatible === true,
    query: '#explorer',
    faq: [
      { q: 'What does OpenAI-compatible mean?', a: 'The API accepts the same request and response format as OpenAI’s <code>/chat/completions</code>, so the official OpenAI SDKs work by changing only <code>base_url</code> and the API key.' },
      { q: 'How do I switch my code to a free OpenAI-compatible API?', a: 'Set <code>base_url</code> to the provider’s endpoint (listed on each provider page), use its free API key, and pass one of its free model IDs as <code>model</code>.' },
      { q: 'Do all free LLM APIs support the OpenAI format?', a: 'No — this list is only the providers confirmed to expose an OpenAI-compatible endpoint against their own documentation.' },
    ],
  },
  {
    slug: 'free-llm-api-no-signup',
    answer: '{n} providers in the verified dataset need neither a payment card nor a phone number to get a key. Signup is not removed: most still ask for an email or a sign-in with an existing account. The table shows what each free tier allows and the rate limits that come with the lowest friction.',
    metaDesc: '{n} free LLM APIs whose signup asks for neither a card nor a phone number: the lowest-friction keys. Dataset of {date}; every row is dated.',
    card: 'No card, no phone',
    blurb: 'The lowest-friction keys: no card, no phone number.',
    h1: 'Free LLM APIs with no phone number (and no card)',
    title: 'Free LLM API — no phone, no credit card · Free LLM API Hub',
    desc: 'The lowest-friction free LLM APIs: no credit card and no phone verification. A couple need no account at all.',
    lede: 'The lowest-friction free APIs: no card, and no phone number either.',
    intro: `<p>Some free tiers add phone verification on top of the signup form. The providers here ask for <strong>neither a credit card nor a phone number</strong>, so you can go from zero to a working key in a couple of minutes.</p><p>A few — like AI Horde — don't even need an account for basic use. The trade-off is predictable: the fewer the gates, the tighter the rate limits.</p>`,
    filter: (p) => p.card_required === false && p.phone_required === false && p.category === 'ongoing',
    query: '?cat=ongoing&nocard=1&nophone=1#explorer',
    faq: [
      { q: 'Is there a free LLM API with no phone verification?', a: 'Yes — every provider here requires neither a credit card nor a phone number to obtain a key.' },
      { q: 'Can I call an LLM API with no account at all?', a: 'A few can, with tighter limits: AI Horde works with a shared anonymous key and the lowest queue priority. Most providers here still want an email or a sign-in with an existing account.' },
    ],
  },
  {
    slug: 'free-reranking-apis',
    answer: '{n} providers in the verified dataset include a reranker in their free access. Cohere and Pinecone give an allowance that renews (Cohere’s free key is for evaluation only; Pinecone’s is 500 rerank requests a month); Jina AI, Mixedbread, Voyage AI and Contextual AI give a one-time balance. Read the catch first.',
    metaDesc: '{n} free reranking APIs with limits, commercial-use flags and catches compared. Dataset of {date}; each row is dated.',
    card: 'Reranking',
    blurb: 'Free rerank tiers for search and RAG.',
    h1: 'Free reranking APIs for search and RAG',
    title: 'Free reranking & rerank APIs · Free LLM API Hub',
    desc: 'Verified reranking APIs with a free tier or starting credit, with limits, commercial-use flags and catches side by side.',
    lede: 'Yes — several providers in the dataset include a reranker in a free tier or a starting credit, most of them as a one-time balance.',
    intro: `<p>A reranker reorders the passages a search or embedding step returns, and it is the cheapest quality gain in most RAG systems. The providers below list a reranker inside their <strong>free tier or starting credit</strong>.</p><p>Read two things per row: whether the allowance <em>renews</em> or is a one-time balance, and whether <em>commercial use</em> is allowed — Cohere’s free key explicitly is not. The pricing pages of Voyage AI and Pinecone disagree with themselves about which rerankers the free plan covers, and the catch of their rows says so.</p>`,
    filter: (p) => (p.modalities || []).includes('rerank') && p.verified,
    query: '#explorer',
    modality: 'rerank',
    pick: 'jina-ai',
    faq: [
      { q: 'Is there a free reranking API?', a: 'Yes. Jina AI, Mixedbread, Voyage AI and Contextual AI give a one-time free balance that covers their rerankers with no card, and Pinecone offers 500 rerank requests a month on its Starter plan. Cohere’s free key also includes rerank but is for evaluation only.' },
      { q: 'Can I use a free reranker in production?', a: 'Only where the row says commercial use is allowed (Jina AI and Mixedbread today). Cohere forbids it on a trial key, and for Pinecone, Voyage AI and Contextual AI the dataset records no commercial-use statement.' },
      { q: 'Does a free reranker renew?', a: 'Two do: Cohere and Pinecone give an allowance that resets (Pinecone’s is 500 rerank requests a month). The credits of Jina AI, Mixedbread, Voyage AI and Contextual AI are one-time grants.' },
    ],
  },
  {
    slug: 'free-vision-apis',
    answer: 'Yes. {n} providers in the verified dataset include an image-understanding model in their free access. Google Gemini and Z.ai need no card; Moondream renews a $5 credit each month; Tencent’s offer runs until 2026-12-31. This guide is about reading images; for generating them see the image-generation guide.',
    metaDesc: '{n} free vision APIs for captioning, visual Q&A and detection, with limits and catches compared. Dataset of {date}.',
    card: 'Vision',
    blurb: 'Free image-understanding tiers: describe, query, detect.',
    h1: 'Free vision APIs — image understanding',
    title: 'Free vision & image-understanding APIs · Free LLM API Hub',
    desc: 'Verified APIs that read images (captioning, visual question answering, detection) with a free tier or starting credit. Limits and catches compared.',
    lede: 'Several providers let you send an image to a model at no cost — from Gemini’s free quota to Moondream’s monthly credit.',
    intro: `<p>Vision models take an image and answer about it: caption it, answer a question, find an object. The providers below list a <strong>vision-capable model</strong> in a free tier or starting credit.</p><p>Check whether the allowance <em>renews</em>, whether <em>commercial use</em> is allowed (ModelScope says no) and what the catch is — for example, Twelve Labs analyses video rather than chatting about stills, and Tencent has moved its Hunyuan models to a new platform.</p>`,
    filter: (p) => (p.modalities || []).includes('vision') && p.verified,
    query: '#explorer',
    modality: 'vision',
    pick: 'google-gemini',
    faq: [
      { q: 'Is there a free API to analyse images?', a: 'Yes. Google Gemini has a free tier with no card, Z.ai lists its GLM-4.6V-Flash vision model at $0 permanently, and Moondream gives $5 of credit each month.' },
      { q: 'Is a free vision API okay for commercial use?', a: 'Check each row. The dataset records commercial use as allowed for Google Gemini, Z.ai and W&B Inference, and as not allowed for ModelScope; for OpenRouter, Moondream, Tencent and Twelve Labs it records no commercial-use statement.' },
      { q: 'What is the difference between vision and image generation?', a: 'Vision reads an image and returns text. Image generation makes a new image from text; see the free image-generation guide for that.' },
    ],
  },
];

const collRows = (c) => providers.filter(c.filter);
const typeLabel = (p) => (p.category === 'ongoing' ? 'Ongoing' : 'Trial');

// Markdown table for a collection. With opts.baseUrl, the 2nd column shows the
// OpenAI base URL instead of the tier type (used on the openai-compatible page).
// The plan mark of a data_policy row. `plan_named` is an optional field (true | false | null) that records whether the source
// itself names the plan; until it is set the row says it was not checked, never that the source names no plan.
function planMark(dp) {
  if (dp && dp.plan_named === true) return 'plan named in the source';
  if (dp && dp.plan_named === false) return 'plan not named in the source';
  return 'plan: not checked yet';
}

// The row mark of an anonymous_access row: the provider's own sentence, its reading date and any condition, as plain text
// (both table renderers escape it).
function anonMark(aa) {
  if (!aa) return '';
  return `“${aa.quote}” (read ${aa.checked})${aa.note ? ` — ${aa.note}` : ''}`;
}

function collectionTableMd(rows, opts = {}) {
  const bu = opts.baseUrl;
  const head = bu
    ? "| Provider | OpenAI base URL | What's free | The catch | Verified |\n|---|---|---|---|---|"
    : "| Provider | Type | What's free | The catch | Verified |\n|---|---|---|---|---|";
  const body = rows
    .map((p) => {
      const col2 = bu ? (p.openai_base_url ? `\`${esc(p.openai_base_url)}\`` : '_see docs_') : typeLabel(p);
      const mark = opts.rowMark ? `<br>_${esc(opts.rowMark(p))}_` : '';
      return `| ${nameCell(p)}${mark} | ${col2} | ${esc(p.free_tier)} | ${esc(p.notes)} | ${verifiedCell(p)} |`;
    })
    .join('\n');
  return `${head}\n${body}`;
}

// Concrete, runnable example drawn from the data (Groq: verified, no card, well-known free models).
const QUICKSTART_EXAMPLE = providers.find((p) => p.slug === 'groq' && p.openai_base_url) || providers.find((p) => p.openai_base_url);
const QS_BASE = QUICKSTART_EXAMPLE ? QUICKSTART_EXAMPLE.openai_base_url : 'https://<provider-base-url>/v1';
const QS_NAME = QUICKSTART_EXAMPLE ? QUICKSTART_EXAMPLE.name : 'the provider';
const QS_MODEL = QUICKSTART_EXAMPLE && QUICKSTART_EXAMPLE.slug === 'groq' ? 'llama-3.1-8b-instant' : '<a-free-model>';
const QS_PYTHON = pythonChatQuickstart(QS_BASE, QS_MODEL);
const QS_CURL = curlChatQuickstart(QS_BASE, QS_MODEL, { apiKeyVariable: 'YOUR_FREE_API_KEY', spacedJson: true });

const QUICKSTART_MD = `## Quickstart — reuse the OpenAI SDK

Most of these accept the OpenAI SDK with two changes: point \`base_url\` at the provider and use its free key. The base URLs are in the table above; grab a key from each provider's console.

### Python — example: ${QS_NAME}

\`\`\`python
${QS_PYTHON}
\`\`\`

### curl

\`\`\`bash
${QS_CURL}
\`\`\`

Swap the \`base_url\` (and a model that provider offers free) for any row above.
`;

// ---------- HTML page shell (shared by collection pages) ----------
const htmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function collectionTableHtml(rows, opts = {}) {
  const bu = opts.baseUrl;
  const flagsHtml = (p) => {
    const parts = [];
    if (p.card_required === false) parts.push(`${IC('ic-nocard')}no card`);
    if (p.card_required === true) parts.push(`${IC('ic-card')}card`);
    if (p.phone_required === false) parts.push(`${IC('ic-nophone')}no phone`);
    if (p.phone_required === true) parts.push(`${IC('ic-phone')}phone`);
    if (p.commercial_ok === true) parts.push(`${IC('ic-building')}commercial OK`);
    if (p.commercial_ok === 'conditional') parts.push(`${IC('ic-building')}commercial OK (conditional)`);
    if (p.commercial_ok === false) parts.push(`${IC('ic-flask')}eval only`);
    if (p.openai_compatible === true) parts.push(`${IC('ic-code')}OpenAI-compat`);
    return parts.length ? `<div class="flags">${parts.map((t) => `<span>${t}</span>`).join('')}</div>` : '';
  };
  const col2Head = bu ? 'OpenAI base URL' : 'Type';
  const rowsHtml = rows
    .map((p) => {
      const name = docsHref(p.docs_url)
        ? `<a href="${htmlEsc(docsHref(p.docs_url))}" target="_blank" rel="noopener">${htmlEsc(p.name)}</a>`
        : htmlEsc(p.name);
      const v = p.verified
        ? `<span class="v ok">${IC('ic-check')} ${htmlEsc(p.last_verified)}</span>`
        : `<span class="v warn">${IC('ic-warn')} unverified</span>`;
      const col2 = bu
        ? (p.openai_base_url ? `<code>${htmlEsc(p.openai_base_url)}</code>` : '<span class="notes">see docs</span>')
        : `<span class="type">${typeLabel(p)}</span>`;
      const mark = opts.rowMark ? `<div class="flags"><span>${htmlEsc(opts.rowMark(p))}</span></div>` : '';
      return `<tr><td class="name">${name}${flagsHtml(p)}${mark}</td><td>${col2}</td><td>${htmlEsc(p.free_tier)}</td><td class="notes">${htmlEsc(p.notes)}</td><td>${v}</td></tr>`;
    })
    .join('\n');
  // The table scrolls inside its own region when it is wider than the column (it is 611px at a 360px screen): the page never scrolls sideways.
  return `<div class="table-scroll" role="region" aria-label="Table of providers" tabindex="0"><table><thead><tr><th>Provider</th><th>${col2Head}</th><th>What's free</th><th>The catch</th><th>Verified</th></tr></thead><tbody>\n${rowsHtml}\n</tbody></table></div>`;
}

// Shared chrome for generated pages (collection pages live one level below site root → '../').
const GH_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';
const REPO = 'https://github.com/pacocartones/free-llm-api-hub';
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="logo" viewBox="0 0 32 32" fill="none"><rect x="2" y="2" width="28" height="28" rx="8" fill="currentColor"/><path d="M9 11 L14 16 L9 21" style="stroke: var(--logo-ink, #0a0d0b)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="16.5" y="19.4" width="7" height="2.6" rx="1.3" style="fill: var(--logo-ink, #0a0d0b)"/></symbol>
<symbol id="ic-card" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="3.5" width="13" height="9" rx="2"/><path d="M1.5 6.5H14.5"/></symbol>
<symbol id="ic-nocard" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="3.5" width="13" height="9" rx="2"/><path d="M1.5 6.5H14.5"/><path d="M2.6 2 L13.4 14"/></symbol>
<symbol id="ic-phone" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4.5" y="1.5" width="7" height="13" rx="1.6"/><path d="M7 12.3H9"/></symbol>
<symbol id="ic-nophone" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4.5" y="1.5" width="7" height="13" rx="1.6"/><path d="M7 12.3H9"/><path d="M2.6 2 L13.4 14"/></symbol>
<symbol id="ic-building" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 5H6.01M10 5H10.01M6 8H6.01M10 8H10.01M6.5 14V11.5H9.5V14"/></symbol>
<symbol id="ic-flask" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M6.2 2V6L3.2 12.2A1 1 0 0 0 4.1 13.7H11.9A1 1 0 0 0 12.8 12.2L9.8 6V2"/><path d="M5 2H11M5.2 9H10.8"/></symbol>
<symbol id="ic-code" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4"/></symbol>
<symbol id="ic-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8.5 6 12l7.5-8"/></symbol>
<symbol id="ic-warn" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5 15 14H1z"/><path d="M8 6.5V9.5M8 11.6V11.7"/></symbol>
<symbol id="ic-doc" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5V5h3M6 8.5h4M6 11h3"/></symbol>
<symbol id="ic-link" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 9.4 9.4 6.6"/><path d="M7 4.6 8.4 3.2a2.4 2.4 0 0 1 3.4 3.4L10.4 8"/><path d="M9 11.4 7.6 12.8a2.4 2.4 0 0 1-3.4-3.4L5.6 8"/></symbol>
<symbol id="ic-gauge" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12a5.5 5.5 0 1 1 11 0"/><path d="M8 12l3-3.2"/></symbol>
<symbol id="ic-flag" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.5V2"/><path d="M4 2.6h7.5L10 5.3l1.5 2.7H4"/></symbol>
<symbol id="ic-database" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3.5c0 1.1-2.2 2-5 2s-5-.9-5-2 2.2-2 5-2 5 .9 5 2z"/><path d="M3 3.5v9c0 1.1 2.2 2 5 2s5-.9 5-2v-9"/><path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2"/></symbol>
<symbol id="ic-refresh" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13.2 7.2a5.3 5.3 0 1 0-.3 3"/><path d="M13.5 2.4V5.5H10.4"/></symbol>
<symbol id="ic-clock" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.5"/></symbol>
<symbol id="ic-shield" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5 13 3.4v4c0 3.4-2.1 5.7-5 7-2.9-1.3-5-3.6-5-7v-4z"/><path d="M5.6 8 7.4 9.8 10.5 6.2"/></symbol>
<symbol id="ic-menu" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/></symbol>
<symbol id="ic-close" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></symbol>
<symbol id="ic-home" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.3 8 2.8l5.5 4.5V13a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8z"/><path d="M6.4 13.8V9.4h3.2v4.4"/></symbol>
<symbol id="ic-cube" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.9 13.6 5v6L8 14.1 2.4 11V5z"/><path d="M2.4 5 8 8.1 13.6 5M8 8.1V14.1"/></symbol>
<symbol id="ic-book" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.6C6.5 2.5 4 2.5 2.5 3.1v9.4C4 11.9 6.5 11.9 8 13c1.5-1.1 4-1.1 5.5-.5V3.1C12 2.5 9.5 2.5 8 3.6z"/><path d="M8 3.6v9.4"/></symbol>
<symbol id="ic-grid" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="2.3" y="2.3" width="4.6" height="4.6" rx="1"/><rect x="9.1" y="2.3" width="4.6" height="4.6" rx="1"/><rect x="2.3" y="9.1" width="4.6" height="4.6" rx="1"/><rect x="9.1" y="9.1" width="4.6" height="4.6" rx="1"/></symbol>
<symbol id="ic-rocket" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.6 11.4 6 7.8c.3-3.6 2.2-5.6 5.6-6.2.6 3.4-.4 5.7-3 7.4z"/><path d="M6 8.2C4 8.6 3 11 3 13c2 0 4.4-1 4.8-3"/><circle cx="9.8" cy="6.2" r="1"/></symbol>
<symbol id="ic-cap" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.8 1.6 5.8 8 8.8l6.4-3z"/><path d="M4.4 7.4v3.1c0 1 1.6 1.9 3.6 1.9s3.6-.9 3.6-1.9V7.4M14.4 5.8v3.4"/></symbol>
<symbol id="ic-trophy" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 2.6h5.6v3.2a2.8 2.8 0 0 1-5.6 0z"/><path d="M5.2 3.4H3.4a1.2 1.2 0 0 0 0 2.4h1.5M10.8 3.4h1.8a1.2 1.2 0 0 1 0 2.4h-1.5"/><path d="M8 8.2v2.2M5.9 13.4h4.2M6.6 10.4h2.8v3h-2.8z"/></symbol>
<symbol id="ic-spark" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.6l1.5 4.9 4.9 1.5-4.9 1.5L8 14.4l-1.5-4.9L1.6 8l4.9-1.5z"/></symbol>
</defs></svg>`;
const IC = (id) => `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;

// The page header that every generated page shares: breadcrumbs, title, an optional subtitle (the lede) and optional
// extra markup, centred by the model-hero class. The provider page passes cls 'prov-hero' and puts its badges after
// the title and its buttons in extra. The home page (hand-written) has its own hero.
const pageHero = ({ crumbs, h1, lede = '', afterTitle = '', extra = '', cls = 'model-hero' }) =>
  `<section class="page-hero ${cls}"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav><h1>${h1}</h1>${afterTitle}${lede ? `<p class="lede">${lede}</p>` : ''}${extra}</div></section>`;

// The primary menu, shared by every generated page; site/index.html carries the same markup by hand (the test
// "header menu" in build.test.mjs keeps the two equal). Providers is a disclosure (<details>) holding the explorer and
// The Best, so the six entries fit one desktop row; Submit is the secondary Contribute button next to the menu.
const primaryNav = (p) => `<nav class="nav" id="primary-nav" aria-label="Primary">` +
  `<details class="nav-group"><summary>Providers</summary><div class="nav-sub"><a href="${p}#explorer">All providers</a>` +
  `<a href="${p}find/">Find my free API</a>` +
  `<a class="nav-best" href="${p}best/" title="The top 10 by score, recomputed from the data at every build">${IC('ic-spark')}The Best</a></div></details>` +
  `<a href="${p}models/">Models</a><a href="${p}compare/">Compare</a><a href="${p}changes/">Changes</a><a href="${p}api/">API</a>` +
  `<a href="${p}guides-and-collections/">Guides</a></nav>`;
const contributeBtn = (p) => `<a class="icon-btn nav-contribute" href="${p}submit/">${IC('ic-rocket')}<span class="nc-label">Contribute</span></a>`;

const siteHeader = (p) => `<header class="site-header"><div class="wrap header-inner">
<a class="brand" href="${p}" aria-label="Free LLM API Hub — home"><svg class="logo-mark"><use href="#logo"/></svg><span class="brand-name">Free LLM API <span class="grad">Hub</span></span></a>
${primaryNav(p)}
<div class="header-actions">
${contributeBtn(p)}
<button class="icon-btn nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false" aria-controls="primary-nav"><svg class="i menu" aria-hidden="true"><use href="#ic-menu"/></svg><svg class="i close" aria-hidden="true"><use href="#ic-close"/></svg></button>
<a class="icon-btn" href="${REPO}" target="_blank" rel="noopener"><span class="sr-only">Star on GitHub</span>${GH_ICON}<span class="star-count" data-stars>★</span></a>
<button class="icon-btn theme-toggle" id="themeToggle" aria-label="Toggle light and dark theme" title="Toggle theme"><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg></button>
</div></div></header>`;

const siteFooter = (p) => `<footer class="site-footer"><div class="wrap footer-top">
<div class="footer-brand"><a class="foot-brand-link" href="${p}" aria-label="Free LLM API Hub — home"><svg class="logo-mark"><use href="#logo"/></svg><span class="brand-name">Free LLM API <span class="grad">Hub</span></span></a><p>The <strong>continuously-verified</strong>, <strong>machine-readable</strong> dataset of <strong>free LLM &amp; AI-model APIs</strong> and <strong>trial credits</strong> — every entry <strong>dated</strong>, <strong>sourced</strong>, and <strong>free of dead links</strong>.</p><img class="trust-badge" src="${p}badge-verified.svg" alt="Verified providers" width="${BADGE_W}" height="20" loading="lazy"><a class="star-btn" href="${REPO}" target="_blank" rel="noopener"><span class="sb-label">${GH_ICON} Star on GitHub</span><span class="sb-count" data-stars>★</span></a></div>
<div class="footer-col"><h2 class="footer-h">Explore</h2><a href="${p}models/">Free model index</a><a href="${p}guides-and-collections/">Guides &amp; collections</a><a href="${p}programs/startups">Startup credits</a><a href="${p}programs/research">Student &amp; research credits</a><a href="${p}free-gpu/">Free GPU compute</a><a href="${p}coding-tools/">Free AI coding tools</a><a href="${p}not-free/">Not free (and why)</a></div>
<div class="footer-col"><h2 class="footer-h">Data</h2><a href="${p}providers.json">providers.json</a><a href="${p}api/">JSON API</a><a href="${p}llms.txt">llms.txt</a><a href="${p}data-policy/">Who trains on your data</a><a href="${p}coverage/">Data coverage</a><a href="${p}quality/">Data quality</a><a href="${p}embed/">Use the data</a></div>
<div class="footer-col"><h2 class="footer-h">Project</h2><a href="${p}updates">Updates</a><a href="${p}changes/">What changed</a><a href="${p}submit/">Submit</a><a href="${p}methodology/">Methodology</a><a href="${p}contributing/">Contributing</a><a href="${p}agreements/">Agreements</a></div>
</div><div class="wrap footer-bottom"><p>Terms change without notice; always confirm against each provider's own docs. MIT licensed.</p><p class="foot-legal"><a href="${p}legal/privacy">Privacy</a> · <a href="${p}legal/terms">Terms</a></p><p class="foot-email"><a href="mailto:admin@freellmapihub.com">admin@freellmapihub.com</a></p></div></footer>`;

// Full page wrapper for generated (collection) pages. `p` is the path prefix to the site root.
// Theme guard — runs before first paint to avoid the white flash. ONE source, shared by
// htmlPage() (every generated page) and site/index.html (injected via AUTOGEN:themeguard).
const THEME_GUARD = `<script>(function(){try{var t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>`;

// Content-Security-Policy (all pages, injected into index.html via AUTOGEN:csp and hard-copied
// in 404.html). script-src pins our two inline scripts by hash — the theme guard (every page)
// and the path read-out (404.html only) — so no other inline or injected script can run;
// everything else is 'self' (site.js, explorer.js, shared-rules.js, widget.js). connect-src
// allows explorer.js's data fallback (raw.githubusercontent).
// No default-src/style-src on purpose: inline style="" attributes and the 404 <style> stay valid.
// If you edit THEME_GUARD or 404.html's inline scripts, recompute these hashes or the page breaks silently.
// Google Analytics (lib/analytics.mjs) adds its hosts here ONLY when GA_MEASUREMENT_ID is set at build time; its banner is
// the first-party file consent.js ('self'), so no inline hash changes.
const GA_ID = measurementId();
const GA_CSP = analyticsCspSources(GA_ID);
const CSP = `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'sha256-r3FnVnP9W/uaNhK9XkZqH3GIfK4TudOQGYTwoNIjGR4=' 'sha256-YzEhxvq2BwovGsg/RCjKkQdwf+LZmTjIkiQcjXCZMHc='${CF_WA_CSP.script}${GA_CSP.script}; connect-src 'self' https://raw.githubusercontent.com${CF_WA_CSP.connect}${GA_CSP.connect}; object-src 'none'; base-uri 'self'">`;

// Search engines cut a snippet around 155 characters. Every page's description goes through
// here, so no page can ship a longer one: cut at a word boundary and end with an ellipsis.
const META_DESC_MAX = 155;
const fitDescription = (s) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= META_DESC_MAX) return t;
  const cut = t.slice(0, META_DESC_MAX - 1);
  return cut.slice(0, cut.lastIndexOf(' ') > 80 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,;:.\-–—]+$/, '') + '…';
};

// Star count resolved at build from data/repo-stats.json (never fetched here: the build stays offline and
// deterministic). The deploy workflow runs scripts/refresh-stars.mjs just before the build, every day and on
// every push; by hand, `npm run stars` does the same. No page script asks GitHub: the number is only as
// fresh as the last deploy.
let STARS = null;
try {
  const stats = JSON.parse(readFileSync(join(ROOT, 'data/repo-stats.json'), 'utf8'));
  if (Number.isInteger(stats.stars) && stats.stars >= 0) STARS = stats.stars.toLocaleString('en-US');
} catch { /* no stats file: the placeholder stays */ }
const withStars = (html) => (STARS ? html.replace(/(data-stars>)[^<]*(<)/g, `$1${STARS}$2`) : html);

function htmlPage(args) { return withAnalytics(markNewTabLinks(labelTables(withStars(htmlPageRaw(args)))), GA_ID, args.prefix ?? '../'); }

// Landmarks. A page hero emitted right before <main> moves inside it, so the skip link lands on the page's h1 and the
// main landmark carries the page title (styles.css drops main's top padding when the hero leads it). Every nav.colls gets
// an accessible name: the h2 just before it when there is one, else "Collections".
function landmarkFixes(main) {
  const withHero = main.replace(/^(\s*)(<section class="page-hero[^"]*">[\s\S]*?<\/section>)\s*(<main id="main"[^>]*>)/, (_m, ws, hero, open) => `${ws}${open}${hero}`);
  return withHero
    .replace(/(<h2>([^<]+)<\/h2>)(<nav|<div) class="colls">/g, (_m, h2, text, tag) => (tag === '<nav' ? `${h2}<nav class="colls" aria-label="${text}">` : `${h2}<div class="colls">`))
    .replace(/<nav class="colls">/g, '<nav class="colls" aria-label="Collections">');
}
// The weekly change feed is the one a reader subscribes to (field-level changes, not commit titles), so every page
// advertises it: a feed reader looking for <link rel="alternate"> finds it wherever the visitor is.
const CHANGES_FEED_TITLE = 'Free LLM API Hub — what changed, week by week';
function htmlPageRaw({ title, desc, canonical, main, jsonld, prefix = '../', noindex = false, ogImage = `${SITE}/og.png`, feeds = [], scripts = [], styles = [] }) {
  // jsonld carries provider names straight from the dataset; writing "<" as
  // the JSON unicode escape (backslash-u-003c) keeps a "</script>" in the
  // data from ever closing the block.
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEsc(title)}</title>
<meta name="description" content="${htmlEsc(fitDescription(desc))}">${noindex ? `\n<meta name="robots" content="${noindex === true ? 'noindex' : htmlEsc(noindex)}">` : ''}
${CSP}
${THEME_GUARD}
${canonical ? `<link rel="canonical" href="${htmlEsc(canonical)}">
` : ''}<link rel="icon" href="${prefix}favicon.ico" sizes="32x32">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${prefix}favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${prefix}apple-touch-icon.png">
<link rel="manifest" href="${prefix}site.webmanifest">
${fontHead(prefix)}
<meta name="theme-color" content="#0a0d0b">
<meta name="color-scheme" content="dark light">
<meta property="og:title" content="${htmlEsc(title)}">
<meta property="og:description" content="${htmlEsc(fitDescription(desc))}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Free LLM API Hub">
${canonical ? `<meta property="og:url" content="${htmlEsc(canonical)}">
` : ''}<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${htmlEsc(title)}">
<meta name="twitter:description" content="${htmlEsc(fitDescription(desc))}">
<meta name="twitter:image" content="${ogImage}">
<link rel="alternate" type="application/rss+xml" title="Free LLM API Hub — updates" href="${prefix}feed.xml">
<link rel="alternate" type="application/rss+xml" title="${htmlEsc(CHANGES_FEED_TITLE)}" href="${prefix}changes.xml">
${feeds.map((f) => `<link rel="alternate" type="application/rss+xml" title="${htmlEsc(f.title)}" href="${prefix}${f.href}">\n`).join('')}<link rel="stylesheet" href="${prefix}styles.css">
${styles.map((s) => `<link rel="stylesheet" href="${prefix}${s}">\n`).join('')}${jsonld ? `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${SPRITE}
${siteHeader(prefix)}
${landmarkFixes(main)}
${siteFooter(prefix)}
<script src="${prefix}site.js"></script>
${scripts.map((src) => `<script src="${prefix}${src}" defer></script>\n`).join('')}</body>
</html>
`;
}

// ---------- inject into README ----------
function inject(md, name, content) {
  const re = new RegExp(
    `(<!-- AUTOGEN:${name}:start -->)([\\s\\S]*?)(<!-- AUTOGEN:${name}:end -->)`
  );
  if (!re.test(md)) throw new Error(`Missing AUTOGEN markers for "${name}" in README.md`);
  // Use a replacement FUNCTION: the injected content contains literal '$1', '$0 cost', etc.
  // which String.replace would otherwise interpret as capture-group references.
  return md.replace(re, (_m, start, _mid, end) => `${start}\n${content}\n${end}`);
}

const BLURB = {
  'no-credit-card': 'start without a payment method',
  'no-phone': 'no SMS/phone verification',
  'anonymous-access': 'call the API with no account at all',
  'commercial-use': 'safe to ship, not eval-only',
  'openai-compatible': 'drop-in OpenAI SDK swap',
  'always-free': '$0 models, no trial clock',
  'multimodal': 'vision, audio, embeddings',
  'no-training': 'says it does not train on your prompts (some only without opt-in)',
  'renewing-free-tier': 'free quotas or credits that reset',
  'free-signup-credit': 'one-time signup credits, not renewing allowances',
};
const collectionsIndexMd = COLLECTIONS.map((c) => {
  const n = collRows(c).length;
  return `- **[${c.title}](collections/${c.slug}.md)** (${n}) — ${BLURB[c.slug]} · [live page ↗](${SITE}/collections/${c.slug})`;
}).join('\n');

// "What's covered" — modality breakdown, generated from the data so it never goes stale.
const MODALITY_LABELS = {
  text: 'Text / LLM', audio: 'Speech (STT / TTS)', image: 'Image generation',
  vision: 'Vision', embeddings: 'Embeddings', rerank: 'Rerank', ocr: 'OCR / documents',
};
const coverageRows = Object.entries(MODALITY_LABELS)
  .map(([m, label]) => {
    const ps = providers.filter((p) => (p.modalities || []).includes(m));
    return { label, count: ps.length, ex: ps.slice(0, 3).map((p) => p.name.replace(/\s*\(.*\)/, '')) };
  })
  .filter((r) => r.count > 0)
  .sort((a, b) => b.count - a.count);
const coverageTable =
  '| Category | Providers | Examples |\n|---|---|---|\n' +
  coverageRows.map((r) => `| **${r.label}** | ${r.count} | ${r.ex.join(', ')} |`).join('\n');

// ---------- editorial /best (data/best.json) ----------
// Parsed once, up front, so the README table and the /best page render from the
// same validated list. data/best.json declares the order and the "why" for each
// pick. The integrity rules (non-empty list, unique slugs, editorial why + tag,
// slug resolves, provider is verified) live in lib/best.mjs and are shared with
// validate.mjs, check-best.mjs and best.test.mjs, so `npm run build` alone fails
// on an unverified pick exactly like CI does (#165). Edit data/best.json to re-rank.
const BEST = JSON.parse(readFileSync(join(ROOT, 'data/best.json'), 'utf8'));
BEST.desc = expandFigures(BEST.desc, FIGS);
BEST.intro = expandFigures(BEST.intro, FIGS);
const bestEntries = resolveBestEntries(BEST, providers);
// The /best top 10, the README table and /api/v1/best.json come from the score (lib/score.mjs), computed
// from the data on every build at the dataset's own date, so the output is reproducible. It is never padded.
// data/sponsorships.json: read by /agreements/ and the provider-page disclosure only (see lib/agreements.mjs).
const AGREEMENTS_FILE = JSON.parse(readFileSync(join(ROOT, 'data/sponsorships.json'), 'utf8'));
const EDITORIAL = JSON.parse(readFileSync(join(ROOT, 'data/editorial.json'), 'utf8'));
const PROBE_REPORT = JSON.parse(readFileSync(join(ROOT, 'data/probe-report.json'), 'utf8'));
const topList = topEntries(providers, { editorial: EDITORIAL, probeReport: PROBE_REPORT, now: new Date(ASOF + 'T12:00:00Z') });
// The score of every eligible provider, for the /compare/ tables (static pages and the browser view).
const rankedAll = rankProviders(providers, { editorial: EDITORIAL, probeReport: PROBE_REPORT, now: new Date(ASOF + 'T12:00:00Z'), minConfirmed: 0 });
const scoreMap = Object.fromEntries(rankedAll
  .map((r) => [r.slug, { total: Math.round(r.total * 10) / 10, confirmed: r.confirmed, of: r.of, rank: topList.find((e) => e.p.slug === r.slug)?.rank ?? null }]));
// A provider page's place among every scored provider ("#1 of 69") and its editorial points (Q13). Kept apart from
// scoreMap, which is published as site/scores.json with its own shape.
const scorePlace = new Map(rankedAll.map((r, i) => [r.slug, { position: i + 1, editorial: r.editorial }]));
// Static /compare/<a>-vs-<b>/ pages (#175): the picks of data/best.json compared pairwise
// where they share a modality, capped (see lib/compare.mjs). Computed up front
// so the provider pages can link to the comparisons they appear in.
const comparePairs = compareLib.selectComparePairs(bestEntries.map((e) => e.p));
// Only same-category pairs are suggested (links); every pair keeps its page and sitemap entry.
const suggestedPairs = comparePairs.filter((cp) => compareLib.sameComparisonCategory(cp.a, cp.b));
const COMPARE_PATHS = new Set(comparePairs.map((cp) => cp.path));

// "Notably NOT free": one source (data/not-free.json) for the README section and the /not-free/ page.
const NOT_FREE = JSON.parse(readFileSync(join(ROOT, 'data/not-free.json'), 'utf8'));
const QUOTES = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8')).entries;
{
  const errs = notFreeErrors(NOT_FREE, { providers, quotes: QUOTES });
  if (errs.length) throw new Error('data/not-free.json:\n' + errs.join('\n'));
}

let readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
readme = inject(readme, 'not-free', notFreeReadmeMd(NOT_FREE, { site: SITE }));
readme = inject(readme, 'coverage', coverageTable);
readme = inject(readme, 'collections', collectionsIndexMd);
readme = inject(readme, 'best', bestTable(topList));
readme = injectInlineFigures(readme, FIGS);
{
  const stale = figureErrors(readme, FIGS, 'README.md');
  if (stale.length) throw new Error(stale.join('\n'));
}

writeFileSync(join(ROOT, 'README.md'), readme);

// The field reference follows the schema, without hand-maintained descriptions.
writeSchemaDocs();

// Counts in the field reference follow the data, just like README tables.
const dimensionsPath = join(ROOT, 'docs/comparison-dimensions.md');
const gapCounts = ['phone_required', 'commercial_ok', 'card_required']
  .map((key) => `\`${key}\` ${providers.filter((p) => p[key] === null).length}/${providers.length}`)
  .join(', ');
const dimensions = readFileSync(dimensionsPath, 'utf8');
if (!dimensions.includes('<!-- AUTOGEN:flag-gaps:start -->') || !dimensions.includes('<!-- AUTOGEN:flag-gaps:end -->')) {
  throw new Error('Missing flag-gaps markers in docs/comparison-dimensions.md');
}
writeFileSync(dimensionsPath, dimensions.replace(
  /(<!-- AUTOGEN:flag-gaps:start -->)[\s\S]*?(<!-- AUTOGEN:flag-gaps:end -->)/,
  `$1\nCurrent gaps: ${gapCounts}.\n$2`,
));

// ---------- keep CITATION.cff pinned to the dataset it describes ----------
// The citation metadata is derived, not hand-maintained: it drifted to 2.3.0
// while the dataset shipped 2.6.0. Same rule as everything else here.
const citationPath = join(ROOT, 'CITATION.cff');
const citation = readFileSync(citationPath, 'utf8')
  .replace(/^version: .*$/m, `version: "${data.version}"`)
  .replace(/^date-released: .*$/m, `date-released: "${data.generated}"`);
writeFileSync(citationPath, citation);

// Long-form guides (lib/long-guides.mjs): editorial copy whose every number, limit, flag and provider list is computed
// from data/providers.json and data/not-free.json here, at build time. They share /guides/, the hub, the sitemap and
// llms.txt with the guides above; `featured` is the set of providers a guide lists (provider pages link back to it).
const LONG_GUIDE_PAGES = LONG_GUIDES.map((g) => ({ ...g, ...longGuidePage(g, { providers, notFree: NOT_FREE }) }));
// Every guide by slug, for the cross-links of collections and the "More guides" lists.
const ALL_GUIDE_LINKS = [...GUIDES, ...LONG_GUIDE_PAGES].map((g) => ({ slug: g.slug, card: g.card }));

// ---------- git-mined change history (computed once) ----------
// Feeds the per-provider pages and api/v1/history.json (both git-mined and
// regenerated on deploy). Graceful if git is unavailable (tarball build).
// The month-end snapshots (last committed revision per month) feed the monthly
// /state/ reports; the field-level before/after values in each 'changed' event
// feed the weekly change feed (/changes/, changes.xml, api/v1/changes.json).
const { historyBySlug, monthEnd: monthEndSnapshots } = mineHistoryAndSnapshots({ cwd: ROOT });

// ---------- server-render the homepage explorer (SEO + no-JS + instant paint) ----------
// Row markup lives in lib/rows.mjs — the SAME function the client loads as
// shared-rows.js — so the server render and the browser repaint can never
// diverge. The build passes ASOF (derived from the committed data, never the clock) so the
// render is deterministic and the drift gate never trips on a calendar boundary.
const homeRows = [...providers]
  .sort((a, b) => sortLib.comparator('recommended', 1, a, b))
  .map((p) => rows.explorerRowHtml(p, { now: ASOF }))
  .join('\n');

// Emit the browser's copy of the shared rules (recScore + FLAG_PAIRS +
// freshnessStatus) straight from the one source in scripts/lib/rules.mjs, so the
// client explorer never keeps its own and can never drift from this server render.
// The constants are declared inside the closure because the serialised
// functions reference them by name (freeTypeRank reads FREE_TYPE_RANK,
// freshnessStatus reads SLA_DAYS): as bare object properties they were not in
// scope, so every client repaint threw a ReferenceError (same closure pattern
// as shared-rows.js / shared-sort.js).
const sharedRulesJs = `// AUTO-GENERATED by scripts/build.mjs from scripts/lib/rules.mjs — do not edit.
window.FLLM_RULES = (function () {
  const FREE_TYPE_RANK = ${JSON.stringify(FREE_TYPE_RANK)};
  const FLAG_PAIRS = ${JSON.stringify(FLAG_PAIRS)};
  const SLA_DAYS = ${SLA_DAYS};
  const DUE_SOON_DAYS = ${DUE_SOON_DAYS};
  const recScore = ${recScore.toString()};
  const freeTypeRank = ${freeTypeRank.toString()};
  const intentRank = ${intentRank.toString()};
  const recommendedCmp = ${recommendedCmp.toString()};
  const freshnessStatus = ${freshnessStatus.toString()};
  return { recScore, intentRank, recommendedCmp, FREE_TYPE_RANK, freeTypeRank, FLAG_PAIRS, SLA_DAYS, DUE_SOON_DAYS, freshnessStatus };
})();
`;
writeFileSync(join(ROOT, 'site/shared-rules.js'), sharedRulesJs);

// Emit the shared row renderer (htmlEsc / ICON / SLUG_RE / rowHtml) so the
// client explorer repaints with the exact same markup the server shipped.
// The string comes from lib/rows.mjs itself (rows.clientBundle), so the code the
// build writes and the code explorer.test.mjs executes are the same string.
writeFileSync(join(ROOT, 'site/shared-rows.js'), rows.clientBundle());
// The sort comparator the browser runs — serialised from lib/sort.mjs so
// explorer.js and explorer.test.mjs execute the same code (same contract as
// shared-rules.js / shared-rows.js).
writeFileSync(join(ROOT, 'site/shared-sort.js'), sortLib.clientBundle());
// env_key is operational (which secret to use) — strip it from anything public.
const publicProviders = providers.map(({ env_key, ...rest }) => rest);
// The home page inlines only the fields the explorer reads (search, filters, sort, rows and stats: site/explorer.js,
// lib/rows.mjs, lib/sort.mjs, lib/rules.mjs). The full record stays in /providers.json and /api/v1/, which the explorer
// falls back to if the inline data is missing. data_policy is reduced to trains_on_prompts, the one part the filter reads.
const HOME_FIELDS = ['slug', 'name', 'category', 'free_type', 'free_tier', 'notes', 'best_for', 'verified', 'last_verified', 'added',
  'card_required', 'phone_required', 'commercial_ok', 'commercial_ok_condition', 'openai_compatible', 'is_text_llm', 'modalities',
  'models_free', 'expires', 'model_tier'];
const homeProvider = (p) => {
  const out = {};
  for (const k of HOME_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  const fl = p.free_limits || {};
  const caps = {};
  if (Number.isInteger(fl.requests_per_day)) caps.requests_per_day = fl.requests_per_day;
  if (Number.isInteger(fl.tokens_per_day)) caps.tokens_per_day = fl.tokens_per_day;
  if (Object.keys(caps).length) out.free_limits = caps;
  if (p.data_policy && p.data_policy.trains_on_prompts !== undefined) out.data_policy = { trains_on_prompts: p.data_policy.trains_on_prompts };
  return out;
};
// One provider per line: a data change rewrites only its own provider's line, so two pull requests that edit different
// providers do not both rewrite one long line of this page. "asof" is the date the server rows and stat tiles are rendered
// for (ASOF), so explorer.js keeps them on first paint and only replaces what the visitor's clock changes.
const inlineData = `<script type="application/json" id="providers-data">{"asof":"${ASOF}",\n"providers":[\n${publicProviders.map((p) => JSON.stringify(homeProvider(p))).join(',\n').replace(/</g, '\\u003c')}\n]}</script>`;
// The counters row is rendered here too, dated by ASOF (deterministic), so it shows without JavaScript and without a
// layout shift; explorer.js repaints it with the visitor's clock. Same markup as statsHtml() in explorer.js.
const STAT_STATUS_WORD = { fresh: 'fresh', due: 'due for re-check', stale: 'stale' };
const homeStatsHtml = (() => {
  const genMs = Date.parse(ASOF + 'T00:00:00Z');
  const ages = providers.filter((p) => p.verified && p.last_verified).map((p) => Math.floor((genMs - Date.parse(p.last_verified + 'T00:00:00Z')) / 86400000));
  const oldest = ages.length ? Math.max(...ages) : 0;
  const status = freshnessStatus(oldest);
  const recheck = oldest <= 0 ? 'Re-checked today' : oldest === 1 ? 'Re-checked within the last day' : `Re-checked within the last ${oldest} days`;
  return [
    `<strong>${providers.length}</strong> providers tracked`,
    `<strong>${providers.filter((p) => p.category === 'ongoing').length}</strong> ongoing free tiers`,
    `<strong>${providers.filter((p) => p.category === 'trial').length}</strong> trial credits`,
    `<span class="st-fresh ${status}" title="Every verified entry is due for a re-check ${SLA_DAYS} days after its date">${recheck}<span class="sr-only"> (${STAT_STATUS_WORD[status] || status})</span></span>`,
  ].join('<span class="st-sep" aria-hidden="true"> · </span>');
})();
let indexHtml = readFileSync(join(ROOT, 'site/index.html'), 'utf8');
// The home title carries the dataset month and the verified count (Q10); og:title and twitter:title repeat it. The
// build rewrites it on every run, so the number follows the data. It is worded "free tiers & credits" (ongoing tiers
// and trial credits are both counted), which is also not the "N verified providers" phrasing that lib/figures.mjs
// guards in hand-written sources: validate.mjs reads site/index.html before the build has rewritten it.
const HOME_TITLE = `Free LLM APIs (${TITLE_MONTH}): ${providers.filter((p) => p.verified === true).length} verified free tiers & credits, sourced & dated`;
indexHtml = indexHtml.replace(/<title>[^<]*<\/title>/, `<title>${htmlEsc(HOME_TITLE)}</title>`)
  .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${htmlEsc(HOME_TITLE)}">`)
  .replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${htmlEsc(HOME_TITLE)}">`);
indexHtml = inject(indexHtml, 'csp', CSP);
indexHtml = inject(indexHtml, 'themeguard', THEME_GUARD);
indexHtml = inject(indexHtml, 'fonts', fontHead(''));
indexHtml = inject(indexHtml, 'rows', homeRows);
indexHtml = inject(indexHtml, 'stats', homeStatsHtml);
// The "New here?" strip above the explorer: what the list is, what verified means, how to use it (lib/home-first-use.mjs).
indexHtml = inject(indexHtml, 'firstuse', firstUseHtml(providers, { slaDays: SLA_DAYS }));
indexHtml = inject(indexHtml, 'data', inlineData);
// The schema.org Dataset block (Google Dataset Search), from CITATION.cff and the data: lib/dataset-jsonld.mjs.
indexHtml = inject(indexHtml, 'dataset', datasetJsonLdScript(homeJsonLd({ data, citation: parseCitation(readFileSync(join(ROOT, 'CITATION.cff'), 'utf8')), site: SITE, asOf: ASOF })));
indexHtml = withStars(indexHtml).replace(/(<img class="trust-badge"[^>]*? width=")\d+(")/, `$1${BADGE_W}$2`);
writeFileSync(join(ROOT, 'site/index.html'), withAnalytics(indexHtml, GA_ID, ''));
// The consent banner exists only when analytics is configured; without an ID a stale copy is removed.
{
  const consentPath = join(ROOT, 'site/consent.js');
  const consentJs = consentScript(GA_ID);
  if (consentJs) writeFileSync(consentPath, consentJs);
  else rmSync(consentPath, { force: true });
}

// ---------- badge ----------
// Graded on the oldest verified entry (see freshnessBadge in lib/rules.mjs):
// the share-inside-the-SLA number it replaced could not reach amber or red
// without months of total silence, so it reported liveness, not freshness.
const { badge, oldest: oldestAge, median: medianAge } = freshnessBadge(providers, today);
const color = badge.color;
// Served by the site (https://freellmapihub.com/badge-freshness.json), rebuilt by every deploy including the daily one, and
// gitignored: a file that moves with the calendar is not committed, so no pull request carries it.
writeFileSync(join(ROOT, 'site/badge-freshness.json'), JSON.stringify(badge, null, 2) + '\n');

// badge-verified.json — live shields.io endpoint badge for the companion doc
// (docs/credit-programs.md). Deterministic per dataset snapshot (NOT date-relative
// like badge-freshness.json), so it IS a diff-gate target: the doc links the endpoint,
// never a hardcoded count, so the number can't go stale between build passes.
// One object, two homes: the repo root (raw.githubusercontent badge in the docs)
// and site/ (hero badge served from this domain) — same content, same build pass,
// so the two copies can never drift.
writeFileSync(join(ROOT, 'badge-verified.json'), JSON.stringify(badgeVerified, null, 2) + '\n');
writeFileSync(join(ROOT, 'site/badge-verified.json'), JSON.stringify(badgeVerified, null, 2) + '\n');
// The footer badge is this SVG, served by the site itself: no page asks a third party for it (see the privacy page).
const verifiedBadge = badgeSvg(badgeVerified);
writeFileSync(join(ROOT, 'site/badge-verified.svg'), verifiedBadge.svg);

// ---------- ship data with the site ----------
mkdirSync(join(ROOT, 'site'), { recursive: true });
writeFileSync(join(ROOT, 'site/providers.json'), JSON.stringify({ ...data, providers: publicProviders }, null, 2) + '\n');
writeFileSync(join(ROOT, 'site/providers.csv'), providersCsv({ version: data.version, generated: ASOF, providers: publicProviders }));
for (const rel of ['data/providers.csv', 'data/providers.yaml', 'site/providers.yaml']) {
  rmSync(join(ROOT, rel), { force: true });
}

// ---------- generate collection pages (repo markdown + live HTML) ----------
// These directories contain only generated pages; retired slugs must disappear.
rmSync(join(ROOT, 'collections'), { recursive: true, force: true });
rmSync(join(ROOT, 'site/collections'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'collections'), { recursive: true });
mkdirSync(join(ROOT, 'site/collections'), { recursive: true });

const GEN_NOTE = '<!-- Generated from data/providers.json by scripts/build.mjs — do not edit by hand. -->';
const collNavMd = COLLECTIONS.map((c) => `[${c.title}](${c.slug}.md)`).join(' · ');

for (const c of COLLECTIONS) {
  const rows = collRows(c);
  const fill = (t) => t.replaceAll('{n}', String(rows.length)).replaceAll('{total}', String(total)).replaceAll('{date}', ASOF);
  const metaDesc = fill(c.metaDesc);
  const nav = COLLECTIONS.map(
    (o) => `<a href="${o.slug}"${o.slug === c.slug ? ' class="active" aria-current="page"' : ''}>${htmlEsc(o.title)}</a>`
  ).join('');
  const guideLinks = (c.guides || [])
    .map((s) => { const gx = ALL_GUIDE_LINKS.find((x) => x.slug === s); return gx ? `<a href="../guides/${gx.slug}">${htmlEsc(gx.card)}</a>` : ''; })
    .filter(Boolean).join('');
  const collFaqHtml = (c.faq && c.faq.length)
    ? `<h2>FAQ</h2>` + c.faq.map((f) => `<div class="faq-item"><h3>${htmlEsc(f.q)}</h3><p>${f.a}</p></div>`).join('')
    : '';

  // --- repo markdown ---
  const md =
    `${GEN_NOTE}\n\n# ${c.h1}\n\n${c.desc}\n\n` +
    `[← All collections](README.md) · [Interactive explorer ↗](${SITE}/) · [Main list](../README.md)\n\n` +
    `${c.intro}\n\n**${rows.length} of ${total} tracked providers** match.\n\n` +
    `${c.header ? `${c.header}\n\n` : ''}${collectionTableMd(rows, { baseUrl: c.quickstart, rowMark: c.rowMark })}\n\n` +
    (c.quickstart ? `${QUICKSTART_MD}\n` : '') +
    `---\n\nOther collections: ${collNavMd}\n\n` +
    `_Generated from [providers.json](../data/providers.json). Terms change without notice — always confirm against each provider's own docs._\n`;
  writeFileSync(join(ROOT, `collections/${c.slug}.md`), md);

  // --- live HTML page ---
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: c.h1,
        description: metaDesc,
        numberOfItems: rows.length,
        // Same-domain URLs: Google drops list items that point to another site, and each provider has its own page here.
        itemListElement: rows.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: `${SITE}/p/${p.slug}` })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Guides & Collections', item: `${SITE}/guides-and-collections/` },
          { '@type': 'ListItem', position: 3, name: c.title, item: `${SITE}/collections/${c.slug}` },
        ],
      },
      ...(c.faq && c.faq.length ? [{
        '@type': 'FAQPage',
        mainEntity: c.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) },
        })),
      }] : []),
    ],
  });
  const introHtml = htmlEsc(c.intro).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const main =
    pageHero({ crumbs: `<a href="../">Home</a> / <a href="../guides-and-collections/">Guides &amp; Collections</a> / ${htmlEsc(c.title)}`, h1: `${htmlEsc(c.h1)}`, lede: `${htmlEsc(c.desc)}`, extra: `<nav class="colls">${nav}</nav>` }) +
    `<main id="main"><div class="wrap prose">` +
    `<p class="answer"><strong>${htmlEsc(fill(c.answer))}</strong></p>` +
    `<p>${introHtml}</p>` +
    `<p class="count"><strong>${rows.length} of ${total}</strong> tracked providers match.</p>` +
    `${c.header ? `<p>${htmlEsc(c.header)}</p>` : ''}${collectionTableHtml(rows, { baseUrl: c.quickstart, rowMark: c.rowMark })}` +
    (c.quickstart
      ? `<h2>Quickstart — reuse the OpenAI SDK</h2><p class="count">Point <code>base_url</code> at the provider (URLs in the table above) and use its free key. Example: ${htmlEsc(QS_NAME)}.</p><pre><code>${codeHtmlEsc(QS_PYTHON)}</code></pre><pre><code>${codeHtmlEsc(QS_CURL)}</code></pre>`
      : '') +
    collFaqHtml +
    (guideLinks ? `<h2>Related guides</h2><nav class="colls">${guideLinks}</nav>` : '') +
    `</div></main>`;
  writeFileSync(
    join(ROOT, `site/collections/${c.slug}.html`),
    htmlPage({ title: `${c.title} · Free LLM API Hub`, desc: metaDesc, canonical: `${SITE}/collections/${c.slug}`, main, jsonld, ogImage: `${SITE}/og/collections/${c.slug}.png` })
  );
}

// --- collections hub (repo markdown) ---
const hubMd =
  `${GEN_NOTE}\n\n# Collections\n\n` +
  `Curated, always-current slices of the [dataset](../data/providers.json) — each one filters the list by a single constraint a builder actually has. Generated on every change; each has a [live web page](${SITE}/guides-and-collections/).\n\n` +
  COLLECTIONS.map((c) => `- **[${c.title}](${c.slug}.md)** — ${c.desc} _(${collRows(c).length} providers)_`).join('\n') +
  `\n\n[← Back to the main list](../README.md)\n`;
writeFileSync(join(ROOT, 'collections/README.md'), hubMd);

// --- unified Guides & Collections hub (live HTML) ---
const hubCards = COLLECTIONS.map((c) =>
  `<a class="coll-card" href="../collections/${c.slug}"><div class="coll-card-head"><strong>${htmlEsc(c.title)}</strong><span class="count">${collRows(c).length}</span></div><p>${htmlEsc(c.desc)}</p></a>`
).join('');
const guidesCards = GUIDES.map((g) =>
  `<a class="coll-card" href="../guides/${g.slug}"><div class="coll-card-head"><strong>${htmlEsc(g.card)}</strong><span class="count">${providers.filter(g.filter).length}</span></div><p>${htmlEsc(g.blurb)}</p></a>`
).join('');
const longGuideCards = LONG_GUIDE_PAGES.map((g) =>
  `<a class="coll-card" href="../guides/${g.slug}"><div class="coll-card-head"><strong>${htmlEsc(g.card)}</strong><span class="count">${g.count}</span></div><p>${htmlEsc(g.blurb)}</p></a>`
).join('');
const HUB_ANSWER = `Which free LLM API fits your constraint? Each of the ${GUIDES.length} guides answers one “is there a free API for…?” question, and ${LONG_GUIDE_PAGES.length} longer ones walk through a choice; each of the ${COLLECTIONS.length} collections is a live filter of our dated, sourced dataset by one condition: no card, no phone or commercial use.`;
const HUB_META = `${GUIDES.length + LONG_GUIDE_PAGES.length} guides and ${COLLECTIONS.length} collections of free LLM APIs, filtered from a dated dataset: no card, no phone, commercial use, OpenAI-compatible.`;
const HUB_FAQ = [
  { q: 'What is the difference between a guide and a collection?', a: 'A guide answers one question with a short explanation and a table; a collection is a live filter of the dataset by one condition, with no commentary.' },
  { q: 'How current is the data?', a: 'Every row shows the day its source was read. The dataset is re-verified on a schedule, and each provider page cites its source.' },
  { q: 'Can I use these lists in my own project?', a: 'The dataset and the code are published under the MIT licence. Each provider’s own terms still apply to its API.' },
];
const hubMain =
  pageHero({ crumbs: `<a href="../">Home</a> / Guides &amp; Collections`, h1: `Guides &amp; Collections`, lede: `Short, data-backed answers to the most common “is there a free API for…” questions, plus curated slices of the dataset by a single constraint — every card generated from the verified dataset so it stays current.` }) +
  `<main id="main"><div class="wrap">` +
  `<p class="answer"><strong>${htmlEsc(HUB_ANSWER)}</strong></p>` +
  `<p class="hub-find">Several constraints at once? <a href="../find/">Find my free API</a>: answer six quick questions and get a ranked shortlist.</p>` +
  `<h2 class="eyebrow">Guides: answers to one question</h2><div class="coll-grid">${guidesCards}</div>` +
  `<h2 class="eyebrow" style="margin-top:26px">Guides: how to choose</h2><div class="coll-grid">${longGuideCards}</div>` +
  `<h2 class="eyebrow" style="margin-top:26px">Collections: one filter, live</h2><div class="coll-grid">${hubCards}</div>` +
  `<h2 class="eyebrow" style="margin-top:26px">FAQ</h2>` + HUB_FAQ.map((f) => `<div class="faq-item"><h3>${htmlEsc(f.q)}</h3><p>${htmlEsc(f.a)}</p></div>`).join('') +
  `</div></main>`;
const hubJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage', name: 'Free LLM API guides and collections', description: HUB_META,
      url: `${SITE}/guides-and-collections/`, dateModified: ASOF,
      isPartOf: websiteRef(SITE),
      mainEntity: {
        '@type': 'ItemList', numberOfItems: GUIDES.length + COLLECTIONS.length,
        itemListElement: [
          ...GUIDES.map((g) => ({ name: g.card, url: `${SITE}/guides/${g.slug}` })),
          ...LONG_GUIDE_PAGES.map((g) => ({ name: g.card, url: `${SITE}/guides/${g.slug}` })),
          ...COLLECTIONS.map((c) => ({ name: c.title, url: `${SITE}/collections/${c.slug}` })),
        ].map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e.name, url: e.url })),
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides & Collections', item: `${SITE}/guides-and-collections/` },
      ],
    },
    { '@type': 'FAQPage', mainEntity: HUB_FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
  ],
});
mkdirSync(join(ROOT, 'site/guides-and-collections'), { recursive: true });
writeFileSync(
  join(ROOT, 'site/guides-and-collections/index.html'),
  htmlPage({ title: 'Free LLM API guides and collections · Free LLM API Hub', desc: HUB_META, canonical: `${SITE}/guides-and-collections/`, main: hubMain, jsonld: hubJsonLd })
);
// The old hubs redirect here so existing links and bookmarks keep working.
const redirectPage = (to) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${new URL(to, SITE + '/x/').href.replace(/#.*$/, '')}"><title>Redirecting…</title></head><body><p>Moved to <a href="${to}">${to}</a>.</p></body></html>`;
// Clear generated guides before writing their redirect and current pages.
rmSync(join(ROOT, 'site/guides'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'site/guides'), { recursive: true });
mkdirSync(join(ROOT, 'site/collections'), { recursive: true });
writeFileSync(join(ROOT, 'site/guides/index.html'), redirectPage('../guides-and-collections/'));
writeFileSync(join(ROOT, 'site/collections/index.html'), redirectPage('../guides-and-collections/'));

// ---------- per-provider detail pages + embeddable badges ----------
// Both directories are generated whole and gitignored: start them empty so a
// provider removed from the dataset leaves no stale page or badge behind.
rmSync(join(ROOT, 'site/p'), { recursive: true, force: true });
rmSync(join(ROOT, 'site/badges'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'site/p'), { recursive: true });
mkdirSync(join(ROOT, 'site/badges'), { recursive: true });

// Per-provider change history, mined from the git log of data/providers.json.
// The miner lives in lib/history.mjs so CI can validate it directly without a
// full build (scripts/check-history.mjs + build.test.mjs). historyBySlug is
// computed once up front; the provider pages and api/v1/history.json read it.
const historyHtml = (slug) => {
  const all = historyBySlug[slug] || [];
  if (!all.length) return '';
  // One entry per day (lib/history.mjs collapseSameDay); a change to the limits or a flag shows its before → after.
  const diff = (e) => {
    const rows = beforeAfter(e);
    return rows.length ? `<ul class="upd-diff">${rows.map((r) => `<li><span class="upd-field">${htmlEsc(r.label)}:</span> <del>${htmlEsc(r.from)}</del> → <ins>${htmlEsc(r.to)}</ins></li>`).join('')}</ul>` : '';
  };
  const items = all.slice().reverse().map((e) => `<li class="upd"><span class="upd-date">${e.date}</span> <span>${htmlEsc(e.text)}</span>${diff(e)}</li>`).join('');
  return `<h2>Change history</h2>` +
    `<p class="muted">How this free tier has changed since we started tracking it (${all[0].date}) — generated from the git history of <a href="${REPO}/commits/main/data/providers.json">providers.json</a>.</p>` +
    `<ul class="upd-list" data-pager="5">${items}</ul>`;
};

const provFlagsHtml = (p) => {
  const parts = [];
  const add = (cond, ic, txt) => { if (cond) parts.push(`<span class="flag-badge">${IC(ic)}${txt}</span>`); };
  add(p.card_required === false, 'ic-nocard', 'no card'); add(p.card_required === true, 'ic-card', 'card required');
  add(p.phone_required === false, 'ic-nophone', 'no phone'); add(p.phone_required === true, 'ic-phone', 'phone required');
  add(p.commercial_ok === true, 'ic-building', 'commercial OK');
  add(p.commercial_ok === 'conditional', 'ic-building', 'commercial OK (conditional)');
  add(p.commercial_ok === false, 'ic-flask', 'eval only');
  add(p.openai_compatible === true, 'ic-code', 'OpenAI-compatible');
  return parts.join('');
};

// The model groups behind /models/<key>/ (built in the model index section below); provider pages link to them.
const MODEL_GROUPS = groupModels(providers);
const MODEL_PAGE_KEYS = new Set(MODEL_GROUPS.map((g) => g.key));
const modelPageHref = (prefix) => (id) => { const k = modelKey(id); return k && MODEL_PAGE_KEYS.has(k) ? `${prefix}models/${k}/` : ''; };

// The last block of every provider page: its badge on /embed/ and, for a provider on /not-free/, why. One function,
// appended after the change history, so a change to the section order elsewhere does not touch it.
const notFreeBySlug = new Map(NOT_FREE.entries.filter((e) => e.slug).map((e) => [e.slug, e]));
const useDataHtml = (p) => {
  const nf = notFreeBySlug.get(p.slug);
  return `<p class="muted" id="use-the-data"><a href="../embed/?p=${p.slug}#provider-badge">Embed this provider's badge</a>` +
    (nf ? ` · <a href="../not-free/#${nf.id}">Why ${htmlEsc(nf.name)} is on the Not free list</a>` : '') + `</p>`;
};

for (const p of providers) {
  const inColls = COLLECTIONS.filter((c) => collRows(c).some((x) => x.slug === p.slug));
  const inGuides = [...GUIDES.filter((g) => g.filter(p)), ...LONG_GUIDE_PAGES.filter((g) => g.slug !== 'choose-free-llm-api-for-production' && g.featured.some((x) => x.slug === p.slug))];
  // Concrete free model for snippets: prefer a real sampled ID, else a sensible default.
  const DEFAULT_MODEL = { groq: 'llama-3.1-8b-instant' };
  const model = (p.models_free && p.models_free[0]) || DEFAULT_MODEL[p.slug] || '<a-free-model>';
  const mods = p.modalities || [];
  const embeddingsFirst = mods.includes('embeddings') && !mods.includes('text');

  // Quickstart — modality-aware, using the provider's real base URL and a real free model.
  let quick = '';
  if (p.openai_base_url) {
    const python = embeddingsFirst
      ? pythonEmbeddingsQuickstart(p.openai_base_url, model)
      : pythonChatQuickstart(p.openai_base_url, model);
    quick = embeddingsFirst
      ? `<h2 id="quickstart">Quickstart — embeddings</h2><pre><code>${codeHtmlEsc(python)}</code></pre>`
      : `<h2 id="quickstart">Quickstart — chat completions</h2><pre><code>${codeHtmlEsc(python)}</code></pre><p class="muted">…or with curl:</p><pre><code>${codeHtmlEsc(curlChatQuickstart(p.openai_base_url, model))}</code></pre>`;
  } else {
    const docs = docsHref(p.docs_url);
    const docsLink = docs ? `<a href="${htmlEsc(docs)}" target="_blank" rel="noopener">official docs</a>` : 'official docs';
    quick = `<h2 id="quickstart">Get started</h2><p class="muted">No OpenAI-compatible base URL is recorded for this offer. Check the ${docsLink} for endpoints, authentication and examples.</p>`;
  }

  // The score of the provider (lib/score.mjs, the same numbers as /best/ and the API) with its method one click away. Providers that are
  // not scored (not verified, or outside the freshness window) say so instead of showing a number.
  const sc = scoreMap[p.slug];
  // Q13: its place among the scored providers and a bar of the six inputs (lib/score-bar.mjs); the formula is lib/score.mjs.
  const scoreHtml = sc
    ? scoreBlockHtml({
      position: scorePlace.get(p.slug).position, of: rankedAll.length, total: sc.total, editorial: scorePlace.get(p.slug).editorial, editorialWeight: EDITORIAL_WEIGHT,
      fractions: inputFractions(p, stabilityFromProbe(PROBE_REPORT, p.slug, new Date(ASOF + 'T12:00:00Z'))), weights: SCORE_WEIGHTS, topRank: sc.rank,
    })
    : `<div class="prov-score"><span class="muted">No score: only verified providers inside the freshness window are scored · <a href="../best/methodology/">how it is computed</a></span></div>`;
  const summary = `<div class="prov-summary"><h2 id="whats-free">What's free</h2><p>${htmlEsc(p.free_tier)}</p></div>` + scoreHtml + requirementsHtml(p);
  // Freshness relative to the current day (provider pages are regenerated on deploy, not diff-gated).
  const daysAgo = p.verified && p.last_verified ? ageInDays(p.last_verified, today) : null;
  const verifiedLine = p.verified
    ? `<span class="v ok">${IC('ic-check')} verified ${htmlEsc(p.last_verified)}${daysAgo != null ? ` · ${daysAgo}d ago` : ''}</span>` +
      (daysAgo != null && daysAgo > FRESH_DAYS ? ` <span class="v warn">${IC('ic-warn')} re-verification due</span>` : '')
    : `<span class="v warn">${IC('ic-warn')} unverified</span>`;
  // Live-test badge: an actual successful API call, separate from the docs-based `verified`.
  const probedLine = p.probe_status === 'live'
    ? ` <span class="v live" title="A real free-tier API call succeeded on this date">${IC('ic-check')} live-tested ${htmlEsc(p.last_probed || '')}</span>`
    : (p.probe_status === 'auth-ok'
        ? ` <span class="v ok" title="Credentials accessed /models; no inference was attempted">${IC('ic-check')} credentials checked ${htmlEsc(p.last_probed || '')}</span>`
        : (p.probe_status === 'tier-ended'
        ? ` <span class="v warn" title="The key authenticated but the free tier appears gone">${IC('ic-warn')} free tier unconfirmed live</span>`
        : ''));
  const docsBtn = docsHref(p.docs_url) ? `<a class="btn primary" href="${htmlEsc(docsHref(p.docs_url))}" target="_blank" rel="noopener">Official docs ↗</a>` : '';
  // "Get a free key": the provider's own key page, exactly as its docs link it (keys_url), next to the limits and the
  // quickstart. Tagged data-link="keys" by tagProviderLinks, so a click is an outbound_provider_click (consent-gated).
  const keysHtml = p.keys_url
    ? `<div class="prov-actions prov-key" style="align-items:center"><a class="btn primary" href="${htmlEsc(p.keys_url)}" target="_blank" rel="noopener">Get a free key ↗</a><span class="muted">Sign up or sign in on ${htmlEsc(p.name)}'s own site, then create an API key there.</span></div>`
    : '';
  const playgroundBtn = p.playground_url ? `<a class="btn" href="${htmlEsc(p.playground_url)}" target="_blank" rel="noopener">Try it ↗</a>` : '';
  // "Visit website": the provider's main site, derived from the docs URL by stripping
  // common docs/console/api subdomains so it points at the marketing homepage.
  let websiteBtn = '';
  let websiteHref = '';
  try {
    const u = new URL(docsHref(p.docs_url));
    const host = u.hostname.replace(/^(docs|console|platform|developer|developers|api|dashboard|cloud|build|support|help|inference-docs)\./, '');
    websiteHref = `${u.protocol}//${host}`;
    websiteBtn = `<a class="btn website" href="${websiteHref}" target="_blank" rel="noopener">Visit website ↗</a>`;
  } catch (_) { /* no/invalid docs URL — skip the website button */ }
  // "Compare with …": the static comparisons this provider appears in, plus the
  // interactive view pre-filled with it.
  // Peers of the same main modality (lib/compare.mjs comparePeers, Q9): the published page of the pair when there is one,
  // else the interactive view with both providers in it.
  const comparePeers = compareLib.comparePeers(p, providers, { staticPaths: COMPARE_PATHS, score: (o) => scoreMap[o.slug]?.total ?? null });
  const compareHtml =
    `<h2>Compare</h2><div class="colls">` +
    comparePeers.map((c) => `<a href="../compare/${c.path ? `${c.path}/` : `?compare=${p.slug},${c.other.slug}`}">Compare with ${htmlEsc(c.other.name)}</a>`).join('') +
    `<a href="../compare/?compare=${p.slug}">Compare with another provider →</a></div>`;
  const crossChips = [
    ...inColls.map((c) => `<a href="../collections/${c.slug}">${htmlEsc(c.title)}</a>`),
    ...inGuides.map((g) => `<a href="../guides/${g.slug}">${htmlEsc(g.card)}</a>`),
  ].join('');
  const main =
    pageHero({
      cls: 'prov-hero',
      crumbs: `<a href="../">Home</a> / <a href="../#explorer">Providers</a> / ${htmlEsc(p.name)}`,
      h1: htmlEsc(p.name),
      afterTitle: `<div class="prov-badges"><span class="type">${typeLabel(p)}</span> ${verifiedLine}${probedLine} ${provFlagsHtml(p)}</div>`,
      lede: p.best_for ? htmlEsc(p.best_for) : '',
      extra: `<div class="prov-actions">${docsBtn}${websiteBtn}${playgroundBtn}</div>`,
    }) +
    `<main id="main"><div class="wrap prose prov-prose">` +
    summary +
    limitsHtml(p) +
    keysHtml +
    // Q3: the snippet right after the limits (it sat ~4,500px down /p/groq on a phone); speed, data policy and the
    // provider's own description follow it.
    quick +
    glanceHtml(p, typeLabel(p)) +
    modelsHtml(p, { modelHref: modelPageHref('../') }) +
    speedHtml(p) +
    dataPolicyHtml(p) +
    aboutHtml(summaryBySlug.get(p.slug), p.name) +
    disclosureHtml(AGREEMENTS_FILE, p.slug) +
    (crossChips ? `<h2>Appears in</h2><div class="colls">${crossChips}</div>` : '') +
    compareHtml +
    historyHtml(p.slug) +
    useDataHtml(p) +
    `</div></main>`;
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', name: `${p.name} — free LLM API`, description: p.free_tier, url: `${SITE}/p/${p.slug}`,
        ...(p.last_verified ? { dateModified: p.last_verified } : {}),
        isPartOf: datasetRef(SITE),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Providers', item: `${SITE}/#explorer` },
          { '@type': 'ListItem', position: 3, name: p.name, item: `${SITE}/p/${p.slug}` },
        ],
      },
    ],
  });
  writeFileSync(
    join(ROOT, `site/p/${p.slug}.html`),
    htmlPage({ title: `${p.name} — free tier & limits · Free LLM API Hub`, desc: providerMetaDescription(p), canonical: `${SITE}/p/${p.slug}`, main: tagProviderLinks(main, providerLinkTargets(p, { website: websiteHref })), jsonld, ogImage: `${SITE}/og/p/${p.slug}.png`, scripts: ['pager.js'] })
  );

  // Embeddable per-provider badge. Same rule as the repo badge: the colour tracks
  // the age of the verification, so an entry someone embedded and forgot goes amber
  // past 60 days and red past the SLA instead of staying brightgreen forever.
  writeFileSync(
    join(ROOT, `site/badges/${p.slug}.json`),
    JSON.stringify({
      schemaVersion: 1,
      label: 'free-llm-api-hub',
      message: p.verified ? `verified ${p.last_verified}` : 'unverified',
      color: p.verified ? freshnessColor(daysAgo) : 'yellow',
    }) + '\n'
  );
}

// ---------- legal pages (minimal, noindex) ----------
mkdirSync(join(ROOT, 'site/legal'), { recursive: true });
const ORG = 'Tweakeo, Inc.';
const ADDRESS = 'Tweakeo, Inc., 2093 Philadelphia Pike, Suite #4108, Claymont, DE 19703';
const legalPage = (slug, title, bodyHtml) => {
  const main =
    pageHero({ crumbs: `<a href="../">Home</a> / ${htmlEsc(title)}`, h1: `${htmlEsc(title)}` }) +
    `<main id="main"><div class="wrap prose legal">${bodyHtml}` +
    `<p class="legal-org">${ADDRESS} · <a href="mailto:admin@freellmapihub.com">admin@freellmapihub.com</a></p>` +
    `</div></main>`;
  writeFileSync(
    join(ROOT, `site/legal/${slug}.html`),
    htmlPage({ title: `${title} · Free LLM API Hub`, desc: `${title} for Free LLM API Hub, operated by ${ORG}`, canonical: `${SITE}/legal/${slug}`, main, noindex: true })
  );
};

// ---------- 404 ----------
// GitHub Pages serves this one file for ANY missing path (/contributing/, /a/b/c), so a relative prefix would resolve against the
// missing URL and lose the styles, the menu and the footer. It is built with the same header and footer as every page and the
// root-absolute prefix '/'. The path read-out below is pinned by hash in the CSP: change its text and recompute the hash.
// Q16: a search box that lands on the explorer (/?q=, which explorer.js reads on load) and six popular providers: the
// first six of The Best, the score top (lib/score.mjs), so the list follows the data. Root-absolute links like the rest.
const NOT_FOUND_POPULAR = topList.slice(0, 6).map((e) => `<a href="/p/${e.p.slug}">${htmlEsc(e.p.name)}</a>`).join('');
const NOT_FOUND_PATH_SCRIPT = `<script>try{document.getElementById('path').textContent=location.pathname.replace('/free-llm-api-hub','')||'/';}catch(e){}</script>`;
writeFileSync(
  join(ROOT, 'site/404.html'),
  htmlPage({
    title: '404 — Free LLM API Hub',
    desc: "That page isn't part of the dataset. It may have moved, or never existed. The data, though, is very much alive.",
    // A noindex error page has no canonical URL of its own.
    canonical: null,
    prefix: '/',
    noindex: true,
    main: `<main id="main" class="wrap nf">
<h1 class="sr-only">Page not found (404)</h1>
<div class="code" aria-hidden="true">404</div>
<p class="msg">&gt; command not found: <span class="path" id="path">/…</span><span class="caret" aria-hidden="true"></span></p>
<p>That page isn't part of the dataset. It may have moved, or never existed. The data, though, is very much alive.</p>
<form class="nf-search" action="/" method="get" role="search"><label for="nf-q">Search the providers</label><input type="search" id="nf-q" name="q" class="sel search-input" placeholder="e.g. groq, embeddings, llama" autocomplete="off" spellcheck="false"><button type="submit" class="btn primary">Search</button></form>
${NOT_FOUND_POPULAR ? `<h2 class="nf-h">Popular providers</h2><nav class="colls" aria-label="Popular providers">${NOT_FOUND_POPULAR}</nav>` : ''}
<div class="cta"><a class="btn ghost" href="/">← Back home</a><a class="btn ghost" href="/#explorer">Browse providers</a><a class="btn ghost" href="/guides-and-collections/">Guides &amp; collections</a></div>
${NOT_FOUND_PATH_SCRIPT}
</main>`,
  })
);

// The privacy page says exactly what the site runs: by default no cookies and only the cookieless Cloudflare Web Analytics
// that Cloudflare injects at the edge (lib/analytics.mjs); with GA_MEASUREMENT_ID set, also Google Analytics and Google
// signals behind an opt-in banner with two categories, described below.
const privacyIntro = GA_ID
  ? `<p>This site is a static, open-source reference operated by ${ORG} It has no user accounts and shows no ads. It uses Google cookies <strong>only for the categories you allow</strong> in the cookie banner; until you allow one, nothing is loaded from Google and no cookie is set.</p>`
  : `<p>This site is a static, open-source reference operated by ${ORG} It has no user accounts, no ads, no cookies and no tracking; its only analytics is the cookieless Cloudflare Web Analytics described under Hosting.</p>`;
const privacyServerItem = GA_ID
  ? `<li><strong>Nothing on a server of ours.</strong> The site is served as static files by GitHub Pages; there is no backend. No cookies are set unless you allow a category below.</li>`
  : `<li><strong>Nothing on a server.</strong> The site is served as static files by GitHub Pages; there is no backend and no cookies are set.</li>`;
const privacyChoiceItem = GA_ID
  ? `\n<li><strong>Your cookie choices</strong> (one per category, with the version of this notice) are saved only in your browser's local storage, so the banner does not ask again on every page; it asks again if this notice changes in substance.</li>`
  : '';
const privacyAnalytics = GA_ID
  ? `<h2>Cookies from Google (only with your consent)</h2>
<p>The banner offers two independent categories, both off by default: <strong>Accept all</strong>, <strong>Reject all</strong>, or <strong>Customize</strong> to choose each one. If you allow neither, or make no choice, no request is ever sent to Google. The service is Google Analytics 4, provided by Google Ireland Limited (for visitors in the EEA, UK and Switzerland) or Google LLC (elsewhere).</p>
<h3>1. Analytics</h3>
<ul>
<li><strong>Purpose:</strong> count visits and see which pages are useful.</li>
<li><strong>What is collected:</strong> pages viewed, the page you came from, approximate location (country/city, derived from your IP address, which Google Analytics 4 does not log or store), device, browser, screen size and timing of your visit, and how you use the site: filters and sort order in the provider explorer, what you type in its search box (cut to 60 characters, never sent if it looks like an email address or a phone number), which kind of code snippet you copy, which data files you download, which comparisons and collections you open, which provider pages you follow, and where on the site you follow a link to this project's GitHub repository. Cookies: <code>_ga</code> and <code>_ga_&lt;id&gt;</code>, to tell visits apart.</li>
<li><strong>Role of Google:</strong> processor, acting on our instructions under Google's data processing terms.</li>
</ul>
<h3>2. Advertising &amp; personalised measurement (Google signals)</h3>
<ul>
<li><strong>Purpose:</strong> richer, aggregated audience reports. No ads are shown on this site and we run no ad campaigns.</li>
<li><strong>What it does:</strong> with Google signals, Google associates your visits with your Google account if you are signed in and have turned on ad personalisation in your Google account. This gives us aggregated, anonymous reports on demographics (age range, gender) and interests, and on use across devices. We never see who you are; reports below Google's privacy thresholds are withheld.</li>
<li><strong>Consent signals:</strong> this category grants Google's <code>ad_storage</code>, <code>ad_user_data</code> and <code>ad_personalization</code>; without it they stay denied, ad data is redacted and Google signals is off. Advertising cookies Google may set (such as <code>_gcl_*</code>) are deleted when you withdraw.</li>
<li><strong>Role of Google:</strong> for the data of signed-in users that links to their Google account, Google acts as an independent controller under its own privacy policy (policies.google.com/privacy); for the reports it produces for us, as our processor.</li>
</ul>
<h3>For both categories</h3>
<ul>
<li><strong>Legal basis:</strong> your consent (GDPR Art. 6(1)(a) and the ePrivacy rules on cookies), given separately for each category.</li>
<li><strong>International transfers:</strong> data may be transferred to the United States; Google LLC is certified under the EU–US Data Privacy Framework, and Google's standard contractual clauses apply.</li>
<li><strong>Retention:</strong> event data is kept in Google Analytics for 14 months, then deleted; the cookies expire after at most 2 years, or when you withdraw consent.</li>
<li><strong>Withdraw at any time:</strong> press <strong>Cookie settings</strong> at the bottom of any page and switch a category off, or choose <strong>Reject all</strong>. The change applies at once and the cookies of that category are deleted. You can also clear this site's cookies and local storage in your browser, and manage ad personalisation in your Google account (myadcenter.google.com).</li>
</ul>
<p>You can ask us for access to, correction or deletion of personal data about you, object to its processing, or complain to your data-protection authority.</p>
`
  : '';
const privacyCloudflareAnalytics = `Cloudflare also runs Cloudflare Web Analytics for this site: a small script from Cloudflare (static.cloudflareinsights.com) reports, in aggregate, page views, the referring site, page-load timings (Core Web Vitals) and the country, browser and device type. It sets no cookies, stores nothing on your device and does not fingerprint you or follow you across sites; we see only aggregated counts.`;
const privacyHostingTail = GA_ID
  ? `${privacyCloudflareAnalytics} Apart from it, the only analytics is the opt-in Google Analytics described above.`
  : `${privacyCloudflareAnalytics} This site sets no cookies.`;
legalPage('privacy', 'Privacy', `
${privacyIntro}
<h2>What we store</h2>
<ul>
${privacyServerItem}
<li><strong>Your theme choice</strong> (light/dark) is saved only in your browser's local storage and never leaves your device.</li>${privacyChoiceItem}
<li><strong>The GitHub star count</strong> is read from GitHub's public API by the process that builds the site (at least once a day), not by your browser: no request about it is sent from your device.</li>
</ul>
${privacyAnalytics}<h2>Hosting</h2>
<p>Pages, fonts and assets are delivered by GitHub Pages (GitHub, Inc.) through Cloudflare (Cloudflare, Inc.), a content-delivery and security proxy that sits between your browser and GitHub Pages. Both may process standard request metadata (such as your IP address) to serve content, per GitHub's and Cloudflare's privacy statements. ${privacyHostingTail}</p>
<h2>Contact</h2>
<p>Questions about privacy? Email <a href="mailto:admin@freellmapihub.com">admin@freellmapihub.com</a>.</p>
`);

legalPage('terms', 'Terms of Use', `
<p>The Free LLM API Hub dataset and website are provided by ${ORG} for informational purposes under the <a href="${REPO}/blob/main/LICENSE">MIT License</a>.</p>
<h2>No warranty</h2>
<p>The information is provided "as is", without warranty of any kind. Free-tier terms, limits and pricing change frequently and may be inaccurate or out of date. Always confirm details against each provider's own official documentation before relying on them.</p>
<h2>No affiliation</h2>
<p>This is an independent, community-maintained project. It is not affiliated with, endorsed by, or sponsored by any provider listed. All product names and trademarks are the property of their respective owners.</p>
<h2>Liability</h2>
<p>To the maximum extent permitted by law, ${ORG} and the project's contributors are not liable for any loss or damage arising from use of this site or dataset.</p>
<h2>Contact</h2>
<p>Email <a href="mailto:admin@freellmapihub.com">admin@freellmapihub.com</a>.</p>
`);

// ---------- updates pages + RSS feed (from git history; graceful if git is absent) ----------
const UPDATES_PER_PAGE = 20;
let commits = [];
try {
  const raw = execSync('git log --no-merges --date=short --pretty=format:%h%x1f%ad%x1f%s', { cwd: ROOT, encoding: 'utf8' });
  commits = raw.split('\n')
    .map((l) => { const [hash, date, subject] = l.split('\x1f'); return { hash, date, subject }; })
    .filter((c) => c.subject && !/\[skip ci\]|refresh freshness badge/i.test(c.subject));
} catch (_) { /* no git available — skip the feed */ }

if (commits.length) {
  const pageCount = Math.ceil(commits.length / UPDATES_PER_PAGE);
  const pageHref = (page, prefix) => page === 1 ? `${prefix}updates` : `${prefix}updates/page/${page}/`;
  const pagination = (page, prefix) => {
    const prev = page > 1 ? `<a href="${pageHref(page - 1, prefix)}" rel="prev">← Newer</a>` : '<span aria-hidden="true"></span>';
    const next = page < pageCount ? `<a href="${pageHref(page + 1, prefix)}" rel="next">Older →</a>` : '<span aria-hidden="true"></span>';
    return `<nav class="pagination" aria-label="Updates pagination">${prev}<span>Page ${page} of ${pageCount}</span>${next}</nav>`;
  };
  rmSync(join(ROOT, 'site/updates'), { recursive: true, force: true });
  for (let page = 1; page <= pageCount; page += 1) {
    const prefix = page === 1 ? '' : '../../../';
    const pageCommits = commits.slice((page - 1) * UPDATES_PER_PAGE, page * UPDATES_PER_PAGE);
    const updItems = pageCommits
      .map((c) => `<li class="upd"><span class="upd-date">${c.date}</span> <a href="${REPO}/commit/${c.hash}" target="_blank" rel="noopener">${htmlEsc(c.subject)}</a></li>`)
      .join('\n');
    const updMain =
      pageHero({ crumbs: `<a href="${prefix}">Home</a> / Updates`, h1: `Updates`, lede: `Every published change to the dataset and site, newest first. Subscribe via <a href="${prefix}feed.xml">RSS</a>. For field-level changes to the providers themselves, week by week, see <a href="${prefix}changes/">what changed this week</a>.` }) +
      `<main id="main"><div class="wrap"><ul class="upd-list">${updItems}</ul>${pagination(page, prefix)}</div></main>`;
    const target = page === 1 ? join(ROOT, 'site/updates.html') : join(ROOT, `site/updates/page/${page}/index.html`);
    if (page > 1) mkdirSync(dirname(target), { recursive: true });
    // Page 2 onwards is a thin list of commit titles: crawlers may follow it (noindex,follow) but not index it. Only
    // page 1 is in the sitemap and carries structured data.
    writeFileSync(target, htmlPage({
      title: `Updates${page > 1 ? ` · Page ${page}` : ''} · Free LLM API Hub`, desc: 'Published changes to the Free LLM API Hub dataset and site.', canonical: `${SITE}/${pageHref(page, '')}`, main: updMain, prefix,
      noindex: page > 1 ? 'noindex,follow' : false,
      jsonld: page === 1 ? collectionPageJsonLd({ name: 'Updates', url: `${SITE}/updates`, description: 'Published changes to the Free LLM API Hub dataset and site.', crumbs: [['Updates', `${SITE}/updates`]] }) : undefined,
    }));
  }

  const rssItems = commits.slice(0, UPDATES_PER_PAGE)
    .map((c) => `    <item><title>${htmlEsc(c.subject)}</title><link>${REPO}/commit/${c.hash}</link><guid isPermaLink="true">${REPO}/commit/${c.hash}</guid><pubDate>${new Date(c.date + 'T00:00:00Z').toUTCString()}</pubDate></item>`)
    .join('\n');
  const rss =
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>\n` +
    `    <title>Free LLM API Hub — updates</title>\n    <link>${SITE}/</link>\n    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>\n    <description>Changes to the continuously-verified free LLM &amp; AI-model API dataset.</description>\n` +
    `${rssItems}\n</channel></rss>\n`;
  writeFileSync(join(ROOT, 'site/feed.xml'), rss);
}

// ---------- weekly change feed + monthly state reports (from git history) ----------
// Both are mined from the per-provider history above (lib/changes.mjs and
// lib/state.mjs hold the pure logic). Generated by this build only — the deploy
// already runs it; nothing is scheduled. Git-log derived, so excluded from
// derived-fingerprints.json (isGitLogDerived). Without git they render empty.
const nameBySlug = Object.fromEntries(providers.map((p) => [p.slug, p.name]));
const currentSlugs = new Set(providers.map((p) => p.slug));
const allFieldChanges = flattenFieldChanges(historyBySlug, nameBySlug);
const changeWeeks = groupChangesByWeek(allFieldChanges, { weeks: 12 }); // the human feed: the page is by month
const apiV1ChangeWeeks = groupChangesByWeek(projectApiV1Changes(allFieldChanges), { weeks: 12 });
const provLink = (slug, name, prefix) => currentSlugs.has(slug) ? `<a href="${prefix}p/${slug}">${htmlEsc(name)}</a>` : htmlEsc(name);

writeFileSync(join(ROOT, 'site/changes.xml'), changesRss(changeWeeks, { site: SITE }));

const changeRowHtml = (c, prefix = '../') =>
  `<tr><td class="notes">${c.date}</td><td class="name">${provLink(c.slug, c.name, prefix)}</td><td>${htmlEsc(c.label)}</td>` +
  `<td class="notes">${htmlEsc(formatValue(c.from))}</td><td>${htmlEsc(formatValue(c.to))}</td></tr>`;

const addedBySlug = Object.fromEntries(providers.filter((p) => p.added).map((p) => [p.slug, p.added]));
const stateMonths = reportMonths(monthEndSnapshots);
const stateReports = stateMonths.map((m) => ({ ...monthlyReport({ ...m, historyBySlug, addedBySlug }), snapshotDate: m.snapshotDate }));
const kvTable = (head, rowsArr) =>
  `<table class="model-table"><thead><tr>${head.map((h) => `<th>${htmlEsc(h)}</th>`).join('')}</tr></thead><tbody>` +
  rowsArr.map((r) => `<tr>${r.map((v, i) => `<td${i === 0 ? ' class="name"' : ''}>${v}</td>`).join('')}</tr>`).join('') + `</tbody></table>`;
const statIcon = (icon, num, lbl) => `<div class="stat"><svg class="si" aria-hidden="true"><use href="#${icon}"/></svg><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
// What moved in a month, in the order it happened: the field changes of that month, oldest first.
const movedSection = (r) => {
  const label = monthLabel(r.month);
  const moved = allFieldChanges.filter((c) => c.date.startsWith(r.month + '-')).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // stable: the name and field order inside a day is kept
  return `<h2>What moved in ${label}</h2>` + (moved.length
    ? `<table class="model-table"><thead><tr><th>Date</th><th>Provider</th><th>Field</th><th>From</th><th>To</th></tr></thead><tbody>\n${moved.map((c) => changeRowHtml(c, '../../')).join('\n')}\n</tbody></table>`
    : `<p class="muted">No field changes in ${label}.</p>`);
};
const stat = (num, lbl) => `<div class="stat"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;

rmSync(join(ROOT, 'site/state'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'site/state'), { recursive: true });
stateReports.forEach((r, i) => {
  const label = monthLabel(r.month);
  const prev = stateReports[i - 1];
  const next = stateReports[i + 1];
  const days = (d) => (d === null ? '—' : `${d}d`);
  const main =
    pageHero({ crumbs: `<a href="../../">Home</a> / <a href="../../changes/#months">What changed</a> / ${label}`, h1: `State of free LLM APIs — ${label}`, lede: r.carried
      ? `No revision of providers.json was committed in ${label}: the figures repeat the last revision, of ${r.snapshotDate}, and ages are measured at the end of ${label}, ${r.asOf}.`
      : `Computed from the last revision of providers.json committed in ${label} (${r.snapshotDate}) and the git-mined change history. Ages are measured as of ${r.asOf}.${r.inProgress ? ' The month is still in progress: the data reach ' + r.asOf + '.' : ''}` }) +
    `<main id="main"><div class="wrap prose">` +
    `<div class="stats stats-month">` +
    statIcon('ic-shield', `${r.verified} of ${r.total}`, `providers verified (${pct(r.verifiedShare)})`) +
    statIcon('ic-clock', days(r.freshness.medianDays), 'median verification age') +
    statIcon('ic-refresh', r.fieldChanges, r.fieldChanges === 1 ? 'field change this month' : 'field changes this month') +
    `</div>` +
    `<p class="month-summary">${htmlEsc(monthSummary(r, prev))}</p>` +
    movedSection(r) +
    `<h2>Providers by category</h2>` +
    kvTable(['Category', 'Providers'], [['Ongoing free tier', r.byCategory.ongoing], ['Trial credit', r.byCategory.trial], ['Total', r.total]]) +
    `<h2>Providers by modality</h2><p class="muted">A provider counts once for every modality it offers free.</p>` +
    kvTable(['Modality', 'Providers'], r.byModality.map((m) => [htmlEsc(m.modality), m.count])) +
    `<h2>Verification and freshness</h2>` +
    kvTable(['Measure', 'Value'], [
      ['Verified', `${r.verified} of ${r.total} (${pct(r.verifiedShare)})`],
      ['Verified with a date', r.freshness.dated],
      [`Oldest verification, as of ${r.asOf}`, days(r.freshness.oldestDays)],
      [`Median verification age, as of ${r.asOf}`, days(r.freshness.medianDays)],
    ]) +
    `<h2>Providers added in ${label}</h2>` +
    (r.added.length
      ? kvTable(['Provider', 'Added'], r.added.map((a) => [provLink(a.slug, a.name, '../../'), a.added]))
      : `<p class="muted">No provider in the snapshot has an <code>added</code> date in ${label}.</p>`) +
    `<p class="muted">The data: <a href="../../api/v1/changes.json">api/v1/changes.json</a> has every field change, with its date, before and after.</p>` +
    `<nav class="pagination" aria-label="State reports">` +
    (prev ? `<a href="../${prev.month}/" rel="prev">← ${monthLabel(prev.month)}</a>` : '<span aria-hidden="true"></span>') +
    `<span><a href="../../changes/#months">All months</a></span>` +
    (next ? `<a href="../${next.month}/" rel="next">${monthLabel(next.month)} →</a>` : '<span aria-hidden="true"></span>') +
    `</nav></div></main>`;
  mkdirSync(join(ROOT, `site/state/${r.month}`), { recursive: true });
  writeFileSync(join(ROOT, `site/state/${r.month}/index.html`), htmlPage({
    title: `State of free LLM APIs — ${label} · Free LLM API Hub`,
    desc: `${label}: ${r.total} providers tracked, ${pct(r.verifiedShare)} verified, ${r.fieldChanges} field changes. Computed from the dataset and its git history.`,
    canonical: `${SITE}/state/${r.month}/`, main, prefix: '../../',
  }));
});
// /changes/ is the one page for what changed: one table, by year and month, newest first. Every month between the first
// and the last revision is listed (a month without a revision says "no changes"); each links to its report, which holds
// the detail, in order. /state/ redirects to it. The weekly feed (changes.xml) stays for those who subscribe.
const monthsByYear = new Map();
for (const r of [...stateReports].reverse()) {
  const year = r.month.slice(0, 4);
  if (!monthsByYear.has(year)) monthsByYear.set(year, []);
  monthsByYear.get(year).push(r);
}
const monthRowHtml = (r, yearCell) => {
  const brief = monthBrief(r);
  return `<tr${r.carried ? ' class="empty"' : ''}>${yearCell}` +
    `<td class="name"><a href="../state/${r.month}/" aria-label="${monthLabel(r.month)}: ${htmlEsc(brief)}">${monthName(r.month)}</a></td>` +
    `<td>${r.total}</td><td>${pct(r.verifiedShare)}</td><td>${r.fieldChanges}</td><td>${r.added.length}</td><td class="notes">${htmlEsc(brief)}</td></tr>`;
};
const monthsTable = stateReports.length
  ? `<table class="model-table months-table"><thead><tr><th>Year</th><th>Month</th><th>Providers</th><th>Verified</th><th>Field changes</th><th>Added</th><th>Summary</th></tr></thead><tbody>\n` +
    [...monthsByYear].map(([year, list]) => list.map((r, i) => monthRowHtml(r, i === 0 ? `<th scope="rowgroup" rowspan="${list.length}">${year}</th>` : '')).join('\n')).join('\n') +
    `\n</tbody></table>`
  : `<p class="muted">No history available.</p>`;
const changesMain =
  pageHero({ crumbs: `<a href="../">Home</a> / <a href="../updates">Updates</a> / What changed`, h1: `What changed`, lede: `Field-level changes to the free tiers we track (what's free, rate limits, the catch and the card, phone, commercial-use and OpenAI-compatibility flags), month by month. Mined from the git history of <a href="${REPO}/commits/main/data/providers.json">providers.json</a>. Subscribe via <a href="../changes.xml">RSS</a> or read the <a href="../api/v1/changes.json">JSON</a>.`, extra: `<div class="prov-actions subscribe"><a class="btn primary" href="../changes.xml" type="application/rss+xml">Subscribe via RSS</a><a class="btn ghost" href="../api/v1/changes.json" type="application/json">Changes as JSON</a></div>` }) +
  `<main id="main"><div class="wrap prose">` +
  `<section id="months"><h2>Month by month</h2>` +
  `<p>One report per month, from the first to the latest: provider counts by category and modality, verified share, verification age, and every field change and provider added, in the order they happened. A month with no committed revision of providers.json says so. Every figure is computed from the data and its git history.</p>` +
  monthsTable + `</section>` +
  `<p class="prov-back"><a href="../updates">← All updates</a></p>` +
  `</div></main>`;
rmSync(join(ROOT, 'site/changes'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'site/changes'), { recursive: true });
writeFileSync(join(ROOT, 'site/changes/index.html'), htmlPage({
  title: 'What changed · Free LLM API Hub',
  desc: 'What changed in the free LLM API dataset, month by month: field-level changes (free tier, rate limits, the catch and access flags, before and after) and a state report for each month.',
  canonical: `${SITE}/changes/`, main: changesMain, prefix: '../', jsonld: collectionPageJsonLd({
    name: 'What changed', url: `${SITE}/changes/`,
    description: 'Field-level changes to the free LLM API dataset, month by month.',
    crumbs: [['Updates', `${SITE}/updates`], ['What changed', `${SITE}/changes/`]],
  }),
}));
// The old index of the monthly reports now lives in /changes/#months; the reports keep their URLs.
writeFileSync(join(ROOT, 'site/state/index.html'), redirectPage('../changes/#months'));

// ---------- credit programs: site pages + doc, from data/programs.json ----------
const programs = JSON.parse(readFileSync(join(ROOT, 'data/programs.json'), 'utf8'));
mkdirSync(join(ROOT, 'site/programs'), { recursive: true });
const FUNDS_HTML = {
  yes: '<span class="funds yes">✅ LLM API</span>',
  partial: '<span class="funds partial">◐ via cloud</span>',
  no: '<span class="funds no">✖ perks only</span>',
};
const FUNDS_MD = { yes: '✅ LLM API', partial: '◐ via cloud', no: '✖ perks only' };
const LEGEND = 'Funds LLM API? — ✅ first-party LLM-API credits · ◐ cloud/compute usable for managed LLM APIs (Bedrock, Vertex AI, Azure OpenAI) · ✖ training / perks only.';
const startupsRowHtml = (r) => `<tr><td class="name"><a href="${htmlEsc(r.url)}" target="_blank" rel="noopener">${htmlEsc(r.name)}</a></td><td>${htmlEsc(r.what)}</td><td>${FUNDS_HTML[r.funds]}</td><td class="notes">${htmlEsc(r.who)}</td></tr>`;
const researchRowHtml = (r) => `<tr><td class="name"><a href="${htmlEsc(r.url)}" target="_blank" rel="noopener">${htmlEsc(r.name)}</a></td><td><span class="type">${htmlEsc(r.audience)}</span></td><td>${htmlEsc(r.what)}</td><td>${FUNDS_HTML[r.funds]}</td><td class="notes">${htmlEsc(r.who)}</td></tr>`;

const programPage = (slug, h1, lede, tableHead, rowsHtml, extra = '') =>
  htmlPage({
    title: `${h1} · Free LLM API Hub`, desc: stripTags(lede), canonical: `${SITE}/programs/${slug}`,
    jsonld: collectionPageJsonLd({ type: 'WebPage', name: h1, url: `${SITE}/programs/${slug}`, description: stripTags(lede), crumbs: [['Credit programs', `${SITE}/programs/`], [h1, `${SITE}/programs/${slug}`]] }),
    main:
      pageHero({ crumbs: `<a href="../">Home</a> / <a href="./">Credit programs</a> / ${htmlEsc(h1)}`, h1: `${htmlEsc(h1)}`, lede: `${lede}` }) +
      `<main id="main"><div class="wrap prose"><p class="count"><strong>${LEGEND}</strong></p>` +
      `<div class="table-scroll" role="region" aria-label="Table of programs" tabindex="0"><table><thead>${tableHead}</thead><tbody>\n${rowsHtml}\n</tbody></table></div>` +
      `<p style="margin-top:24px">Looking for a key to use right now with no application? See the <a href="../#explorer">verified self-serve list</a>.</p>${extra}</div></main>`,
  });

writeFileSync(join(ROOT, 'site/programs/startups.html'), programPage(
  'startups', 'Free credits for startups',
  'Apply-to-get credit programs that can fund LLM / AI-model API usage — volatile, so confirm the current terms before you rely on one. Different from the <a href="../#explorer">self-serve dataset</a>: these need eligibility and an application.',
  '<tr><th>Program</th><th>What you get</th><th>Funds LLM API?</th><th>Who qualifies</th></tr>',
  programs.startups.map(startupsRowHtml).join('\n'),
  `<p style="margin-top:16px">A student or researcher instead? See <a href="research">free credits for students &amp; researchers</a>.</p>`));

writeFileSync(join(ROOT, 'site/programs/research.html'), programPage(
  'research', 'Free credits for students & researchers',
  'Student and academic/research programs that give credits or access usable for LLM / AI-model APIs. Different from the <a href="../#explorer">self-serve dataset</a>: these need eligibility and an application.',
  '<tr><th>Program</th><th>Audience</th><th>What you get</th><th>Funds LLM API?</th><th>Who qualifies</th></tr>',
  programs.research.map(researchRowHtml).join('\n'),
  `<p style="margin-top:16px">Building a startup instead? See <a href="startups">free credits for startups</a>.</p>`));

// /programs/ is the directory the two pages live in; without an index it was a 404
// (nothing linked there, but people and crawlers trim the URL). Generated from the same data.
writeFileSync(join(ROOT, 'site/programs/index.html'), htmlPage({
  title: 'Free credit programs for LLM APIs · Free LLM API Hub',
  desc: `${programs.startups.length + programs.research.length} apply-to-get credit programs that can fund LLM and AI-model API usage, for startups and for students and researchers.`,
  canonical: `${SITE}/programs/`,
  jsonld: collectionPageJsonLd({
    name: 'Free credit programs', url: `${SITE}/programs/`, crumbs: [['Credit programs', `${SITE}/programs/`]],
    items: [{ name: 'Free credits for startups', url: `${SITE}/programs/startups` }, { name: 'Free credits for students & researchers', url: `${SITE}/programs/research` }],
  }),
  main:
    pageHero({ crumbs: `<a href="../">Home</a> / Credit programs`, h1: `Free credit programs`, lede: `Credit programs you apply for, as opposed to the <a href="../#explorer">self-serve free tiers</a> you can call today. Volatile, so confirm the current terms before you rely on one.` }) +
    `<main id="main"><div class="wrap prose"><ul>` +
    `<li><a href="startups">Free credits for startups</a> — ${programs.startups.length} programs</li>` +
    `<li><a href="research">Free credits for students &amp; researchers</a> — ${programs.research.length} programs</li></ul></div></main>`,
}));

// regenerate the companion doc tables from the same source (data-first)
const startupsMd = '| Program | What you get | Funds LLM API? | Who qualifies |\n|---|---|---|---|\n' +
  programs.startups.map((r) => `| **[${esc(r.name)}](${r.url})** | ${esc(r.what)} | ${FUNDS_MD[r.funds]} | ${esc(r.who)} |`).join('\n');
const researchMd = '| Program | Audience | What you get | Funds LLM API? | Who qualifies |\n|---|---|---|---|---|\n' +
  programs.research.map((r) => `| **[${esc(r.name)}](${r.url})** | ${esc(r.audience)} | ${esc(r.what)} | ${FUNDS_MD[r.funds]} | ${esc(r.who)} |`).join('\n');
let creditDoc = readFileSync(join(ROOT, 'docs/credit-programs.md'), 'utf8');
creditDoc = inject(creditDoc, 'startups', startupsMd);
creditDoc = inject(creditDoc, 'research', researchMd);
writeFileSync(join(ROOT, 'docs/credit-programs.md'), creditDoc);

// ---------- free model index: model -> provider, searchable ----------
mkdirSync(join(ROOT, 'site/models'), { recursive: true });
const modelIndex = [];
for (const p of providers) for (const m of (p.models_free || [])) modelIndex.push({ m, p });
modelIndex.sort((a, b) => a.m.toLowerCase().localeCompare(b.m.toLowerCase()) || a.p.name.localeCompare(b.p.name));
const modelProviderCount = providers.filter((p) => p.models_free && p.models_free.length).length;
const modelRowHtml = ({ m, p }) =>
  `<tr data-s="${htmlEsc((m + ' ' + p.name + ' ' + (p.modalities || []).join(' ')).toLowerCase())}">` +
  `<td class="name">${MODEL_PAGE_KEYS.has(modelKey(m)) ? `<a href="${modelKey(m)}/"><code>${htmlEsc(m)}</code></a>` : `<code>${htmlEsc(m)}</code>`}</td>` +
  `<td><a href="../p/${p.slug}">${htmlEsc(p.name)}</a></td>` +
  `<td>${htmlEsc(p.free_type)}</td>` +
  `<td class="notes">${(p.modalities || []).join(', ') || '—'}</td></tr>`;
const modelsMain =
  pageHero({ crumbs: `<a href="../">Home</a> / Free model index`, h1: `Free model index`, lede: `Every model our verified providers expose on a free tier — <strong>${modelIndex.length}</strong> entries across <strong>${modelProviderCount}</strong> providers, pulled from each provider's own <code>/models</code> endpoint where possible. The same model can appear under more than one provider.` }) +
  `<main id="main"><div class="wrap"><table class="model-table"><thead><tr><th>Model</th><th>Provider</th><th>Free type</th><th>Modalities</th></tr></thead><tbody>\n` +
  modelIndex.map(modelRowHtml).join('\n') +
  `\n</tbody></table><p class="muted" style="margin-top:18px">Model lists are a live sample and change often — always confirm against the provider. A provider missing here usually needs an API key to list its models; <a href="${REPO}/blob/main/docs/update-playbook.md">see how the list is refreshed</a>.</p></div></main>`;
writeFileSync(join(ROOT, 'site/models/index.html'), htmlPage({
  title: datedTitle('Free model index — which free API serves which model · Free LLM API Hub'),
  desc: `Index of ${modelIndex.length} models available on free LLM & AI-model API tiers, and which provider serves each.`,
  canonical: `${SITE}/models/`,
  main: modelsMain,
  ogImage: `${SITE}/og/models.png`,
  // The list is the indexable model pages only (two or more verified providers); the others carry noindex.
  jsonld: collectionPageJsonLd({
    name: 'Free model index', url: `${SITE}/models/`,
    description: `Models available on free LLM and AI-model API tiers, and which provider serves each.`,
    crumbs: [['Free model index', `${SITE}/models/`]],
    items: MODEL_GROUPS.filter((g) => isIndexable(g)).map((g) => ({ name: modelPageTitle(g).replace(/ · Free LLM API Hub$/, ''), url: `${SITE}/models/${g.key}/` })),
  }),
}));

// One page per model: /models/<key>/ ("Free API for <model>"). The key groups the same model under its different
// deployment names (lib/model-keys.mjs, conservative: never a guess); each page shows the exact ID every provider
// lists, so it only depends on the dataset and stays pinned in derived-fingerprints.json like the index. Stale
// pages go first: the subfolders are removed and written again, as site/changes and site/state are.
for (const d of readdirSync(join(ROOT, 'site/models'), { withFileTypes: true })) {
  if (d.isDirectory()) rmSync(join(ROOT, 'site/models', d.name), { recursive: true, force: true });
}
for (const g of MODEL_GROUPS) {
  mkdirSync(join(ROOT, `site/models/${g.key}`), { recursive: true });
  writeFileSync(join(ROOT, `site/models/${g.key}/index.html`), htmlPage({
    title: modelPageTitle(g),
    desc: modelPageDescription(g),
    canonical: `${SITE}/models/${g.key}/`,
    main: modelPageMainHtml(g, { asOf: ASOF, prefix: '../../' }),
    jsonld: modelPageJsonLd(g, { site: SITE }),
    prefix: '../../',
    noindex: !isIndexable(g),
    ogImage: `${SITE}/og/models.png`,
  }));
}

// ---------- SEO guides: intent-matched landing pages, generated from the data ----------
mkdirSync(join(ROOT, 'site/guides'), { recursive: true });
// A guide's modality is its `modality` field; a guide without one is about text LLMs (no card, OpenAI-compatible, no signup).
const guideFits = (g, p) => (g.modality ? (p.modalities || []).includes(g.modality) : p.is_text_llm === true);
const guideRow = (p) =>
  `<tr><td class="name"><a href="../p/${p.slug}">${htmlEsc(p.name)}</a><br><small>Verified <time datetime="${htmlEsc(p.last_verified)}">${htmlEsc(p.last_verified)}</time></small></td>` +
  `<td>${htmlEsc(p.free_tier)}</td>` +
  `<td class="notes">${htmlEsc(p.rate_limits)}</td>` +
  `<td>${provFlagsHtml(p)}</td></tr>`;
for (const g of GUIDES) {
  // These pages explicitly promise verified providers; collections still show all tracked rows.
  const list = providers.filter((p) => p.verified === true && g.filter(p));
  const fill = (t) => t.replaceAll('{n}', String(list.length)).replaceAll('{date}', ASOF);
  const metaDesc = fill(g.metaDesc);
  const twins = COLLECTIONS.filter((c) => (c.guides || []).includes(g.slug));
  // The pick is the guide's own (g.pick) or the first row of the shared "Recommended" order. It is shown only when it
  // belongs to the guide's modality (guideFits): a text-LLM guide never headlines an OCR or speech API as its top pick.
  const top = [(g.pick && list.find((x) => x.slug === g.pick)) || [...list].sort(recommendedCmp)[0]].find((x) => x && guideFits(g, x));
  const related = ALL_GUIDE_LINKS.filter((x) => x.slug !== g.slug)
    .map((x) => `<a href="${x.slug}">${htmlEsc(x.card)}</a>`).join('');
  const faqHtml = (g.faq && g.faq.length)
    ? `<h2>FAQ</h2>` + g.faq.map((f) => `<div class="faq-item"><h3>${htmlEsc(f.q)}</h3><p>${f.a}</p></div>`).join('')
    : '';
  const main =
    pageHero({ crumbs: `<a href="../">Home</a> / <a href="../guides-and-collections/">Guides &amp; Collections</a> / ${htmlEsc(g.h1)}`, h1: `${htmlEsc(g.h1)}`, lede: `${htmlEsc(g.lede)}` }) +
    `<main id="main"><div class="wrap prose">` +
    `<p class="answer"><strong>${htmlEsc(fill(g.answer))}</strong></p>` +
    g.intro +
    (top ? `<div class="prov-summary"><h2>Top pick — ${htmlEsc(top.name)}</h2><p>${htmlEsc(top.best_for || top.free_tier)} <a href="../p/${top.slug}">Details →</a></p></div>` : '') +
    `<p class="count"><strong>${list.length}</strong> verified providers</p>` +
    `<table class="model-table"><thead><tr><th>Provider</th><th>Free tier</th><th>Rate limits</th><th>Gotchas</th></tr></thead><tbody>\n` +
    list.map(guideRow).join('\n') +
    `\n</tbody></table>` +
    `<div class="prov-actions" style="margin-top:22px"><a class="btn primary" href="../${g.query}">Open in the explorer →</a></div>` +
    faqHtml +
    (twins.length ? `<h2>Related collections</h2><nav class="colls">${twins.map((c) => `<a href="../collections/${c.slug}">${htmlEsc(c.title)}</a>`).join('')}</nav>` : '') +
    `<h2>More guides</h2><nav class="colls">${related}</nav>` +
    `<p class="muted">Looking for OpenAI, Anthropic, Mistral or GitHub Models? <a href="../not-free/">Why they are not on this list</a>.</p>` +
    `<p class="prov-back"><a href="../guides-and-collections/">← All guides</a></p>` +
    `</div></main>`;
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', headline: g.h1, description: metaDesc, dateModified: ASOF,
        url: `${SITE}/guides/${g.slug}`, isPartOf: websiteRef(SITE),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Guides & Collections', item: `${SITE}/guides-and-collections/` },
          { '@type': 'ListItem', position: 3, name: g.h1, item: `${SITE}/guides/${g.slug}` },
        ],
      },
      ...(g.faq && g.faq.length ? [{
        '@type': 'FAQPage',
        mainEntity: g.faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) },
        })),
      }] : []),
    ],
  });
  writeFileSync(join(ROOT, `site/guides/${g.slug}.html`), htmlPage({
    title: datedTitle(g.title), desc: metaDesc, canonical: `${SITE}/guides/${g.slug}`, main, jsonld,
    ogImage: `${SITE}/og/guides/${g.slug}.png`,
  }));
}

// ---------- long-form guides: editorial copy, every figure from the data (lib/long-guides.mjs) ----------
for (const g of LONG_GUIDE_PAGES) {
  const faqHtml = `<h2 id="faq">FAQ</h2>` + g.faq.map((f) => `<div class="faq-item"><h3>${htmlEsc(f.q)}</h3><p>${f.a}</p></div>`).join('');
  const related = ALL_GUIDE_LINKS.filter((x) => x.slug !== g.slug).map((x) => `<a href="${x.slug}">${htmlEsc(x.card)}</a>`).join('');
  const main =
    pageHero({ crumbs: `<a href="../">Home</a> / <a href="../guides-and-collections/">Guides &amp; Collections</a> / ${htmlEsc(g.h1)}`, h1: htmlEsc(g.h1), lede: `Data as of <time datetime="${ASOF}">${ASOF}</time>. Every limit is quoted from the provider’s own page and dated.` }) +
    `<main id="main"><div class="wrap prose">` +
    `<p class="answer"><strong>${g.answer}</strong></p>` +
    g.body +
    faqHtml +
    (g.slug === 'openai-api-alternatives' ? '' : `<p class="muted">Looking for OpenAI, Anthropic, Mistral or GitHub Models? <a href="../not-free/">Why they are not on this list</a>.</p>`) +
    `<h2>More guides</h2><nav class="colls">${related}</nav>` +
    `<p class="muted">Data from the Free LLM API Hub dataset, as of ${ASOF}. Every limit is quoted from the provider’s own page; follow the source link before relying on it.</p>` +
    `<p class="prov-back"><a href="../guides-and-collections/">← All guides</a></p>` +
    `</div></main>`;
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', headline: g.h1, description: g.metaDesc, dateModified: ASOF,
        url: `${SITE}/guides/${g.slug}`, isPartOf: websiteRef(SITE), about: datasetRef(SITE),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Guides & Collections', item: `${SITE}/guides-and-collections/` },
          { '@type': 'ListItem', position: 3, name: g.h1, item: `${SITE}/guides/${g.slug}` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: stripTags(f.a) } })),
      },
    ],
  });
  writeFileSync(join(ROOT, `site/guides/${g.slug}.html`), htmlPage({
    title: g.title, desc: g.metaDesc, canonical: `${SITE}/guides/${g.slug}`, main, jsonld,
    ogImage: `${SITE}/og/guides/${g.slug}.png`,
  }));
}

// ---------- machine-readable: static JSON API (/api/v1) + llms.txt ----------
// Deterministic slices of the dataset at stable, versioned URLs — a "public API"
// that works on static hosting (no server, no query params, CORS-open). Plus
// llms.txt / llms-full.txt (llmstxt.org) so AI agents can consume the hub directly.
mkdirSync(join(ROOT, 'site/api/v1/modality'), { recursive: true });
const apiBase = { dataset: 'free-llm-api-hub', version: data.version, generated: ASOF, license: 'MIT', homepage: `${SITE}/`, docs: `${SITE}/api/` };
const writeApi = (rel, obj) => writeFileSync(join(ROOT, `site/api/v1/${rel}`), JSON.stringify(obj, null, 2) + '\n');
// v1 published commercial_ok as boolean|null. Keep that type stable while the
// additive commercial_ok_condition field carries the reason for conditional use.
const apiProviders = publicProviders.map(toApiV1Provider);
writeApi('providers.json', { ...apiBase, count: apiProviders.length, providers: apiProviders });
writeApi('programs.json', { ...apiBase, startups: programs.startups, research: programs.research });
// The field-level before/after values live in changes.json; history.json keeps
// its published shape (date, kind, fields, text).
const historyPublic = Object.fromEntries(Object.entries(historyBySlug).map(([slug, events]) => [slug, events.map(({ changes, ...e }) => e)]));
writeApi('history.json', { ...apiBase, description: 'Per-provider change history mined from the git log of providers.json.', history: historyPublic });
writeApi('changes.json', { ...apiBase, description: 'Field-level provider changes (from/to), grouped by ISO week, newest first: the last 12 weeks ending at the newest change. Mined from the git log of providers.json.', weeks: apiV1ChangeWeeks.map(({ week, start, end, count, changes }) => ({ week, start, end, count, changes: changes.map(({ date, slug, name, field, from, to }) => ({ date, slug, name, field, from, to })) })) });
writeApi('best.json', { ...apiBase, description: 'The top 10 free LLM APIs by the FLLMAPIHUB score, in rank order, with the score and its parts. Never padded to ten. Every pick carries its full verified profile. Method: ' + SITE + '/best/methodology/', updated: ASOF, count: topList.length, picks: topList.map((e) => ({ rank: e.rank, podium: e.podium, score: Math.round(e.total * 10) / 10, math: Math.round(e.math * 10) / 10, editorial: Math.round(e.editorial * 10) / 10, confirmed: e.confirmed, of: e.of, parts: Object.fromEntries(Object.entries(e.parts).map(([k, v]) => [k, Math.round(v * 10) / 10])), tier_near_threshold: e.boundary, ...toApiV1Provider(e.p) })) });
// /api/v1/score.json: the whole score, not only the top 10. Same numbers as best.json (one rounding rule, one source).
const r1 = (x) => Math.round(x * 10) / 10;
const SCORE_SCHEMA_URL = SITE + '/api/v1/score.schema.json';
writeApi('score.json', {
  ...apiBase,
  description: 'The FLLMAPIHUB score of every eligible provider (verified and inside the freshness window), best first, with its parts and how many of its inputs the data confirms. Method: ' + SITE + '/best/methodology/',
  schema: SCORE_SCHEMA_URL,
  method: SITE + '/best/methodology/',
  weights: { ...SCORE_WEIGHTS, editorial: EDITORIAL_WEIGHT },
  editorial_default: EDITORIAL_DEFAULT,
  editorial_neutral: providers.every((p) => editorialRating(EDITORIAL, p.slug) === EDITORIAL_DEFAULT),
  min_confirmed: MIN_CONFIRMED,
  top_size: TOP_SIZE,
  podium_size: PODIUM_SIZE,
  count: rankedAll.length,
  providers: rankedAll.map((r) => {
    const top = topList.find((e) => e.p.slug === r.slug);
    return {
      slug: r.slug, name: r.name, is_text_llm: r.provider.is_text_llm === true,
      score: r1(r.total), math: r1(r.math), editorial: r1(r.editorial), confirmed: r.confirmed, of: r.of,
      parts: Object.fromEntries(Object.entries(r.parts).map(([k, v]) => [k, r1(v)])),
      meets_minimum: r.confirmed >= MIN_CONFIRMED, in_top: !!top, top_rank: top ? top.rank : null, tier_near_threshold: r.boundary,
    };
  }),
});
writeFileSync(join(ROOT, 'site/api/v1/score.schema.json'), readFileSync(join(ROOT, 'data/score.schema.json')));
// /api/v1/free-gpu.json: the Free GPU compute section, apart from the provider ranking. It is the data file
// as it is (data/gpu-compute.json), with its contract v1 and a JSON Schema at a stable URL; it carries no count of
// providers and nothing here is read by any other file of the API.
const freeGpu = JSON.parse(readFileSync(join(ROOT, 'data/gpu-compute.json'), 'utf8'));
const FREE_GPU_SCHEMA_URL = SITE + '/api/v1/free-gpu.schema.json';
writeApi('free-gpu.json', {
  ...apiBase,
  description: 'Services that give free GPU time, apart from the provider ranking: each value with the sentence it rests on and the day it was read; a value the provider did not state reads not_stated. Page: ' + SITE + '/free-gpu/',
  schema: FREE_GPU_SCHEMA_URL,
  page: SITE + '/free-gpu/',
  count: freeGpu.entries.length,
  entries: freeGpu.entries,
  notes: freeGpu.notes || [],
});
writeFileSync(join(ROOT, 'site/api/v1/free-gpu.schema.json'), readFileSync(join(ROOT, 'data/free-gpu.schema.json')));
// /api/v1/coding-tools.json: the Free AI coding tools section, apart from the provider ranking. It is the data file
// as it is (data/coding-tools.json), with its contract v1 and a JSON Schema at a stable URL; it carries no count of
// providers and nothing here is read by any other file of the API.
const codingTools = JSON.parse(readFileSync(join(ROOT, 'data/coding-tools.json'), 'utf8'));
const CODING_TOOLS_SCHEMA_URL = SITE + '/api/v1/coding-tools.schema.json';
writeApi('coding-tools.json', {
  ...apiBase,
  description: 'Coding tools that say they have a free plan, apart from the provider ranking: each value with the sentence it rests on and the day it was read; a value the tool did not state reads not_stated, which is never no. Page: ' + SITE + '/coding-tools/',
  schema: CODING_TOOLS_SCHEMA_URL,
  page: SITE + '/coding-tools/',
  count: codingTools.entries.length,
  entries: codingTools.entries,
  notes: codingTools.notes || [],
});
writeFileSync(join(ROOT, 'site/api/v1/coding-tools.schema.json'), readFileSync(join(ROOT, 'data/coding-tools-api.schema.json')));
// /api/v1/coding-tools-own-key.json: the coding tools that are free themselves while inference is paid with your own key
// or a free API. A file of its own so the contract of coding-tools.json never changes and the two lists never mix in a client.
const codingToolsOwnKey = JSON.parse(readFileSync(join(ROOT, 'data/coding-tools-own-key.json'), 'utf8'));
writeApi('coding-tools-own-key.json', {
  ...apiBase,
  description: 'Coding tools that are free themselves while inference is paid with your own key or a free API, apart from the provider ranking and from the tools with their own free plan: each value with the sentence it rests on and the day it was read; a value the tool did not state reads not_stated, which is never no. Page: ' + SITE + '/coding-tools/#own-key',
  schema: SITE + '/api/v1/coding-tools-own-key.schema.json',
  page: SITE + '/coding-tools/#own-key',
  count: codingToolsOwnKey.entries.length,
  entries: codingToolsOwnKey.entries,
  notes: codingToolsOwnKey.notes || [],
});
writeFileSync(join(ROOT, 'site/api/v1/coding-tools-own-key.schema.json'), readFileSync(join(ROOT, 'data/coding-tools-own-key-api.schema.json')));
const API_SLICES = {
  ongoing: (p) => p.category === 'ongoing',
  trial: (p) => p.category === 'trial',
  perpetual: (p) => p.free_type === 'perpetual',
  'no-card': (p) => p.card_required === false,
  'no-phone': (p) => p.phone_required === false,
  commercial: (p) => p.commercial_ok === true,
  'openai-compatible': (p) => p.openai_compatible === true,
};
for (const [name, fn] of Object.entries(API_SLICES)) {
  const list = publicProviders.filter(fn).map(toApiV1Provider);
  writeApi(`${name}.json`, { ...apiBase, slice: name, count: list.length, providers: list });
}
const API_MODS = ['text', 'vision', 'image', 'audio', 'embeddings', 'rerank', 'ocr'];
for (const m of API_MODS) {
  const list = publicProviders.filter((p) => (p.modalities || []).includes(m)).map(toApiV1Provider);
  writeApi(`modality/${m}.json`, { ...apiBase, modality: m, count: list.length, providers: list });
}
// Client configs (LiteLLM proxy + OpenAI SDK) for the verified OpenAI-compatible
// providers, and the JSON Schema the dataset is validated against. These are the
// only API files that publish env_key: the NAME of the variable holding the
// user's own key, never a value (see scripts/lib/client-config.mjs).
// ADVISORY-007: the deploy builds without running validate.mjs, so the build itself refuses to publish a client config whose key
// points at a host that is not pinned for it (publishableClientConfigs throws).
let clientConfigs;
try {
  clientConfigs = publishableClientConfigs({ version: data.version, generated: ASOF, providers });
} catch (error) {
  console.error('✗ ' + error.message);
  process.exit(1);
}
const clientList = clientConfigs.clients;
writeApi('openai-clients.json', { ...apiBase, description: 'Base URL, API-key env var name and sampled free models for every verified OpenAI-compatible provider. Plug into any OpenAI SDK; confirm free-tier terms in docs_url first.', count: clientList.length, clients: clientList });
writeFileSync(join(ROOT, 'site/api/v1/litellm.yaml'), clientConfigs.yaml);
const canonicalProviderSchema = JSON.parse(readFileSync(join(ROOT, 'data/schema.json'), 'utf8'));
writeApi('schema.json', apiV1ProviderSchema(canonicalProviderSchema));
const apiEndpoints = {
  providers: 'v1/providers.json',
  programs: 'v1/programs.json',
  history: 'v1/history.json',
  changes: 'v1/changes.json',
  best: 'v1/best.json',
  score: 'v1/score.json',
  'score-schema': 'v1/score.schema.json',
  'free-gpu': 'v1/free-gpu.json',
  'free-gpu-schema': 'v1/free-gpu.schema.json',
  'coding-tools': 'v1/coding-tools.json',
  'coding-tools-schema': 'v1/coding-tools.schema.json',
  'coding-tools-own-key': 'v1/coding-tools-own-key.json',
  'coding-tools-own-key-schema': 'v1/coding-tools-own-key.schema.json',
  schema: 'v1/schema.json',
  'openai-clients': 'v1/openai-clients.json',
  litellm: 'v1/litellm.yaml',
  slices: Object.fromEntries(Object.keys(API_SLICES).map((s) => [s, `v1/${s}.json`])),
  modality: Object.fromEntries(API_MODS.map((m) => [m, `v1/modality/${m}.json`])),
};
writeApi('index.json', { ...apiBase, description: 'Static, versioned JSON over the free-llm-api-hub dataset. Paths are relative to /api/v1/. Regenerated on every dataset change; no query params, no auth, no rate limits.', counts: { providers: publicProviders.length, ongoing: ongoing.length, trial: trial.length, programs: programs.startups.length + programs.research.length }, endpoints: apiEndpoints });

// human-facing API docs page
const apiRow = (label, path, count) => {
  const url = `${SITE}/api/v1/${path}`;
  return `<tr><td class="name"><a href="v1/${htmlEsc(path)}"><code>/api/v1/${htmlEsc(path)}</code></a> <button type="button" class="api-copy" data-api-url="${htmlEsc(url)}" aria-label="Copy endpoint URL: ${htmlEsc(url)}">Copy</button><span class="api-copy-status" role="status"></span></td><td>${htmlEsc(label)}</td><td>${count != null ? count : ''}</td><td class="api-curl"><code>curl --fail --silent --show-error ${htmlEsc(url)}</code></td></tr>`;
};
// Client-config section: the example uses the first client with a sampled model,
// so it always names a provider and model that are really in the file.
const exampleClient = clientList.find((c) => c.models_free && c.models_free.length) || clientList[0];
const exampleModel = exampleClient && exampleClient.models_free && exampleClient.models_free.length ? exampleClient.models_free[0] : '<model-id>';
const clientConfigPython = !exampleClient ? '' : `import json, os, urllib.request
from openai import OpenAI

url = "${SITE}/api/v1/openai-clients.json"
clients = {c["slug"]: c for c in json.load(urllib.request.urlopen(url))["clients"]}
c = clients[${pythonStringLiteral(exampleClient.slug)}]

client = OpenAI(base_url=c["base_url"], api_key=os.environ[c["env_key"]])
reply = client.chat.completions.create(
    model=${pythonStringLiteral(exampleModel)},
    messages=[{"role": "user", "content": "Hello"}],
)
print(reply.choices[0].message.content)`;
const clientConfigDocs = !exampleClient ? '' :
  `<h2>Client configs</h2>` +
  `<p>Two generated files turn the dataset into working client configuration for the <strong>${clientList.length} providers</strong> that are verified, OpenAI-compatible and have a known base URL and key variable. Both carry the <em>name</em> of the environment variable for your own key (for example <code>${htmlEsc(exampleClient.env_key)}</code>), never a key. Free-tier terms change without notice: check each provider's <code>docs_url</code> before you depend on it.</p>` +
  `<h3><code>openai-clients.json</code></h3>` +
  `<p>One record per provider: <code>slug</code>, <code>name</code>, <code>base_url</code>, <code>env_key</code>, <code>models_free</code> (a sample, may be <code>null</code>), <code>docs_url</code>, <code>last_verified</code>. With the OpenAI Python SDK:</p>` +
  `<pre><code>${codeHtmlEsc(clientConfigPython)}</code></pre>` +
  `<h3><code>litellm.yaml</code></h3>` +
  `<p>A <a href="https://docs.litellm.ai/docs/proxy/configs" rel="noopener">LiteLLM proxy</a> <code>model_list</code> with one entry per provider and sampled model, named <code>&lt;slug&gt;/&lt;model&gt;</code>. Keys are read with LiteLLM's <code>os.environ/&lt;ENV_KEY&gt;</code> syntax; a provider without a model sample gets one entry whose model id is marked <code># set a model id</code>. Delete the providers you have no key for, then:</p>` +
  `<pre><code>curl -sO ${SITE}/api/v1/litellm.yaml
export ${htmlEsc(exampleClient.env_key)}=...
litellm --config litellm.yaml</code></pre>` +
  `<p>Point any OpenAI client at the proxy (<code>base_url="http://0.0.0.0:4000"</code>) and request a model by its <code>model_name</code>, e.g. <code>${htmlEsc(`${exampleClient.slug}/${exampleModel}`)}</code>.</p>`;
const apiDocMain =
  pageHero({ crumbs: `<a href="../">Home</a> / API`, h1: `Static JSON API`, lede: `The whole dataset as versioned, machine-readable JSON at stable URLs — no server, no query params, no auth, no rate limits. CORS-open, so you can <code>fetch()</code> it straight from the browser with a plain <code>GET</code>; send no custom headers, because the host answers the <code>OPTIONS</code> preflight they trigger with 405. Regenerated on every dataset change (currently v${data.version}).` }) +
  `<main id="main"><div class="wrap prose">` +
  `<h2>Everything</h2><table class="model-table api-endpoints"><thead><tr><th>Endpoint</th><th>Contents</th><th>Count</th><th>curl example</th></tr></thead><tbody>` +
  apiRow('Full provider dataset (all fields)', 'providers.json', publicProviders.length) +
  apiRow('Apply-to-get credit programs', 'programs.json', programs.startups.length + programs.research.length) +
  apiRow('The top 10 by score, ranked with its parts', 'best.json', topList.length) +
  apiRow('The score of every eligible provider, with its parts', 'score.json', rankedAll.length) +
  apiRow('JSON Schema of score.json (contract v1)', 'score.schema.json', null) +
  apiRow('Free GPU compute, apart from the ranking (not a count of providers)', 'free-gpu.json', freeGpu.entries.length) +
  apiRow('JSON Schema of free-gpu.json (contract v1)', 'free-gpu.schema.json', null) +
  apiRow('Free AI coding tools, apart from the ranking (not a count of providers)', 'coding-tools.json', codingTools.entries.length) +
  apiRow('JSON Schema of coding-tools.json (contract v1)', 'coding-tools.schema.json', null) +
  apiRow('Free AI coding tools you connect your own key to, apart from the ranking (not a count of providers)', 'coding-tools-own-key.json', codingToolsOwnKey.entries.length) +
  apiRow('JSON Schema of coding-tools-own-key.json (contract v1)', 'coding-tools-own-key.schema.json', null) +
  apiRow('Field-level provider changes by ISO week (last 12 weeks)', 'changes.json', null) +
  apiRow('Endpoint manifest', 'index.json', null) +
  apiRow('JSON Schema of API v1 provider-list payloads', 'schema.json', null) +
  apiRow('OpenAI SDK settings per verified OpenAI-compatible provider', 'openai-clients.json', clientList.length) +
  apiRow('LiteLLM proxy config (model_list) for the same providers', 'litellm.yaml', clientList.length) +
  `</tbody></table>` +
  `<h2>Slices (by constraint)</h2><table class="model-table api-endpoints"><thead><tr><th>Endpoint</th><th>Contents</th><th>Count</th><th>curl example</th></tr></thead><tbody>` +
  Object.entries(API_SLICES).map(([n, fn]) => apiRow(`Providers where ${n.replace(/-/g, ' ')}`, `${n}.json`, publicProviders.filter(fn).length)).join('') +
  `</tbody></table>` +
  `<h2>Slices (by modality)</h2><table class="model-table api-endpoints"><thead><tr><th>Endpoint</th><th>Contents</th><th>Count</th><th>curl example</th></tr></thead><tbody>` +
  API_MODS.map((m) => apiRow(`Providers with a free ${m} modality`, `modality/${m}.json`, publicProviders.filter((p) => (p.modalities || []).includes(m)).length)).join('') +
  `</tbody></table>` +
  `<h2>Example</h2><pre><code>curl -s ${SITE}/api/v1/no-card.json | jq '.providers[].name'</code></pre>` +
  clientConfigDocs +
  `<h2>Stability</h2><p>Paths under <code>/api/v1/</code> stay put and fields are only ever added within v1; a breaking change ships as <code>/api/v2/</code>. The full policy, and how the dataset <code>version</code> relates to the path, is in <a href="${REPO}/blob/main/docs/api.md">docs/api.md</a>. The JSON Schema is published at <a href="v1/schema.json"><code>/api/v1/schema.json</code></a>.</p>` +
  `<p class="muted">Every object carries the dataset <code>version</code> and <code>generated</code> date. Prefer a stable snapshot? Pin a Git tag of <a href="${REPO}">the repo</a>. For AI agents, see <a href="../llms.txt">llms.txt</a>.</p>` +
  `<p>Want the widget, a badge or a citation instead? See <a href="../embed/">Use the data</a>.</p>` +
  citeBlockHtml(citationRecord(citation)) +
  `</div></main>`;
mkdirSync(join(ROOT, 'site/api'), { recursive: true });
writeFileSync(join(ROOT, 'site/api/index.html'), htmlPage({
  title: 'Static JSON API · Free LLM API Hub',
  desc: 'The free-llm-api-hub dataset as versioned, machine-readable JSON at stable URLs — full dataset plus pre-filtered slices by category, constraint and modality. No auth, no rate limits.',
  canonical: `${SITE}/api/`, main: apiDocMain, prefix: '../', ogImage: `${SITE}/og/api.png`,
  // The Dataset itself is described once, on the home page; this page is about it.
  jsonld: collectionPageJsonLd({
    type: 'WebPage', name: 'Static JSON API', url: `${SITE}/api/`,
    description: 'The free-llm-api-hub dataset as versioned JSON at stable URLs.',
    about: datasetRef(SITE),
    crumbs: [['API', `${SITE}/api/`]],
  }),
}));

// llms.txt (concise index) + llms-full.txt (every provider expanded) — llmstxt.org
const programCount = programs.startups.length + programs.research.length;
const llmsSummary = `A continuously-verified, machine-readable dataset of free-tier and trial-credit LLM (and adjacent AI-model) APIs for developers. Every entry is dated and sourced to the provider's own docs.`;
const llmsTxt =
  `# Free LLM API Hub\n\n> ${llmsSummary}\n\n` +
  `${total} providers (${ongoing.length} ongoing free tiers, ${trial.length} trial credits) and ${programCount} apply-to-get credit programs. Dataset v${data.version}. Terms change often — always confirm against each provider's own docs, linked from every entry. This whole site is static and machine-readable.\n\n` +
  `## Dataset\n` +
  `- [Full dataset, JSON](${SITE}/api/v1/providers.json): every provider, all fields\n` +
  `- [JSON Schema](${REPO}/blob/main/data/schema.json)\n` +
  `- [Static JSON API](${SITE}/api/): versioned endpoints + pre-filtered slices (category, modality, no-card, commercial, OpenAI-compatible, …)\n` +
  `- [Full provider list expanded, markdown](${SITE}/llms-full.txt)\n\n` +
  `## Guides\n` +
  [...GUIDES, ...LONG_GUIDE_PAGES].map((g) => `- [${g.h1}](${SITE}/guides/${g.slug}): ${g.blurb}`).join('\n') + `\n\n` +
  `## Collections\n` +
  COLLECTIONS.map((c) => `- [${c.title}](${SITE}/collections/${c.slug})`).join('\n') + `\n\n` +
  `## Credit programs\n` +
  `- [Startup credits](${SITE}/programs/startups)\n- [Student & research credits](${SITE}/programs/research)\n`;
writeFileSync(join(ROOT, 'site/llms.txt'), llmsTxt);

// A null flag with a recorded reason (field_checks) says the reason instead of "unknown".
const yn = (v, yes, no, check) => v === true ? yes : v === false ? no : v === 'conditional' ? 'conditional'
  : check && check.status !== 'stated' && REASON_LABEL[check.status] ? `unknown, ${REASON_LABEL[check.status]} (checked ${check.checked})` : 'unknown';
// yes / no only where /data-policy/ says so (trainState); a value without the provider's sentence, or none, is not confirmed.
const TRAINS_ON_PROMPTS = { yes: 'yes', no: 'no' };
const dataPolicyLine = (p) => {
  const dp = p.data_policy && typeof p.data_policy === 'object' ? p.data_policy : null;
  if (!dp) return '';
  const trains = TRAINS_ON_PROMPTS[trainState(p)] || 'not confirmed';
  const retention = dp.retention ? String(dp.retention).replace(/\s+/g, ' ').trim() : 'not confirmed';
  return `- Prompt data policy: trains on prompts: ${trains}; retention: ${retention} (source ${dp.source}, checked ${dp.checked})\n`;
};
const provBlock = (p) => {
  const gates = [
    `card required: ${yn(p.card_required, 'yes', 'no', fieldCheck(p, 'card_required'))}`,
    `phone required: ${yn(p.phone_required, 'yes', 'no', fieldCheck(p, 'phone_required'))}`,
    `commercial use: ${yn(p.commercial_ok, 'allowed', 'not allowed', fieldCheck(p, 'commercial_ok'))}`,
    `OpenAI-compatible: ${yn(p.openai_compatible, 'yes', 'no', fieldCheck(p, 'openai_compatible'))}${p.openai_base_url ? ` (base ${p.openai_base_url})` : ''}`,
  ].join('; ');
  // The condition is its own line: Gates uses "; " as its separator and a condition may contain ";" itself.
  // Collapse white space so a condition that holds a line break still reads as one line.
  const conditionLine = p.commercial_ok === 'conditional' && p.commercial_ok_condition ? `- Commercial-use condition: ${String(p.commercial_ok_condition).replace(/\s+/g, ' ').trim()}\n` : '';
  return `### ${p.name} — ${p.category === 'ongoing' ? 'ongoing free tier' : 'trial credit'}\n` +
    `- Free: ${p.free_tier}\n` +
    `- Rate limits: ${p.rate_limits || 'not specified'}\n` +
    `- The catch: ${p.notes || '—'}\n` +
    `- Modalities: ${(p.modalities || ['text']).join(', ')}\n` +
    `- Gates: ${gates}\n` +
    conditionLine +
    (publishedSpeed(p).length ? `- Published speed (the provider's own figures, not measured by us; not stated for the free tier unless the page says so): ${publishedSpeed(p).map((e) => `${e.model} ${speedFigure(e)} (${e.source}, checked ${e.checked})`).join('; ')}\n` : '') +
    dataPolicyLine(p) +
    `- Docs: ${p.docs_url}\n` +
    `- Page: ${SITE}/p/${p.slug}\n`;
};
const llmsFull =
  `# Free LLM API Hub — full provider list\n\n> ${llmsSummary}\n\n` +
  `${total} providers, dataset v${data.version}, generated ${ASOF}. Confirm every figure against the linked docs.\n\n` +
  `## Providers\n\n` +
  providers.map(provBlock).join('\n') + `\n`;
writeFileSync(join(ROOT, 'site/llms-full.txt'), llmsFull);


// ---------- /best — the top 10 by score, with a podium of three ----------
// topList is computed up front (lib/score.mjs) so the README table, this page and the API agree.
// data/best.json keeps the texts of the page; its picks now only feed the static /compare/ pages.
const bestIntroHtml = htmlEsc(BEST.intro).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const scoreTxt = (x) => x.toFixed(1);
const bestCard = (e) => {
  const { rank, p, podium } = e;
  const note = EDITORIAL.ratings?.[p.slug]?.note;
  // The score has a frame and the position is centred on the card; the third row (verified date, inputs confirmed, one-line
  // description) is replaced by three cards of fields of the record: Free quota, Rate limit and Requirements (lib/best-facts.mjs).
  return '<li class="best-item' + (podium ? ' best-podium best-podium-' + rank : '') + '"><div class="best-rank" aria-hidden="true">' + String(rank).padStart(2, '0') + '</div><div class="best-body">' +
    '<div class="best-head"><h2><a href="../p/' + p.slug + '">' + htmlEsc(p.name) + '</a></h2>' +
    (e.boundary ? '<span class="best-flag" title="The model tier of this provider sits near a threshold of the score; it is flagged, never penalized">tier near a threshold</span>' : '') +
    '<span class="best-score" title="Out of 100">' + scoreTxt(e.total) + ' / 100</span></div>' +
    (note ? '<p class="best-editorial">' + htmlEsc(note) + '</p>' : '') +
    bestFactsHtml(p, IC) +
    '</div></li>';
};
const podiumHtml = topList.filter((e) => e.podium).map(bestCard).join('\n');
const restHtml = topList.filter((e) => !e.podium).map(bestCard).join('\n');
const bestJsonld = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ItemList',
      name: BEST.h1,
      description: BEST.desc,
      numberOfItems: topList.length,
      itemListElement: topList.map((e) => ({ '@type': 'ListItem', position: e.rank, name: e.p.name, url: SITE + '/p/' + e.p.slug })),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'The best free LLM APIs', item: SITE + '/best/' },
      ],
    },
  ],
});
const bestMain =
  pageHero({ crumbs: `<a href="../">Home</a> / The best`, h1: `${htmlEsc(BEST.h1)}`, lede: `${htmlEsc(BEST.desc)}` }) +
  '<main id="main"><div class="wrap">' +
  '<p class="best-intro">' + bestIntroHtml + '</p>' +
  '<h2 class="best-section">The podium</h2><ol class="best-list best-podium-list">' + podiumHtml + '</ol>' +
  (restHtml ? '<hr class="best-sep" aria-hidden="true"><h2 class="sr-only">Ranks ' + (PODIUM_SIZE + 1) + ' to ' + topList.length + '</h2><ol class="best-list" start="' + (PODIUM_SIZE + 1) + '">' + restHtml + '</ol>' : '') +
  '<p class="count best-note">' + (topList.length < TOP_SIZE ? 'Only ' + topList.length + ' providers meet the minimum evidence today; the list is never padded to ' + TOP_SIZE + '. ' : '') +
  'Computed from the data on ' + htmlEsc(ASOF) + ' — <a href="methodology/">how the score works</a>. Every provider links to its full verified profile.</p>' +
  '</div></main>';
mkdirSync(join(ROOT, 'site/best'), { recursive: true });
writeFileSync(
  join(ROOT, 'site/best/index.html'),
  htmlPage({ title: datedTitle('The best free LLM APIs · Free LLM API Hub'), desc: BEST.desc, canonical: SITE + '/best/', main: bestMain, jsonld: bestJsonld, prefix: '../' })
);

// ---------- /best/methodology/ — the public method of the score ----------
const WEIGHT_LABELS = { quality: 'Model quality', limits: 'Free limits', friction: 'No card, no phone', commercial: 'Commercial use allowed', openai: 'OpenAI-compatible endpoint', stability: 'Stability' };
// Computed, never typed: the sentence is printed only while every provider carries the neutral default.
const editorialNeutral = providers.every((p) => editorialRating(EDITORIAL, p.slug) === EDITORIAL_DEFAULT);
const methodRows = MATH_INPUTS.map((k) => '<tr><td>' + WEIGHT_LABELS[k] + '</td><td class="num">' + SCORE_WEIGHTS[k] + '</td></tr>').join('') +
  '<tr><td>Editorial rating</td><td class="num">' + EDITORIAL_WEIGHT + '</td></tr>';
const methodMain =
  pageHero({ crumbs: `<a href="../../">Home</a> / <a href="../">The best</a> / Methodology`, h1: `How the score works`, lede: `Every provider on /best gets a score from 0 to 100, computed from the data each time the site is built. Data of ${htmlEsc(ASOF)}.` }) +
  '<main id="main"><div class="wrap best-method">' +
  '<h2>The parameters and their weights</h2>' +
  '<table class="best-weights"><thead><tr><th>Part</th><th class="num">Points</th></tr></thead><tbody>' + methodRows + '</tbody></table>' +
  '<h3>Where Model quality comes from</h3>' +
  '<p class="best-quality">The ' + SCORE_WEIGHTS.quality + ' points of <strong>Model quality</strong> come from <code>model_tier</code>, a 0 to 4 rating of the best <em>free</em> model a provider offers. It says how people rate that model, not how capable it is, and it is derived rather than typed. Each model id in a provider\'s <code>models_free</code> is matched by hand to one exact row of the LMArena <a href="https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset">Arena Leaderboard Dataset</a> (CC-BY-4.0, style-control config), and that row\'s rating sets the tier. The match, the rating, the vote count and the snapshot date of every provider are recorded in its <code>model_tier_source</code>, which is what makes the number checkable. A model with no matching row gets no tier: a similar model is never substituted, and a missing tier is never estimated. The score divides the tier by 4 to reach the ' + SCORE_WEIGHTS.quality + ' points, so a provider still to be rated gains nothing from it. The rating thresholds and tier mapping live in <a href="' + REPO + '/blob/main/scripts/lib/model-tier.mjs">scripts/lib/model-tier.mjs</a>; the tier-to-points formula lives in <a href="' + REPO + '/blob/main/scripts/lib/score.mjs">scripts/lib/score.mjs</a>. Those constants stay in code, so they are not restated here. <strong>The <code>tier near a threshold</code> flag</strong> on a <a href="../">/best</a> pick means the tier sits close enough to a rating threshold that the next snapshot could move it. It marks uncertainty, and it does nothing to the score: a flagged provider is ranked on exactly the number it shows.</p>' +
  '<p>Seventy points are mathematical, from six inputs in the public dataset. Thirty points are an <strong>editorial rating</strong> per provider, shown in <a href="' + REPO + '/blob/main/data/editorial.json">data/editorial.json</a> with a public note whenever it moves more than ' + EDITORIAL_NOTE_THRESHOLD + ' points from the default of ' + EDITORIAL_DEFAULT + '. <strong>The internal rubric behind those ratings is not published.</strong></p>' +
  (editorialNeutral ? '<p class="best-neutral"><strong>Today the editorial part is neutral.</strong> Every provider carries the same ' + EDITORIAL_DEFAULT + ' of ' + EDITORIAL_WEIGHT + ' editorial points, so it moves no position: the order is decided by the ' + (100 - EDITORIAL_WEIGHT) + ' measurable points. It stays neutral until a public rubric exists.</p>' : '') +
  '<h2>What the rules guarantee</h2><ul>' +
  '<li><strong>Money scores nothing.</strong> The score reads only the provider\'s own record in the dataset. Paid relationships are in a file apart, listed on <a href="../../agreements/">the agreements page</a>, and they never enter the dataset, the API files or the ranking.</li>' +
  '<li><strong>Missing information is not estimated.</strong> A figure the provider does not publish scores zero, or the middle for the two yes/no requirements. Each provider shows how many of the six inputs are confirmed.</li>' +
  '<li><strong>Minimum evidence.</strong> Only verified providers inside the freshness window that offer text models, and with at least ' + MIN_CONFIRMED + ' of the six inputs confirmed, can enter. The list holds up to ' + TOP_SIZE + ' and is never padded.</li>' +
  '<li><strong>The editorial part cannot outweigh the data.</strong> It can move a provider away from ' + EDITORIAL_DEFAULT + ' only by as much as its confirmed inputs allow.</li>' +
  '<li><strong>Stability is not measured yet.</strong> It needs probes over at least ' + STABILITY_MIN_DAYS + ' days (' + STABILITY_MIN_SAMPLES + ' samples); until then it is unmeasured for everyone.</li>' +
  '<li><strong>Deterministic.</strong> The same data gives the same order; ties break by the mathematical score, then by name.</li></ul>' +
  '<p class="count best-note">Last data update: ' + htmlEsc(ASOF) + '. Full text and every constant: <a href="' + REPO + '/blob/main/docs/methodology.md">docs/methodology.md</a> and <a href="' + REPO + '/blob/main/scripts/lib/score.mjs">scripts/lib/score.mjs</a>.</p>' +
  '</div></main>';
mkdirSync(join(ROOT, 'site/best/methodology'), { recursive: true });
writeFileSync(
  join(ROOT, 'site/best/methodology/index.html'),
  htmlPage({ title: 'How the score works · Free LLM API Hub', desc: 'The parameters, weights and rules behind the Free LLM API Hub top 10: what is measured, what is editorial, and that being a partner scores nothing.', canonical: SITE + '/best/methodology/', main: methodMain, prefix: '../../' })
);

// ---------- /methodology/ and /contributing/ — the two documents of the repository, as pages ----------
// Written from docs/methodology.md and CONTRIBUTING.md with lib/markdown.mjs (no dependency; nothing of the source is passed through as HTML), so the page and
// the file on GitHub cannot say different things. A relative link of the document becomes a link to the file on GitHub, or to the page when the file has one.
const DOC_PAGES = [
  { slug: 'methodology', file: 'docs/methodology.md', title: 'Methodology: how a provider gets on the list · Free LLM API Hub',
    desc: 'How an entry gets on the list, what verified means and does not mean, and how freshness, sourcing, corrections, model tier and the score work.',
    h1: 'Methodology', lede: 'How an entry gets on the list, what “verified” means, and what it does not.' },
  { slug: 'contributing', file: 'CONTRIBUTING.md', title: 'Contributing: add or fix a provider · Free LLM API Hub',
    desc: 'How to add or fix a provider, report a mistake without a pull request, claim an issue, and what happens to your first pull request.',
    h1: 'Contributing', lede: 'How to add or fix a provider, step by step.' },
];
const DOC_LINKS = { repo: REPO, site: SITE, pages: Object.fromEntries(DOC_PAGES.map((d) => [d.file, `/${d.slug}/`])) };
for (const d of DOC_PAGES) {
  mkdirSync(join(ROOT, `site/${d.slug}`), { recursive: true });
  const body = markdownToHtml(readFileSync(join(ROOT, d.file), 'utf8'), { ...DOC_LINKS, from: d.file }).replace(/^<h1[^>]*>.*?<\/h1>\n?/, '');
  writeFileSync(join(ROOT, `site/${d.slug}/index.html`), htmlPage({
    title: d.title, desc: d.desc, canonical: `${SITE}/${d.slug}/`, prefix: '../',
    main: pageHero({ crumbs: `<a href="../">Home</a> / ${htmlEsc(d.h1)}`, h1: d.h1, lede: d.lede }) +
      `<main id="main"><div class="wrap prose doc">${body}` +
      `<p class="muted">This page is written from <a href="${REPO}/blob/main/${d.file}" target="_blank" rel="noopener">${htmlEsc(d.file)}</a> in the repository. To change it, open a pull request there.</p>` +
      `</div></main>`,
  }));
}

// ---------- /submit/ — how to ask us to add, review or correct something ----------
// No form and no email address on purpose: this site is static (no backend), and every request is a public GitHub issue, so
// anyone can see what was asked and what was decided. The links open the issue forms in .github/ISSUE_TEMPLATE/.
const issueForm = (template) => `${REPO}/issues/new?template=${template}`;
const submitRequests = [
  ['Propose a new provider', 'A free tier or a trial-credit LLM API that is not tracked yet. We list what the provider\'s own documentation states.', 'new-provider.yml', 'Propose a provider'],
  ['Report a wrong or stale entry', 'A limit, a requirement or a link that no longer matches the provider\'s own documentation.', 'inaccuracy.yml', 'Report a correction'],
];
// The one address on this page, for business and partnerships only (the address the legal pages already publish). It is plain text, with no
// mailto link: a provider should not have to talk about agreements in a public issue. Data requests stay on the public forms.
const BUSINESS_EMAIL = 'admin@freellmapihub.com';
mkdirSync(join(ROOT, 'site/submit'), { recursive: true });
writeFileSync(
  join(ROOT, 'site/submit/index.html'),
  htmlPage({
    title: 'Submit a provider, a correction or a request · Free LLM API Hub',
    desc: 'Ask us to add a free LLM API or correct an entry through public GitHub issues. Companies and partnerships have one business address.',
    canonical: SITE + '/submit/',
    main:
      pageHero({ crumbs: `<a href="../">Home</a> / Submit`, h1: `Submit`, lede: `Ask us to add, review or correct something. Data requests are public GitHub issues, so anyone can see what was asked and what was decided. Business and partnerships have one address.` }) +
      `<main id="main"><div class="wrap prose">` +
      submitRequests.map(([h, text, template, cta]) => `<section><h2>${htmlEsc(h)}</h2><p>${text}</p><p><a class="btn primary" href="${issueForm(template)}" target="_blank" rel="noopener">${htmlEsc(cta)}</a></p></section>`).join('\n') +
      `<section><h2>Business and partnerships</h2><p>For a partnership, an agreement or a question from a company, write to <strong class="business-email">${BUSINESS_EMAIL}</strong>. Money never changes a score. Corrections and new providers do not go there: use the forms above.</p></section>` +
      `<section><h2>Anything else</h2><p>Questions, ideas and open-ended suggestions go to the <a href="${REPO}/discussions" target="_blank" rel="noopener">GitHub discussions</a>.</p></section>` +
      `<p class="muted">Every entry is checked against the provider's own documentation; see how in the <a href="../methodology/">methodology</a>.</p>` +
      `</div></main>`,
    prefix: '../',
  })
);

// ---------- /coverage/ — what the dataset does not know yet, as a task board ----------
const fieldCoverage = coverage(providers);
mkdirSync(join(ROOT, 'site/coverage'), { recursive: true });
writeFileSync(
  join(ROOT, 'site/coverage/index.html'),
  htmlPage({
    title: 'Data coverage · Free LLM API Hub',
    desc: 'What the free LLM API dataset does not know yet, field by field, with the provider docs and a prefilled issue for every open item: pick one value and add its source.',
    canonical: SITE + '/coverage/',
    main:
      pageHero({ crumbs: `<a href="../">Home</a> / Data coverage`, h1: `Data coverage`, lede: `Where the data is thin, and how to add one value. Every gap links the provider's own docs.` }) +
      coverageMainHtml(fieldCoverage, { repo: REPO, generated: ASOF, prefix: '../', histogram: { ...freshnessHistogram(providers, new Date(ASOF + 'T00:00:00Z')), limit: CLUSTER_LIMIT } }),
    prefix: '../',
  })
);

// ---------- /quality/ — verified share, freshness and how many answers are known, from the data ----------
const qualityTitle = 'Data quality';
const qualityDesc = 'How much of the free LLM API dataset is verified, how fresh it is, and how many answers are known, unknown with a recorded reason, or not checked yet. Computed from the data.';
mkdirSync(join(ROOT, 'site/quality'), { recursive: true });
writeFileSync(
  join(ROOT, 'site/quality/index.html'),
  htmlPage({
    title: `${qualityTitle} · Free LLM API Hub`,
    desc: qualityDesc,
    canonical: SITE + '/quality/',
    main:
      pageHero({ crumbs: `<a href="../">Home</a> / ${qualityTitle}`, h1: qualityTitle, lede: `Verified share, freshness and unknowns, counted from the data. Nothing on this page is typed by hand.` }) +
      qualityMainHtml(quality(providers, ASOF), { prefix: '../', repo: REPO }).replace(
        /<\/div><\/main>$/,
        `${citeBlockHtml(citationRecord(citation))}</div></main>`,
      ),
    prefix: '../',
    jsonld: collectionPageJsonLd({ type: 'WebPage', name: qualityTitle, url: `${SITE}/quality/`, description: qualityDesc, about: datasetRef(SITE), crumbs: [[qualityTitle, `${SITE}/quality/`]] }),
  })
);

// ---------- /coding-tools/ — free AI coding tools, apart from the ranking ----------
// Reads data/coding-tools.json only; nothing here enters a provider count, score or collection.
rmSync(join(ROOT, 'site/coding-tools'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'site/coding-tools'), { recursive: true });
// Both data files, in the order the list page shows them: the free tools, then the ones that run on your own key.
const CODING_TOOL_PAGES = [
  ...codingTools.entries.map((e) => ({ e, group: 'free', generated: codingTools.generated })),
  ...codingToolsOwnKey.entries.map((e) => ({ e, group: 'own-key', generated: codingToolsOwnKey.generated })),
];
const CODING_TOOLS_DESC = 'Coding tools that say they have a free plan, each value with the tool\'s own sentence and the day it was read. A separate list from the ranking of free LLM APIs; not stated is never no.';
// CollectionPage + ItemList + BreadcrumbList, like the guides hub. No Product or Offer: a free plan is a quoted claim, not a price.
const codingToolsJsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage', name: 'Free AI coding tools', description: CODING_TOOLS_DESC,
      url: `${SITE}/coding-tools/`, dateModified: ASOF,
      isPartOf: websiteRef(SITE),
      mainEntity: {
        '@type': 'ItemList', numberOfItems: CODING_TOOL_PAGES.length,
        itemListElement: CODING_TOOL_PAGES.map(({ e }, i) => ({ '@type': 'ListItem', position: i + 1, name: e.name, url: `${SITE}/coding-tools/${e.slug}/` })),
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Free AI coding tools', item: `${SITE}/coding-tools/` },
      ],
    },
  ],
});
writeFileSync(
  join(ROOT, 'site/coding-tools/index.html'),
  htmlPage({
    title: 'Free AI coding tools · Free LLM API Hub',
    desc: CODING_TOOLS_DESC,
    canonical: SITE + '/coding-tools/',
    main:
      pageHero({ crumbs: `<a href="../">Home</a> / Free AI coding tools`, h1: `Free AI coding tools`, lede: `Coding tools that say they have a free plan. Apart from the ranking, and every value written only where the tool's own page says it.` }) +
      codingToolsMainHtml(codingTools, { prefix: '../', repo: REPO, ownKey: codingToolsOwnKey }),
    prefix: '../',
    ogImage: `${SITE}/og/coding-tools.png`,
    styles: ['tables.css'],
    jsonld: codingToolsJsonLd,
  })
);

// One page per tool: /coding-tools/<slug>/. The same data as the list, with the sentence, the source and the day of each value, and the
// values the tool's page does not state shown as «Not stated».
for (const { e, group } of CODING_TOOL_PAGES) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) throw new Error('coding tool slug is not kebab-case: ' + e.slug);
  const canonical = `${SITE}/coding-tools/${e.slug}/`;
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: codingToolTitle(e.name), url: canonical, isPartOf: { '@type': 'WebPage', name: 'Free AI coding tools', url: `${SITE}/coding-tools/` } },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Free LLM API Hub', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Free AI coding tools', item: `${SITE}/coding-tools/` },
          { '@type': 'ListItem', position: 3, name: e.name, item: canonical },
        ],
      },
    ],
  });
  mkdirSync(join(ROOT, `site/coding-tools/${e.slug}`), { recursive: true });
  writeFileSync(
    join(ROOT, `site/coding-tools/${e.slug}/index.html`),
    htmlPage({
      title: codingToolTitle(e.name),
      desc: codingToolDescription(e),
      canonical,
      main:
        pageHero({ crumbs: `<a href="../../">Home</a> / <a href="../">Free AI coding tools</a> / ${htmlEsc(e.name)}`, h1: htmlEsc(e.name), lede: `What the tool's own page says about a free plan, with the sentence and the day it was read.` }) +
        codingToolMainHtml(e, { prefix: '../../', group, others: CODING_TOOL_PAGES.map((x) => x.e).filter((o) => o.slug !== e.slug) }),
      jsonld,
      prefix: '../../',
      ogImage: `${SITE}/og/coding-tools.png`,
      styles: ['tables.css'],
    })
  );
}

// ---------- /data-policy/ — who trains on your data, with the provider's own words ----------
// Reads data_policy only. A row without a recorded sentence says so; "not confirmed" is never "no".
mkdirSync(join(ROOT, 'site/data-policy'), { recursive: true });
writeFileSync(
  join(ROOT, 'site/data-policy/index.html'),
  htmlPage({
    title: 'Who trains on your data · Free LLM API Hub',
    desc: 'The sentence from each free LLM API provider\'s own page about training on prompts, where one is recorded, with the page and the day it was read. Not confirmed is never no.',
    canonical: SITE + '/data-policy/',
    main:
      pageHero({ crumbs: `<a href="../">Home</a> / Who trains on your data`, h1: `Who trains on your data`, lede: `The provider's own sentence about training on prompts, where one is recorded, with its page and the day it was read.` }) +
      dataPolicyMainHtml(dataPolicyRows(providers), { repo: REPO, generated: ASOF, prefix: '../', quotesCheck: quotesCheckHtml() }),
    prefix: '../',
  })
);

// ---------- /agreements/ — every paid relationship, with the labelled blocks (data/sponsorships.json) ----------
// The file is read here and in the provider-page disclosure; never by the score, the API files, llms.txt or the structured data.
const AGREEMENTS = AGREEMENTS_FILE;
mkdirSync(join(ROOT, 'site/agreements'), { recursive: true });
writeFileSync(
  join(ROOT, 'site/agreements/index.html'),
  htmlPage({
    title: 'Agreements and sponsorship · Free LLM API Hub',
    desc: 'Every paid relationship of Free LLM API Hub, with its dates and what each side gets. Paid content is outside the dataset, the API files and the ranking.',
    canonical: SITE + '/agreements/',
    main:
      pageHero({ crumbs: '<a href="../">Home</a> / Agreements', h1: 'Agreements and sponsorship', lede: htmlEsc(NOT_IN_DATA_SENTENCE) }) +
      '<main id="main"><div class="wrap prose">' + agreementsTableHtml(AGREEMENTS, ASOF) +
      '<h2>Where paid items can and cannot appear</h2><p>' + htmlEsc(MACHINE_SENTENCE) + '</p>' +
      inForce(AGREEMENTS, ASOF).map(sponsoredBlockHtml).join('') +
      '</div></main>',
    prefix: '../',
  })
);

// The section "do the quoted pages still say it?" of /data-policy/: the report of npm run verify-quotes, if there is one. The age is computed
// from the dataset's day (noon UTC), never from the clock, so a build is the same on every machine; a small script of the page recomputes
// it when the page is opened, because a static page cannot know how long ago it was built.
function quotesCheckHtml() {
  const file = join(ROOT, 'data/quotes-report.json');
  const registry = JSON.parse(readFileSync(join(ROOT, 'data/quotes.json'), 'utf8'));
  const report = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  return quotesReportHtml(report, registry, Date.parse(`${ASOF}T12:00:00Z`));
}

// ---------- /free-gpu/ — the Free GPU compute section, apart from the ranking ----------
// Reads data/gpu-compute.json only; nothing here enters a provider count, score or collection.
mkdirSync(join(ROOT, 'site/free-gpu'), { recursive: true });
writeFileSync(
  join(ROOT, 'site/free-gpu/index.html'),
  htmlPage({
    title: 'Free GPU compute · Free LLM API Hub',
    desc: 'Services that give free GPU time to run your own model, each value with the provider\'s own sentence and the day it was read. A separate list from the ranking of free LLM APIs.',
    canonical: SITE + '/free-gpu/',
    main:
      pageHero({ crumbs: `<a href="../">Home</a> / Free GPU compute`, h1: `Free GPU compute`, lede: `Free GPU time to run a model yourself. Apart from the ranking, and every value cited to the provider's own page.` }) +
      freeGpuMainHtml(freeGpu, { prefix: '../' }),
    prefix: '../',
    styles: ['tables.css'],
  })
);

// ---------- /not-free/ — the APIs people expect to be free, from data/not-free.json (same source as the README) ----------
{
  const model = notFreeModel(NOT_FREE, { providers, quotes: QUOTES, scoreOf: (slug) => scoreMap[slug]?.total ?? null });
  mkdirSync(join(ROOT, 'site/not-free'), { recursive: true });
  writeFileSync(join(ROOT, 'site/not-free/index.html'), htmlPage({
    title: notFreeTitle(), desc: notFreeDescription(model), canonical: `${SITE}${NOT_FREE_PATH}`, prefix: '../',
    main: notFreeMainHtml(model, { pageHero, site: SITE, prefix: '../' }),
    jsonld: notFreeJsonLd(model, { site: SITE, dateModified: ASOF }),
    ogImage: `${SITE}/og/not-free.png`,
  }));
}

// ---------- /embed/ — "Use the data": widget generator, badges, data files and the citation from CITATION.cff ----------
mkdirSync(join(ROOT, 'site/embed'), { recursive: true });
writeFileSync(join(ROOT, 'site/embed/index.html'), htmlPage({
  title: embedTitle(), desc: embedDescription(publicProviders.length), canonical: `${SITE}${EMBED_PATH}`, prefix: '../',
  main: embedMainHtml({ pageHero, site: SITE, prefix: '../', providers, badgeWidth: BADGE_W, citation: citationRecord(citation), slaDays: FRESH_DAYS }),
  jsonld: collectionPageJsonLd({
    type: 'WebPage', name: 'Use the data', url: `${SITE}${EMBED_PATH}`,
    description: 'Embed the widget or a badge, download the dataset and cite it.',
    about: datasetRef(SITE),
    crumbs: [['Use the data', `${SITE}${EMBED_PATH}`]],
  }),
  // shared-rules.js and shared-sort.js first, so the preview widget finds them on this page and loads nothing else.
  scripts: ['shared-rules.js', 'shared-sort.js', 'widget.js', 'embed.js'],
  ogImage: `${SITE}/og/embed.png`,
}));

// ---------- /compare — provider compare view (#175) ----------
// The interactive view (/compare/?compare=a,b — 2 to 4 slugs) and a small,
// deterministic set of static pages (/compare/<a>-vs-<b>/). Both render the
// table with lib/compare.mjs; the browser loads the same code as
// site/shared-compare.js. Everything here derives from committed data only (no
// current date), because the pages are gitignored and pinned in
// derived-fingerprints.json.
writeFileSync(join(ROOT, 'site/shared-compare.js'), compareLib.clientBundle());
writeFileSync(join(ROOT, 'site/scores.json'), JSON.stringify({ generated: ASOF, scores: scoreMap }, null, 2) + '\n');
rmSync(join(ROOT, 'site/compare'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'site/compare'), { recursive: true });
const compareLinksHtml = (prefix, except = null) => suggestedPairs
  .filter((cp) => cp.path !== except)
  .map((cp) => `<a href="${prefix}compare/${cp.path}/">${htmlEsc(cp.a.name)} vs ${htmlEsc(cp.b.name)}</a>`).join('');
for (const cp of comparePairs) {
  const { a, b } = cp;
  const title = `${a.name} vs ${b.name}`;
  const desc = `${a.name} vs ${b.name}: free tier, rate limits, card, phone and commercial-use requirements, OpenAI compatibility and docs, side by side from the verified dataset.`;
  const main =
    pageHero({ crumbs: `<a href="../../">Home</a> / <a href="../">Compare</a> / ${htmlEsc(title)}`, h1: `${htmlEsc(title)}`, lede: `Both offer ${htmlEsc(cp.shared.join(', '))} on their free plan. Every field below comes from the dataset and is checked against each provider's own docs; <em>not confirmed</em> means nobody has confirmed that field yet — not that the answer is no.` }) +
    `<main id="main"><div class="wrap prose">` +
    tagProviderLinks(compareLib.compareTableHtml([a, b], { prefix: '../../', scores: scoreMap }), [...providerLinkTargets(a), ...providerLinkTargets(b)]) +
    `<div class="prov-actions" style="margin-top:22px"><a class="btn primary" href="../?compare=${a.slug},${b.slug}">Add a provider to this comparison →</a></div>` +
    `<h2>Other comparisons</h2><nav class="colls">${compareLinksHtml('../../', cp.path)}</nav>` +
    `<p class="muted">Expected OpenAI, Anthropic or Mistral here? <a href="../../not-free/">APIs that are not free, and why</a>.</p>` +
    `<p class="prov-back"><a href="../../#explorer">← All providers</a></p>` +
    `</div></main>`;
  const jsonld = comparePageJsonLd({ site: SITE, path: cp.path, a, b });
  mkdirSync(join(ROOT, `site/compare/${cp.path}`), { recursive: true });
  writeFileSync(join(ROOT, `site/compare/${cp.path}/index.html`), htmlPage({
    title: `${title} — free tiers compared · Free LLM API Hub`, desc, canonical: `${SITE}/compare/${cp.path}/`, main, jsonld, prefix: '../../', ogImage: `${SITE}/og/compare.png`,
  }));
}
// Interactive view: a picker that also works as a plain GET form without JS
// (?p=a&p=b — compare.js normalises it to ?compare=a,b), plus the static pages.
const pickerOptions = [...providers].sort((x, y) => x.name.localeCompare(y.name, 'en'))
  .map((p) => `<option value="${htmlEsc(p.slug)}">${htmlEsc(p.name)}</option>`).join('');
const pickerSelects = Array.from({ length: compareLib.COMPARE_MAX }, (_, i) =>
  `<label class="cmp-slot"><span>Provider ${i + 1}${i < compareLib.COMPARE_MIN ? '' : ' (optional)'}</span>` +
  `<select class="sel" name="p"><option value="">—</option>${pickerOptions}</select></label>`).join('');
const otherPairs = comparePairs.filter((cp) => !suggestedPairs.includes(cp));
const compareIndexMain =
  pageHero({ crumbs: `<a href="../">Home</a> / Compare`, h1: `Compare free LLM APIs`, lede: `Pick two to four providers to see their free tiers side by side — limits, card, phone and commercial-use requirements, OpenAI compatibility and the date each was last verified. Share the result: the URL keeps your selection.` }) +
  `<main id="main"><div class="wrap prose">` +
  `<form id="compare-form" class="cmp-form" method="get" action="./">${pickerSelects}<button type="submit" class="btn primary">Compare</button></form>` +
  `<p id="compare-status" class="sr-only" role="status"></p><div id="compare-out" class="cmp-out"></div>` +
  `<h2>Popular comparisons</h2><nav class="colls">${compareLinksHtml('../')}</nav>` +
  // Pairs across categories are not suggested from other pages, but each has a page in the sitemap: list them here
  // so every one is reachable by a link.
  (otherPairs.length ? `<h2>More comparisons</h2><nav class="colls">${otherPairs.map((cp) => `<a href="../compare/${cp.path}/">${htmlEsc(cp.a.name)} vs ${htmlEsc(cp.b.name)}</a>`).join('')}</nav>` : '') +
  `<p class="prov-back"><a href="../#explorer">← All providers</a></p>` +
  `</div></main>`;
writeFileSync(join(ROOT, 'site/compare/index.html'), htmlPage({
  title: 'Compare free LLM APIs side by side · Free LLM API Hub',
  desc: 'Compare two to four free LLM and AI-model APIs side by side: free tier, rate limits, card, phone and commercial-use requirements, OpenAI compatibility and verification date.',
  canonical: `${SITE}/compare/`, main: compareIndexMain, prefix: '../', scripts: ['shared-compare.js', 'compare.js'], ogImage: `${SITE}/og/compare.png`,
  jsonld: collectionPageJsonLd({
    name: 'Compare free LLM APIs', url: `${SITE}/compare/`, crumbs: [['Compare', `${SITE}/compare/`]],
    items: comparePairs.map((cp) => ({ name: `${cp.a.name} vs ${cp.b.name}`, url: `${SITE}/compare/${cp.path}/` })),
  }),
}));

// ---------- /find/: the "Find my free API" wizard ----------
// Questions, filters, hash and result markup live in lib/find.mjs (serialised to site/shared-find.js, the code
// find.test.mjs executes); the page body in lib/find-page.mjs; the interaction in site/find.js. The order is the
// explorer's (recommendedCmp, from shared-rules.js) and every filter is an explorer chip: no ranking of its own.
// The page inlines only the fields the wizard reads, dated by ASOF, so the drift-gated page stays deterministic.
writeFileSync(join(ROOT, 'site/shared-find.js'), findLib.clientBundle());
rmSync(join(ROOT, 'site/find'), { recursive: true, force: true });
mkdirSync(join(ROOT, 'site/find'), { recursive: true });
const findData = `<script type="application/json" id="find-data">${JSON.stringify(findLib.findPayload(publicProviders, ASOF)).replace(/</g, '\\u003c')}</script>`;
writeFileSync(join(ROOT, 'site/find/index.html'), htmlPage({
  title: FIND_TITLE, desc: FIND_DESC, canonical: `${SITE}${FIND_PATH}`, prefix: '../',
  main: findMainHtml({ pageHero, total: providers.length, verified: verifiedCount }) + findData,
  scripts: ['shared-rules.js', 'shared-find.js', 'find.js'], ogImage: `${SITE}/og/find.png`,
  jsonld: findJsonLd({ site: SITE, asof: ASOF }),
}));

// ---------- sitemap.xml (site SEO) ----------
// lastmod is the date the page's content last changed in the DATA, not the build
// date: a provider page moves with its last_verified, a collection or compare page with
// the newest last_verified among the providers it shows, a state report with its month.
// Every input is committed data, so the drift-gated sitemap stays deterministic.
const newest = (dates) => dates.filter(Boolean).sort().pop() || ASOF;
const lastVerified = (ps) => newest(ps.map((p) => p.last_verified));
// The monthly state reports are NOT in this drift-gated sitemap: the months that exist
// follow commit dates, so a PR's own merge commit would add one and fail the gate. They
// get their own git-derived sitemap (below), advertised from robots.txt and never pinned.
const stateLastmod = (month, i, all) => {
  const end = monthEndDate(month);
  return i === all.length - 1 && ASOF < end ? ASOF : end;
};
const sitemapEntries = [
  [`${SITE}/`, ASOF],
  [`${SITE}/models/`, ASOF],
  ...MODEL_GROUPS.filter((g) => isIndexable(g)).map((g) => [`${SITE}/models/${g.key}/`, lastVerified(g.entries.map((e) => e.p))]),
  [`${SITE}/guides-and-collections/`, ASOF],
  [`${SITE}/best/`, ASOF],
  [`${SITE}/best/methodology/`, ASOF],
  [`${SITE}/coverage/`, ASOF],
  [`${SITE}/quality/`, ASOF],
  [`${SITE}/submit/`, ASOF],
  ...DOC_PAGES.map((d) => [`${SITE}/${d.slug}/`, ASOF]),
  [`${SITE}/data-policy/`, ASOF],
  [`${SITE}/agreements/`, AGREEMENTS.generated],
  [`${SITE}/free-gpu/`, freeGpu.generated],
  [`${SITE}/coding-tools/`, codingTools.generated],
  ...CODING_TOOL_PAGES.map(({ e, generated }) => [`${SITE}/coding-tools/${e.slug}/`, generated]),
  [`${SITE}/api/`, ASOF],
  [`${SITE}${EMBED_PATH}`, ASOF],
  [`${SITE}${NOT_FREE_PATH}`, ASOF],
  [`${SITE}/changes/`, ASOF],
  [`${SITE}/programs/`, programs.generated],
  [`${SITE}/programs/startups`, programs.generated],
  [`${SITE}/programs/research`, programs.generated],
  ...GUIDES.map((g) => [`${SITE}/guides/${g.slug}`, ASOF]),
  ...LONG_GUIDE_PAGES.map((g) => [`${SITE}/guides/${g.slug}`, ASOF]),
  // Only the first updates page: the number of /updates/page/N/ pages follows
  // the commit count, so listing them made the drift-gated sitemap change with
  // every merge, whatever the PR touched. Crawlers reach them via pagination.
  ...(commits.length ? [[`${SITE}/updates`, ASOF]] : []),
  ...COLLECTIONS.map((c) => [`${SITE}/collections/${c.slug}`, lastVerified(providers.filter(c.filter))]),
  ...providers.map((p) => [`${SITE}/p/${p.slug}`, p.last_verified || ASOF]),
  [`${SITE}/compare/`, ASOF],
  [`${SITE}${FIND_PATH}`, ASOF],
  ...comparePairs.map((cp) => [`${SITE}/compare/${cp.path}/`, lastVerified([cp.a, cp.b])]),
];
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemapEntries
    .map(([u, d]) => `  <url><loc>${u}</loc><lastmod>${d}</lastmod></url>`)
    .join('\n') +
  `\n</urlset>\n`;
writeFileSync(join(ROOT, 'site/sitemap.xml'), sitemap);
writeFileSync(join(ROOT, 'site/sitemap-state.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  stateReports.map((r, i, all) => `  <url><loc>${SITE}/state/${r.month}/</loc><lastmod>${stateLastmod(r.month, i, all)}</lastmod></url>`).join('\n') +
  `\n</urlset>\n`);
// Both sitemaps behind one index (lib/state-sitemap.mjs): the URL to submit in Search Console. robots.txt keeps
// naming the two sitemaps directly.
writeFileSync(join(ROOT, `site/${SITEMAP_INDEX}`), sitemapIndexXml(SITE, INDEXNOW_SITEMAPS));

// ---------- fingerprint of the gitignored derived files (drift gate) ----------
// derived-fingerprints.json pins every build output under site/ that is
// not tracked by git, so a change to ANY derived file -
// models/, api/, legal/, programs/, llms.txt, shared-* - shows up in
// review and in the CI drift gate, exactly like the tracked regenerated files.
// The set is derived from `git ls-files site/`, so it stays in sync with
// .gitignore automatically. site/p/ is excluded because provider pages render
// verified-Xd-ago relative to the current day, and site/badges/ because each
// per-provider badge colour tracks the age of its verification (both are the
// same deliberate exception as badge-freshness.json; see docs/architecture.md).
// Pinning a date-relative file makes the gate fail on any PR built on a later
// day than main's last regeneration, whatever the PR changes. The git-log-derived files
// are excluded too — updates pages and feed.xml embed the commit hash+subject
// and api/v1/history.json embeds commit dates, so their bytes shift across a
// squash merge and can never be pinned deterministically. They are regenerated
// on every deploy; pinning them caused the post-merge refresh-pin churn this
// removes. It lives at the repo root (not under data/) so a fingerprint-only
// commit never touches a path the updates feed watches.
const isDateRelative = (rel) => rel === 'site/badge-freshness.json' || rel.startsWith('site/p/') || rel.startsWith('site/badges/');
// The weekly change feed (changes/, changes.xml, api/v1/changes.json) and the
// monthly state reports (state/) are mined from the same git history, so they
// are excluded for the same reason.
const isGitLogDerived = (rel) => rel === 'site/feed.xml' || rel === 'site/api/v1/history.json' || rel === 'site/updates.html' || rel.startsWith('site/updates/') ||
  rel === 'site/changes.xml' || rel === 'site/api/v1/changes.json' || rel.startsWith('site/changes/') || rel.startsWith('site/state/') || rel === 'site/sitemap-state.xml';
// ---------- /.well-known/security.txt ----------
// RFC 9116 contact file from SECURITY.md's two channels; its Expires date comes from lib/security-txt.mjs, not the clock.
mkdirSync(join(ROOT, 'site/.well-known'), { recursive: true });
writeFileSync(join(ROOT, 'site/.well-known/security.txt'), securityTxt({ site: SITE, repo: REPO }));

// ---------- asset fingerprints (?v=<hash8>) ----------
// Last step that writes HTML: every page now references styles, scripts and fonts with the hash of their bytes
// (lib/assets.mjs), so they can be cached for a year. It runs before the derived fingerprints so those pin the final pages.
fingerprintSite(join(ROOT, 'site'));

const derivedFingerprints = deriveFingerprints();
if (derivedFingerprints) {
  writeFileSync(join(ROOT, 'derived-fingerprints.json'), JSON.stringify(derivedFingerprints, null, 2) + String.fromCharCode(10));
}

function deriveFingerprints() {
  let tracked;
  try {
    tracked = new Set(execSync('git ls-files site/', { cwd: ROOT, encoding: 'utf8' }).split(String.fromCharCode(10)));
  } catch (_) {
    return null; // no git (tarball build) - leave the committed fingerprint untouched
  }
  const out = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(ROOT, abs).split(String.fromCharCode(92)).join('/');
      // OG assets have their own manifest, including newly generated, untracked images.
      if (rel === 'site/og') continue;
      if (entry.isDirectory()) walk(abs);
      else if (!tracked.has(rel) && !isDateRelative(rel) && !isGitLogDerived(rel)) {
        out[rel] = createHash('sha256').update(readFileSync(abs)).digest('hex');
      }
    }
  };
  walk(join(ROOT, 'site'));
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}


console.log(
  `Built: ${total} providers (${ongoing.length} ongoing, ${trial.length} trial), ` +
  `${verifiedCount} verified, ${freshCount} fresh <${FRESH_DAYS}d, ` +
  `oldest ${oldestAge}d / median ${medianAge}d → badge ${color}. ` +
  `${COLLECTIONS.length} collections, ${providers.length} provider pages + badges, ${comparePairs.length} compare pages + sitemap generated.`
);
