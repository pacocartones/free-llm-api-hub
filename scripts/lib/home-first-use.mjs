// home-first-use.mjs — the "New here?" strip on the home page, between the hero and the explorer controls.
// It is a <details>, closed by default: one line above the explorer, so the search box and filters stay in the first
// desktop viewport (audit 2026-11-25, Q2), while the text stays in the page for readers who open it and for crawlers.
//
// A visitor arriving from a search engine sees the explorer before anything says what the list is, what
// "verified" means here or how to use the data (live audit 2026-11-24, UX-1). The strip answers those three
// questions in a few lines and links to the methodology, the JSON API and the change log.
//
// Every number and date in it comes from data/providers.json, never from typed prose: the counts, and the
// oldest and newest last_verified dates of the verified entries. The dates are absolute (not "N days ago"),
// so the server render is deterministic and explorer.js has nothing to repaint.

import { esc } from './escape.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The figures the strip quotes, derived from the provider records. */
export function firstUseFacts(providers) {
  const list = Array.isArray(providers) ? providers : [];
  const verifiedDates = list
    .filter((p) => p && p.verified === true && typeof p.last_verified === 'string' && ISO_DATE.test(p.last_verified))
    .map((p) => p.last_verified)
    .sort();
  const verified = list.filter((p) => p && p.verified === true).length;
  return {
    total: list.length,
    ongoing: list.filter((p) => p && p.category === 'ongoing').length,
    trial: list.filter((p) => p && p.category === 'trial').length,
    verified,
    unverified: list.length - verified,
    oldestVerified: verifiedDates[0] || null,
    newestVerified: verifiedDates[verifiedDates.length - 1] || null,
  };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const time = (d) => `<time datetime="${esc(d)}">${esc(d)}</time>`;

/**
 * The strip's markup. `slaDays` is the re-verification limit from lib/rules.mjs (SLA_DAYS).
 * Links are relative to the site root (the home page lives there).
 */
export function firstUseHtml(providers, { slaDays }) {
  const f = firstUseFacts(providers);
  const range = f.oldestVerified
    ? (f.oldestVerified === f.newestVerified
      ? ` The date is ${time(f.oldestVerified)}.`
      : ` The dates run from ${time(f.oldestVerified)} to ${time(f.newestVerified)}.`)
    : '';
  const flagged = f.unverified
    ? ` ${plural(f.unverified, 'entry', 'entries')} could not be confirmed from an official source and ${f.unverified === 1 ? 'is' : 'are'} marked ⚠, not hidden.`
    : '';
  const oldest = f.oldestVerified
    ? `<p class="fu-signal"><svg class="fu-i" aria-hidden="true"><use href="#ic-shield"/></svg><span>Oldest verification: ${time(f.oldestVerified)}. Each entry is due for a re-check ${slaDays} days after its date.</span></p>`
    : '';
  return `<section class="first-use" aria-labelledby="first-use-h">
  <div class="wrap">
    <details class="fu-details">
    <summary><h2 id="first-use-h" class="fu-h">New here? How this list works</h2></summary>
    <div class="fu-grid">
      <div class="fu-card">
        <h3><svg class="fu-i" aria-hidden="true"><use href="#ic-database"/></svg>What this is</h3>
        <p>An open, MIT-licensed dataset of ${f.total} free LLM and AI-model APIs: ${plural(f.ongoing, 'ongoing free tier', 'ongoing free tiers')} and ${plural(f.trial, 'trial credit', 'trial credits')}, listed apart. It is independent: not affiliated with or sponsored by any provider on it.</p>
        <p class="fu-links"><a href="#explorer">Browse the providers</a></p>
      </div>
      <div class="fu-card">
        <h3><svg class="fu-i" aria-hidden="true"><use href="#ic-shield"/></svg>How we verify</h3>
        <p>${f.verified} of ${f.total} entries are verified: the free tier, its limits and its main catch were read on the provider’s own docs on a recorded date.${range}${flagged}</p>
        <p class="fu-links"><a href="methodology/">What “verified” means</a></p>
      </div>
      <div class="fu-card">
        <h3><svg class="fu-i" aria-hidden="true"><use href="#ic-doc"/></svg>How to use it</h3>
        <p>Filter the table by no card, no phone, commercial use or OpenAI-compatible, then open a provider for its limits and sources. The same data is available as JSON. Terms change without notice: confirm with the provider before you ship.</p>
        <p class="fu-links"><a href="api/">JSON API</a> <a href="changes/">What changed</a></p>
      </div>
    </div>
    ${oldest}
    </details>
  </div>
</section>`;
}
