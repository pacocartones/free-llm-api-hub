// Structured data for the index pages that had none: /models/, /changes/, /api/, /updates, /programs/ and the
// static comparisons. Pure functions of their arguments, so the drift-gated pages stay deterministic.
//
// Only types that describe what the page is (CollectionPage, WebPage, ItemList, BreadcrumbList). No Product, Offer
// or rating: the dataset does not verify prices or reviews, and the model-page spec (#711) rules them out.

export const SITE_NAME = 'Free LLM API Hub';

// [[name, url], ...] after the home page, which every trail starts with.
export const breadcrumbList = (site, crumbs) => ({
  '@type': 'BreadcrumbList',
  itemListElement: [[SITE_NAME, `${site}/`], ...crumbs].map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
});

// items: [{ name, url }] on this site. Google only reads list items that are URLs of the same domain.
export const itemList = (name, items) => ({
  '@type': 'ItemList',
  name,
  numberOfItems: items.length,
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: it.url })),
});

export function collectionPageJsonLd({ site, name, url, description, crumbs, items = null, type = 'CollectionPage', about = null }) {
  const page = {
    '@type': type,
    name,
    url,
    ...(description ? { description } : {}),
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${site}/` },
    ...(about ? { about } : {}),
    ...(items && items.length ? { mainEntity: itemList(name, items) } : {}),
  };
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [page, breadcrumbList(site, crumbs)] });
}

// A static comparison: the two provider pages as an ItemList, and the trail Home / Compare / A vs B.
export function comparePageJsonLd({ site, path, a, b }) {
  const title = `${a.name} vs ${b.name}`;
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      itemList(title, [a, b].map((p) => ({ name: p.name, url: `${site}/p/${p.slug}` }))),
      breadcrumbList(site, [['Compare', `${site}/compare/`], [title, `${site}/compare/${path}/`]]),
    ],
  });
}
