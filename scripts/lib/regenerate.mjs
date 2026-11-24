// regenerate.mjs — the decisions of the post-merge regeneration workflow (.github/workflows/regenerate.yml),
// kept here so they are tested instead of living as inline shell in YAML.
//
// It imports only scripts/generated-targets.mjs, which has no npm dependencies: the `publish` job re-checks the
// allowlist with this file without installing anything (defence in depth against a compromised npm dependency in
// the `build` job).
import { isGeneratedOutput } from '../generated-targets.mjs';

// Every commit the bot writes starts with this subject prefix. A push whose head commit carries it is never
// regenerated again (loop guard, second layer after the workflow's `paths` filter).
export const BOT_COMMIT_PREFIX = 'chore(generated):';

// The branch the shadow pull request comes from. It matches the `<type>/<slug>` rule of
// scripts/check-commit-policy.sh, so the bot's pull request passes the branch-name rule.
export const SHADOW_BRANCH = 'chore/regenerate-derived';

// REGEN_MODE (a repository variable): `shadow` opens a pull request, `push` commits to main (needs the App in the
// ruleset bypass list). Anything else, unset included, disables the workflow.
export const MODES = Object.freeze(['off', 'shadow', 'push']);
export const parseMode = (value) => {
  const mode = String(value ?? '').trim().toLowerCase();
  return MODES.includes(mode) ? mode : 'off';
};

// The paths the bot may write: what the build writes (scripts/generated-targets.mjs) plus site/og/**, written by
// og.mjs and checked by check-og.mjs. Everything else (data/providers.json, CHANGELOG.md, changes/**, package*.json,
// .github/**, every *.js and *.css) is outside on purpose.
export const isRegenerationTarget = (path) => typeof path === 'string' && path !== ''
  && !path.split('/').includes('..') && !path.startsWith('/')
  && (isGeneratedOutput(path) || (path.startsWith('site/og/') && !/\.(js|css)$/.test(path)));

export const outsideAllowlist = (paths) => paths.filter((p) => !isRegenerationTarget(p));

// Whether this run should rebuild at all. `event` is github.event_name, `actor` github.actor, `botLogin` the App's
// login (`<slug>[bot]`, may be empty while no App is configured), `headMessage` the full message of main's tip.
// The actor and message rules apply to pushes only: a scheduled or manual run is idempotent and always welcome.
export const loopGuard = ({ mode, event, actor = '', botLogin = '', headMessage = '' }) => {
  const m = parseMode(mode);
  if (m === 'off') return { run: false, reason: 'REGEN_MODE is not shadow or push: the workflow is disabled' };
  if (event === 'push') {
    if (botLogin && actor === botLogin) return { run: false, reason: `the push was made by the bot (${actor})` };
    if (actor === 'github-actions[bot]') return { run: false, reason: 'the push was made by GITHUB_TOKEN' };
    if (headMessage.trimStart().startsWith(BOT_COMMIT_PREFIX)) {
      return { run: false, reason: `main's tip is a bot commit (${BOT_COMMIT_PREFIX})` };
    }
  }
  return { run: true, reason: `mode ${m}, event ${event}` };
};
