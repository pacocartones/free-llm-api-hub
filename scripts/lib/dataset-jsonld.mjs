// dataset-jsonld.mjs — the schema.org Dataset block on the home page, for Google Dataset Search.
//
// Built from the committed data only, so the build stays byte-stable for a given dataset:
// - identity (title, abstract, keywords, creator, licence, repository) from CITATION.cff, the file the repository
//   already uses to say how the dataset is cited — nothing typed twice;
// - version, dateModified and temporalCoverage from data/providers.json (no clock).
//
// Google's Dataset guide (developers.google.com/search/docs/appearance/structured-data/dataset) requires `name` and
// `description` (50–5000 characters) and, for each `distribution`, a `contentUrl`. It says `citation` is for related
// articles, not for citing the dataset itself, so no `citation` is emitted: CITATION.cff names no article.
// The GitHub release assets are not listed as a distribution: a release is published by hand after the version bump is
// tagged (RELEASING.md), so its download URL can 404 for a while after the site deploys with the new version.

const unquote = (s) => s.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

/** The few CITATION.cff fields the Dataset block uses. A tiny reader for this file's flat layout, not a YAML parser. */
export function parseCitation(text) {
  const lines = String(text).split(/\r?\n/);
  const out = { keywords: [] };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    if ((m = line.match(/^(title|url|repository-code|license|version):\s*(.+)$/))) out[m[1]] = unquote(m[2]);
    else if ((m = line.match(/^abstract:\s*>-?\s*$/))) {
      const body = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) body.push(lines[++i].trim());
      out.abstract = body.join(' ');
    } else if (/^keywords:\s*$/.test(line)) {
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) out.keywords.push(unquote(lines[++i].replace(/^\s+-\s+/, '')));
    } else if (/^authors:\s*$/.test(line)) {
      const author = {};
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        const a = lines[++i].replace(/^\s+-?\s*/, '').match(/^(alias|name|given-names|family-names|website):\s*(.+)$/);
        if (a) author[a[1]] = unquote(a[2]);
      }
      out.author = author;
    }
  }
  return out;
}

// The non-text modalities the dataset covers, kept from the hand-written block this replaced (CITATION.cff lists none).
const MODALITY_KEYWORDS = ['free image api', 'free speech api', 'free embeddings api', 'free ocr api'];

// The fields a reader filters on, named as in data/schema.json. Descriptions follow the schema and docs/api.md.
export const VARIABLES = [
  ['category', 'Primary bucket: an ongoing free tier or a one-off trial credit.'],
  ['free_type', 'Finer-grained shape of the free access: perpetual, renewing quota, recurring credit or trial credit.'],
  ['free_tier', 'What you get for free, in concrete terms, as the provider states it.'],
  ['rate_limits', 'Free-tier rate limits as the provider states them.'],
  ['card_required', 'Whether a payment card is required to use the free access (true, false, or null when not stated).'],
  ['phone_required', 'Whether a phone number is required to sign up (true, false, or null when not stated).'],
  ['commercial_ok', 'Whether the free access may be used commercially (true, false, or null when not stated).'],
  ['openai_compatible', 'Whether the free offering exposes an OpenAI-compatible endpoint (null when unconfirmed).'],
  ['modalities', 'Modalities reachable on the free tier (text, image, audio, embeddings, rerank, OCR, vision).'],
  ['data_policy.trains_on_prompts', 'Whether the provider says it trains on prompts sent through the free access (null when not recorded).'],
  ['last_verified', 'Date the core facts were last confirmed against the provider\'s own documentation.'],
];

const verifiedDates = (data) => (data.providers ?? [])
  .map((p) => p.last_verified)
  .filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
  .sort();

/**
 * The Dataset object. `site` is the origin without a trailing slash; `asOf` is the public data date (datasetAsOf).
 * temporalCoverage spans the oldest to the newest verification date in this snapshot.
 */
