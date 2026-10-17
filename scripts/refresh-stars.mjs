#!/usr/bin/env node
// Writes data/repo-stats.json with the repository's current star count, for build.mjs to render
// into the pages. Network use is confined to this script.
//
//   node scripts/refresh-stars.mjs                      by hand: a problem exits 1 and changes nothing
//   node scripts/refresh-stars.mjs --keep-on-failure    in the deploy workflow: a problem is a warning,
//                                                        the committed number stays, the deploy goes on
//
// With GITHUB_TOKEN set (the deploy workflow passes its own) the call is authenticated; without it the call
// shares the 60-an-hour limit of its IP address, which the runners of a hosted workflow share with others.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_API = 'https://api.github.com/repos/pacocartones/free-llm-api-hub';

/** Asks GitHub for the star count. Resolves to { stars } or { problem }; it never throws. */
export async function fetchStars({ fetchFn = fetch, token = '' } = {}) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'free-llm-api-hub-refresh-stars' };
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try { res = await fetchFn(REPO_API, { headers }); } catch (err) { return { problem: `GitHub could not be reached (${err.message})` }; }
  if (!res.ok) return { problem: `GitHub answered ${res.status}` };
  let body;
  try { body = await res.json(); } catch { return { problem: 'the answer is not JSON' }; }
  const stars = body && body.stargazers_count;
  if (!Number.isInteger(stars) || stars < 0) return { problem: 'no star count in the answer' };
  return { stars };
}

/** The text of data/repo-stats.json for a count and a UTC day. */
export const statsText = (stars, today) => JSON.stringify({ stars, as_of: today }, null, 2) + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const keep = process.argv.includes('--keep-on-failure');
  const { stars, problem } = await fetchStars({ token: process.env.GITHUB_TOKEN || '' });
  if (problem) {
    if (keep) { console.log(`::warning::star count not refreshed: ${problem}; the committed number stays.`); process.exit(0); }
    console.error(`${problem}; data/repo-stats.json not changed.`);
    process.exit(1);
  }
  writeFileSync(join(ROOT, 'data/repo-stats.json'), statsText(stars, new Date().toISOString().slice(0, 10)));
  console.log(`${stars} stars.`);
}
