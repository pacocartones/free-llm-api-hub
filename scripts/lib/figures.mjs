// figures.mjs — provider counts quoted in prose are derived from data/providers.json.
//
// "69 verified providers" was typed by hand into README.md and data/best.json and
// outlived the dataset it described (68 providers, 67 verified). Prose that quotes a
// count now holds a token ({verified}, {providers}) or an inline README marker, and
// build.mjs fills it from the data. figureErrors() is the guard: it finds any literal
// count in a text and reports it when it disagrees with the data. validate.mjs runs
// it over the sources; build.mjs and the tests run it over the generated output.

export function providerFigures(providers) {
  return { providers: providers.length, verified: providers.filter((p) => p.verified).length };
}

/** Fill {providers} / {verified} tokens in a string. */
export function expandFigures(text, figs) {
  return String(text).replace(/\{(providers|verified)\}/g, (_m, k) => String(figs[k]));
}

/** Fill the numbers between <!-- FIG:name -->…<!-- /FIG --> markers (README prose). */
export function injectInlineFigures(md, figs) {
  return md.replace(/(<!-- FIG:(providers|verified) -->)[^<]*(<!-- \/FIG -->)/g, (_m, open, k, close) => `${open}${figs[k]}${close}`);
}

// Phrases that state a dataset-wide count. "N verified providers" is the verified
// count; "all N providers" and "N of the M providers" style claims are the total.
// Deliberately narrow: "10 providers in the mined history" is not a dataset figure.
const RULES = [
  { re: /\b(\d+) verified providers\b/g, key: 'verified', label: 'verified providers' },
  { re: /\ball (\d+) providers\b/g, key: 'providers', label: 'providers' },
];

// "N/M providers": the denominator is a dataset-wide count, so it must be the total or the verified count.
const RATIO = /\b(\d+)\/(\d+) providers\b/g;

/** Every literal dataset count in `text` that disagrees with `figs`. `where` names the source. */
export function figureErrors(text, figs, where) {
  const errors = [];
  // Markers are rewritten by the build, so only count prose outside them.
  const prose = String(text).replace(/<!-- FIG:\w+ -->[^<]*<!-- \/FIG -->/g, '');
  for (const { re, key, label } of RULES) {
    for (const m of prose.matchAll(re)) {
      if (Number(m[1]) !== figs[key]) {
        errors.push(`${where}: says "${m[0]}" but data/providers.json has ${figs[key]} ${label} — use {${key}} or a FIG marker so the build derives it`);
      }
    }
  }
  for (const m of prose.matchAll(RATIO)) {
    if (Number(m[2]) !== figs.providers && Number(m[2]) !== figs.verified) {
      errors.push(`${where}: says "${m[0]}" but data/providers.json has ${figs.providers} providers (${figs.verified} verified) — derive the figure or drop it`);
    }
  }
  return errors;
}
