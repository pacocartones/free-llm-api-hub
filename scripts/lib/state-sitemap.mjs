// state-sitemap.mjs — what a live /sitemap-state.xml must look like.
//
// The monthly /state/YYYY-MM/ reports are listed in a separate, git-derived sitemap
// (build.mjs) because their months follow commit dates and cannot sit in the
// drift-gated sitemap.xml. Being unpinned, it cannot be compared byte for byte with a
// committed copy, so the live check validates its shape instead.

/** Problems with a live sitemap-state.xml body and the robots.txt that must advertise it. */
export function stateSitemapProblems(xml, robots, site) {
  const problems = [];
  const escaped = site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  if (!/<urlset[\s>]/.test(xml)) problems.push('not a <urlset> document');
  if (locs.length === 0) problems.push('lists no /state/YYYY-MM/ report');
  const shape = new RegExp(`^${escaped}/state/\\d{4}-\\d{2}/$`);
  for (const u of locs) if (!shape.test(u)) problems.push(`unexpected URL ${u}`);
  if (new Set(locs).size !== locs.length) problems.push('duplicate URLs');
  if (!new RegExp(`^Sitemap: ${escaped}/sitemap-state\\.xml$`, 'm').test(robots)) {
    problems.push('robots.txt does not advertise /sitemap-state.xml');
  }
  return { problems, locs };
}
