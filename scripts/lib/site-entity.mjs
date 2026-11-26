// site-entity.mjs — who publishes the site and the dataset, for structured data.
//
// One place for the WebSite, its publisher and its creator, so every page that names the site or the dataset says
// the same thing. The publisher is the copyright holder in LICENSE ("Tweakeo, Inc. and contributors"); the creator is
// the maintainer, credited by name and by the GitHub account that CITATION.cff lists. No email or postal address.
//
// Stable `@id`s (`<site>/#website`, `#dataset`, `#publisher`, `#creator`) let a search engine join the nodes: the home
// page carries the full nodes, other pages refer to them with the same `@id` and a few properties of their own.

export const SITE_NAME = 'Free LLM API Hub';
export const SITE_ALTERNATE_NAME = 'freellmapihub.com';
export const PUBLISHER_NAME = 'Tweakeo, Inc.';
export const CREATOR = { name: 'Paco Cartones', alternateName: 'pacocartones', url: 'https://github.com/pacocartones' };

export const entityIds = (site) => ({
  website: `${site}/#website`,
  dataset: `${site}/#dataset`,
  publisher: `${site}/#publisher`,
  creator: `${site}/#creator`,
});

export const publisherNode = (site) => ({ '@type': 'Organization', '@id': entityIds(site).publisher, name: PUBLISHER_NAME });

export const creatorNode = (site) => ({
  '@type': 'Person', '@id': entityIds(site).creator, name: CREATOR.name, alternateName: CREATOR.alternateName, url: CREATOR.url, sameAs: [CREATOR.url],
});

/** The full WebSite node, for the home page. `repo` is the GitHub repository URL. */
export const websiteNode = ({ site, repo }) => ({
  '@type': 'WebSite',
  '@id': entityIds(site).website,
  name: SITE_NAME,
  alternateName: SITE_ALTERNATE_NAME,
  url: `${site}/`,
  inLanguage: 'en',
  publisher: { '@id': entityIds(site).publisher },
  creator: { '@id': entityIds(site).creator },
  ...(repo ? { sameAs: [repo] } : {}),
});

// What another page says about the site or the dataset it belongs to: the same @id, with the publisher and the
// creator inline (a page's JSON-LD cannot refer to nodes defined only on the home page).
const authorship = (site) => ({
  publisher: { '@type': 'Organization', '@id': entityIds(site).publisher, name: PUBLISHER_NAME },
  creator: { '@type': 'Person', '@id': entityIds(site).creator, name: CREATOR.name, url: CREATOR.url },
});

export const websiteRef = (site) => ({ '@type': 'WebSite', '@id': entityIds(site).website, name: SITE_NAME, url: `${site}/`, ...authorship(site) });

// A Dataset node needs a `description` (and should carry a `license`) wherever it appears, or Google marks it invalid:
// `facts` is { description, license } from lib/structured-data.mjs (datasetFacts), the same on every page.
export const datasetRef = (site, facts) => {
  if (!facts?.description || !facts?.license) throw new Error('datasetRef needs the dataset description and license (datasetFacts)');
  return { '@type': 'Dataset', '@id': entityIds(site).dataset, name: SITE_NAME, description: facts.description, license: facts.license, url: `${site}/`, ...authorship(site) };
};
