// Explicitly fetched origin tags are kept apart from arbitrary local tags.
// Populate/prune this namespace using the command in docs/release-preparation.md.
import { execFileSync } from 'node:child_process';
export const ORIGIN_TAGS = 'refs/remotes/origin/tags/';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export function officialDatasetTag(cwd, tag) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag || '')) throw new Error('Expected dataset tag vX.Y.Z.');
  const ref = `${ORIGIN_TAGS}${tag}`;
  const commit = git(cwd, 'rev-parse', '--verify', `${ref}^{commit}`);
  git(cwd, 'merge-base', '--is-ancestor', commit, 'refs/remotes/origin/main');
  const data = JSON.parse(git(cwd, 'show', `${commit}:data/providers.json`));
  if (`v${data.version}` !== tag) throw new Error('Tag and dataset version disagree.');
  return { tag, commit };
}
export function latestOfficialDatasetTag(cwd) {
  const refs = git(cwd, 'for-each-ref', '--merged=HEAD', '--sort=-version:refname', '--format=%(refname)', ORIGIN_TAGS);
  for (const ref of refs.split('\n').filter(Boolean)) {
    try { return officialDatasetTag(cwd, ref.slice(ORIGIN_TAGS.length)).tag; }
    catch { /* A remote tag with a non-dataset name/version is not a baseline. */ }
  }
  throw new Error('No reachable official dataset tag found; fetch origin tags as documented in docs/release-preparation.md.');
}
