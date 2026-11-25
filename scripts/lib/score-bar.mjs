// score-bar.mjs — how a provider page presents its score (Q13 of the 2026-11-25 audit).
//
// A bare "62.4 / 100" says nothing about where the provider stands or why. The page now leads with its position among
// the scored providers ("#1 of 69"), then a bar of the six mathematical inputs of lib/score.mjs, each segment as wide
// as its weight and filled as far as the provider earns, with an input nobody has confirmed in grey, and the note that
// unknowns lower the score on purpose. The formula is lib/score.mjs, unchanged: this module only draws its numbers.

import { esc } from './escape.mjs';

export const INPUT_LABELS = Object.freeze({
  quality: 'Model quality', limits: 'Free limits', friction: 'No card, no phone',
  commercial: 'Commercial use', openai: 'OpenAI-compatible', stability: 'Stability',
});

const pts = (n) => (Math.round(n * 10) / 10).toString();

/**
 * The score block of a provider page.
 * - position, of: the provider's place among every scored provider, 1-based, and how many there are;
 * - total: the score out of 100; editorial: its editorial points (of `editorialWeight`);
 * - fractions: inputFractions() of lib/score.mjs ({ [input]: { frac, known } }); weights: SCORE_WEIGHTS;
 * - topRank: its place on The Best, or null; prefix: the path to the site root.
 */
export function scoreBlockHtml({ position, of, total, editorial, editorialWeight = 30, fractions, weights, topRank = null, prefix = '../' }) {
  const inputs = Object.keys(weights);
  const rows = inputs.map((k) => {
    const f = fractions[k] || { frac: 0, known: false };
    return { k, label: INPUT_LABELS[k] || k, weight: weights[k], known: f.known === true, points: (Number(f.frac) || 0) * weights[k] };
  });
  const segs = rows.map((r) => r.known
    ? `<span class="sb-seg" style="flex-grow:${r.weight}"><span class="sb-fill" style="width:${Math.round((r.points / r.weight) * 100)}%"></span></span>`
    : `<span class="sb-seg sb-unknown" style="flex-grow:${r.weight}"></span>`).join('');
  const said = rows.map((r) => `${r.label} ${r.known ? `${pts(r.points)} of ${r.weight}` : `not confirmed, ${pts(r.points)} of ${r.weight}`}`).join('; ');
  const legend = rows.map((r) => `<li${r.known ? '' : ' class="sb-u"'}><span class="sb-key" aria-hidden="true"></span>${esc(r.label)} <span class="sb-pts">${r.known ? `${pts(r.points)}/${r.weight}` : `? · ${pts(r.points)}/${r.weight}`}</span></li>`).join('');
  return `<div class="prov-score">` +
    `<p class="score-rank"><strong>#${position} of ${of}</strong> by score <span class="muted">(${pts(total)} / 100)</span>` +
    (topRank ? ` · #${topRank} on <a href="${prefix}best/">The Best</a>` : '') +
    ` · <a href="${prefix}best/methodology/">how it is computed</a></p>` +
    `<div class="score-bar" role="img" aria-label="${esc(`Score inputs: ${said}`)}">${segs}</div>` +
    `<ul class="score-legend">${legend}</ul>` +
    `<p class="muted score-note">Unknowns lower the score on purpose: an input nobody has confirmed (grey) earns nothing, or the neutral middle for card, phone and commercial use. ` +
    `Plus ${pts(editorial)} of ${editorialWeight} editorial points.</p>` +
    `</div>`;
}
