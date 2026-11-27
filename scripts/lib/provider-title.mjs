// provider-title.mjs — the question-shaped title of a provider page (/p/<slug>), recommendation 1 of the AEO baseline.
//
// The AEO baseline (27 Nov 2026) found that the pages assistants cite repeat the user's question literally, answer it
// in the title and carry a date. So a provider page is titled by the question a developer types, its one-word answer,
// the short catch and the newest day a fact of the record was read:
//
//   "Is the Groq API free? Yes: 30 RPM, 1,000 RPD, 200K TPD (checked 2026-11-24)"
//   "Does Cerebras have a free API? No: $5 trial, card required (checked 2026-11-27)"
//
// Everything comes from data/providers.json: the question and the answer from `category` (ongoing → "Yes", trial →
// "No", anything else → "Not stated"), the catch from `free_limits` (ongoing) or the credit stated at the start of
// `free_tier` (trial) plus `card_required`, and the date from lib/provider-dates.mjs (last_verified or a later field
// check). A missing date reads "check date not stated" (not-stated.mjs), never the build day. The same question is the
// h1, the <title>, the first clause of the meta description, the JSON-LD name, the first FAQ question and the headings
// of the Markdown twin and llms.txt; the answer-first sentence under the h1 opens with the same answer word.
//
// Titles stay under TITLE_MAX characters (before the " · Free LLM API Hub" suffix): the catch is shortened first, then
// dropped, then the question is asked in its short form ("Is <name> free?"), then a trailing "(…)" is dropped from a
// long name. When nothing fits, the shortest candidate is used.

import { limitFigures } from './provider-meta.mjs';
import { providerDateModified } from './provider-dates.mjs';
import { NOT_STATED, capFirst } from './not-stated.mjs';

export const TITLE_MAX = 65;

/** The answer word of the title and of the answer-first sentence, from `category`. */
export function freeVerdict(p) {
  if (p.category === 'ongoing') return 'Yes';
  if (p.category === 'trial') return 'No';
  return capFirst(NOT_STATED);
}

// "$5 in free credits…", "$1 trial credit", "$10 free credit": the amount, only when free_tier opens with a credit.
const CREDIT_RE = /^(\$\d[\d,.]*(?:\s?[KMB]\b)?)\s+(?:in\s+)?(?:free\s+)?(?:trial\s+)?credits?\b/i;

/** The credit amount stated at the start of `free_tier` ("$5"), or null. */
export function trialCredit(p) {
  const m = String(p.free_tier ?? '').trim().match(CREDIT_RE);
  return m ? m[1].replace(/\s+/g, '') : null;
}

const CARD = { true: 'card required', false: 'no card' };
const RENEWS = { 'renewing-quota': 'quota renews', 'recurring-credit': 'credit renews', perpetual: 'no end date' };

/** The catches to try, longest first, each an array of short phrases ([] = no catch). */
function catchLevels(p) {
  const card = CARD[String(p.card_required)];
  const tail = card ? [card] : [];
  if (p.category === 'ongoing') {
    const figures = limitFigures(p.free_limits);
    const levels = [];
    if (figures.length) for (let k = figures.length; k >= 1; k -= 1) levels.push([...figures.slice(0, k), ...tail]);
    else if (RENEWS[p.free_type]) levels.push([RENEWS[p.free_type], ...tail]);
    if (tail.length) levels.push(tail);
    levels.push([]);
    return levels;
  }
  if (p.category === 'trial') {
    const credit = trialCredit(p);
    const lead = credit ? `${credit} trial` : 'trial credit';
    return [[lead, ...tail], [lead], []];
  }
  return [[]];
}

/** The names to try: the full name, then without a trailing parenthetical ("Google Gemini API (AI Studio)"). */
function nameVariants(name) {
  const short = name.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return short && short !== name ? [name, short] : [name];
}

/** The questions to try for a name: the literal question first, then the short form. */
function questionVariants(p, n) {
  const hasApi = /\bAPI\b/.test(n);
  const literal = p.category === 'trial'
    ? (hasApi ? `Does ${n} have a free tier?` : `Does ${n} have a free API?`)
    : (hasApi ? `Is ${n} free?` : `Is the ${n} API free?`);
  const short = `Is ${n} free?`;
  return literal === short ? [literal] : [literal, short];
}

const dateClause = (date) => (date ? `(checked ${date})` : `(check date ${NOT_STATED})`);

/**
 * The title of a provider page, as { question, verdict, catch, date, title }: `question` is the literal question,
 * `verdict` its answer word, `catch` the short catch ('' when it did not fit), `date` the ISO day or null, and `title`
 * the whole line "<question> <verdict>[: <catch>] (checked <date>)".
 */
export function providerTitle(p, { max = TITLE_MAX } = {}) {
  const verdict = freeVerdict(p);
  const date = providerDateModified(p);
  const candidates = [];
  for (const n of nameVariants(String(p.name ?? '').trim())) {
    for (const question of questionVariants(p, n)) {
      for (const level of catchLevels(p)) {
        const c = level.join(', ');
        candidates.push({ question, verdict, catch: c, date, title: `${question} ${verdict}${c ? `: ${c}` : ''} ${dateClause(date)}` });
      }
    }
  }
  return candidates.find((x) => x.title.length <= max) ?? candidates.reduce((a, b) => (b.title.length < a.title.length ? b : a));
}
