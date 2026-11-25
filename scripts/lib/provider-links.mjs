// provider-links.mjs — marks the links that leave the site for a provider's own pages with two neutral data attributes,
// data-provider (the slug) and data-link (what the page is: docs, keys, website, playground, models, limits_source,
// data_policy). The consent script's product events read them (outbound_provider_click, only with analytics consent);
// without analytics they are inert markup.

import { htmlEsc } from './rows.mjs';

export const LINK_TYPES = ['docs', 'keys', 'website', 'playground', 'models', 'limits_source', 'data_policy'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * The provider's own pages as [{ href, provider, link }], highest priority first: when two fields hold the same URL, the
 * first label wins.
 */
export function providerLinkTargets(p, { website = '' } = {}) {
  const http = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u) ? u : '');
  const out = [];
  const add = (href, link) => { if (href && !out.some((t) => t.href === href)) out.push({ href, provider: p.slug, link }); };
  add(http(p.docs_url), 'docs');
  add(http(p.keys_url), 'keys');
  add(http(p.playground_url), 'playground');
  add(http(website), 'website');
  add(http(p.models_url), 'models');
  add(http(p.free_limits && p.free_limits.source), 'limits_source');
  add(http(p.data_policy && p.data_policy.source), 'data_policy');
  return out;
}

/** Adds data-provider / data-link to every <a> whose href is one of the targets and that has no data-link yet. */
export function tagProviderLinks(html, targets) {
  const byHref = new Map();
  for (const t of targets) {
    if (!SLUG.test(t.provider) || !LINK_TYPES.includes(t.link)) throw new Error(`bad provider link target ${JSON.stringify(t)}`);
    for (const form of [t.href, htmlEsc(t.href)]) if (!byHref.has(form)) byHref.set(form, t);
  }
  return html.replace(/<a ([^>]*?)href="([^"]*)"([^>]*)>/g, (m, before, href, after) => {
    const t = byHref.get(href);
    if (!t || /\bdata-link=/.test(before + after)) return m;
    return `<a ${before}href="${href}"${after} data-provider="${t.provider}" data-link="${t.link}">`;
  });
}