export function datasetJsonLd({ data, citation, site, asOf }) {
  const c = citation;
  const dates = verifiedDates(data);
  const repo = c['repository-code'];
  const author = c.author ?? {};
  const creatorName = author.name ?? ([author['given-names'], author['family-names']].filter(Boolean).join(' ') || author.alias);
  const obj = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Free LLM API Hub',
    alternateName: c.title,
    description: c.abstract,
    url: `${site}/`,
    sameAs: repo,
    identifier: repo,
    version: data.version,
    dateModified: asOf,
    keywords: [...new Set([...c.keywords, ...MODALITY_KEYWORDS])],
    license: c.license === 'MIT' ? 'https://opensource.org/licenses/MIT' : undefined,
    isAccessibleForFree: true,
    creator: { '@type': 'Person', name: creatorName, url: author.website },
    temporalCoverage: dates.length ? `${dates[0]}/${dates[dates.length - 1]}` : undefined,
    variableMeasured: VARIABLES.map(([name, description]) => ({ '@type': 'PropertyValue', name, description })),
    distribution: [
      { '@type': 'DataDownload', name: 'Full dataset, API v1 (JSON)', encodingFormat: 'application/json', contentUrl: `${site}/api/v1/providers.json` },
      { '@type': 'DataDownload', name: 'Full dataset (JSON)', encodingFormat: 'application/json', contentUrl: `${site}/providers.json` },
      { '@type': 'DataDownload', name: 'Scalar fields (CSV)', encodingFormat: 'text/csv', contentUrl: `${site}/providers.csv` },
      { '@type': 'DataDownload', name: 'Full dataset as Markdown text, for language models (llms-full.txt)', encodingFormat: 'text/plain', contentUrl: `${site}/llms-full.txt` },
    ],
  };
  return JSON.parse(JSON.stringify(obj)); // drops undefined fields
}

/** The block as it goes into the page: "<" written as \u003c so data can never close the script element. */
export const datasetJsonLdScript = (obj) =>
  `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, '\\u003c')}\n</script>`;

/**
 * Google's requirements plus our own: a list of errors, empty when the block is valid.
 * `siteFile(url)` returns true when a site URL exists in the build.
 */
export function datasetJsonLdErrors(obj, { site, siteFile }) {
  const errors = [];
  if (obj?.['@context'] !== 'https://schema.org' || obj?.['@type'] !== 'Dataset') errors.push('not a schema.org Dataset');
  if (typeof obj?.name !== 'string' || !obj.name.trim()) errors.push('name is required');
  const d = obj?.description;
  if (typeof d !== 'string' || d.length < 50 || d.length > 5000) errors.push('description must be 50–5000 characters');
  for (const k of ['url', 'sameAs', 'license', 'version', 'dateModified', 'temporalCoverage', 'creator', 'keywords', 'variableMeasured']) {
    if (obj?.[k] === undefined) errors.push(`${k} is missing`);
  }
  if (obj?.isAccessibleForFree !== true) errors.push('isAccessibleForFree must be true');
  if (obj?.temporalCoverage && !/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/.test(obj.temporalCoverage)) errors.push('temporalCoverage must be an ISO 8601 interval');
  if (!Array.isArray(obj?.distribution) || !obj.distribution.length) errors.push('distribution is missing');
  for (const dl of obj?.distribution ?? []) {
    if (dl['@type'] !== 'DataDownload' || !dl.contentUrl) { errors.push('every distribution needs a DataDownload contentUrl'); continue; }
    if (!dl.encodingFormat) errors.push(`${dl.contentUrl}: encodingFormat is missing`);
    if (dl.contentUrl.startsWith(`${site}/`) && !siteFile(dl.contentUrl)) errors.push(`${dl.contentUrl} is not in the build`);
  }
  if (obj?.url?.startsWith(`${site}/`) && !siteFile(obj.url)) errors.push(`${obj.url} is not in the build`);
  return errors;
}
