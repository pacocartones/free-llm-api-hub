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

// --- pull-request preview (.github/workflows/regenerate-preview.yml) ------------------------------------------------
//
// Shadow evaluation of the drift gate planned for the switch to direct push (ADR, docs/regeneration-bot.md step C).
// It never blocks a pull request; it says what that gate *would* decide, so the maintainer can measure it on real
// pull requests before relaxing the blocking gate in verify.yml.
//
//   release  the pull request changes `version` in data/providers.json (a release pull request)
//   touched  paths the pull request itself changes (base..head)
//   drift    paths a fresh build (and `og` if needed) changes on top of the pull request
//
// Verdicts:
//   in-sync                nothing to regenerate
//   would-block-release    a release pull request must ship fully regenerated (tag-release.yml tags its merge)
//   would-block-hand-edit  the pull request edits derived files that do not match the build; the bot would
//                          silently overwrite them, so the future gate keeps blocking these
//   bot-would-regenerate   only derived files the pull request did not touch are stale: informative once the bot
//                          pushes (driftGate below lets it pass in push mode)
// `outside` lists drift paths the bot could never write (a build that writes outside the allowlist is a bug).
export const PREVIEW_VERDICTS = Object.freeze(['in-sync', 'would-block-release', 'would-block-hand-edit', 'bot-would-regenerate']);

export const previewVerdict = ({ release = false, touched = [], drift = [] }) => {
  const outside = outsideAllowlist(drift);
  const touchedSet = new Set(touched.filter(isRegenerationTarget));
  const handEdited = drift.filter((p) => touchedSet.has(p));
  let verdict = 'bot-would-regenerate';
  if (drift.length === 0) verdict = 'in-sync';
  else if (release) verdict = 'would-block-release';
  else if (handEdited.length) verdict = 'would-block-hand-edit';
  return { verdict, handEdited, outside };
};

// The version field of a data/providers.json text, or null when it cannot be read (a missing or broken file is not
// a release; validate.mjs reports it).
export const datasetVersion = (text) => {
  try { return JSON.parse(text)?.version ?? null; } catch { return null; }
};

// --- the cut-over (REGEN_MODE=push): what Verify and the deploy decide ---------------------------------------------
//
// Once the bot pushes to main, a data pull request no longer ships its derived files. The drift gate in verify.yml
// then blocks only what the bot cannot or must not fix after the merge: derived files the pull request edited that
// do not match the build (the bot would silently overwrite them), a release pull request that is not fully
// regenerated (tag-release.yml tags its merge), and drift outside the allowlist (the bot refuses to write it).
// Stale derived files the pull request did not touch pass: the bot regenerates them after the merge.
// In any other mode the gate is today's: every drift blocks.
//
//   mode     REGEN_MODE (parsed with parseMode)
//   release  touched drift  as in previewVerdict()
export const driftGate = ({ mode, release = false, touched = [], drift = [] }) => {
  const m = parseMode(mode);
  const { verdict, handEdited, outside } = previewVerdict({ release, touched, drift });
  if (m !== 'push') {
    return { mode: m, verdict, handEdited, outside, block: drift.length > 0,
      reason: drift.length ? 'derived files are out of sync and the bot does not push to main (REGEN_MODE is not push)' : 'derived files are in sync' };
  }
  if (outside.length) return { mode: m, verdict, handEdited, outside, block: true, reason: 'the build changed paths the bot may not write' };
  const block = verdict === 'would-block-release' || verdict === 'would-block-hand-edit';
  const reason = {
    'in-sync': 'derived files are in sync',
    'bot-would-regenerate': 'only derived files this pull request did not touch are stale; the bot regenerates them after the merge',
    'would-block-hand-edit': 'this pull request edits derived files that do not match the build',
    'would-block-release': 'a release pull request must ship fully regenerated',
  }[verdict];
  return { mode: m, verdict, handEdited, outside, block, reason };
};

// The inputs that start regenerate.yml on a push to main (its `paths` filter, which a test keeps equal to this).
// pages.yml uses it in push mode: a push that touches one of them is deployed after the bot's run instead (the
// workflow_run trigger), so the site is never published from a main whose committed derived files are stale.
export const REGENERATE_INPUTS = Object.freeze([
  'data/**', '!data/probe-report.json', 'scripts/**', 'CONTRIBUTING.md', 'docs/methodology.md', '.github/workflows/regenerate.yml',
]);
export const startsRegeneration = (path) => typeof path === 'string' && path !== 'data/probe-report.json'
  && (path.startsWith('data/') || path.startsWith('scripts/')
    || ['CONTRIBUTING.md', 'docs/methodology.md', '.github/workflows/regenerate.yml'].includes(path));

// Whether pages.yml deploys this run.
//   event       github.event_name
//   actor       github.actor; botLogin the App's login (`<slug>[bot]`, may be empty)
//   changed     paths of the push (null when they cannot be listed: a new branch or a force push)
//   conclusion  headBranch  of the finished "Regenerate derived files" run (workflow_run only)
// Outside push mode it deploys as before on push, schedule and manual runs, and ignores workflow_run (the push
// already deployed). In push mode a push the bot will follow is skipped, and the finished bot run deploys.
export const pagesDeploy = ({ mode, event, actor = '', botLogin = '', changed = null, conclusion = '', headBranch = '' }) => {
  const m = parseMode(mode);
  if (event === 'workflow_run') {
    if (m !== 'push') return { deploy: false, reason: `REGEN_MODE is ${m}: the push itself deployed` };
    if (headBranch !== 'main') return { deploy: false, reason: `the regeneration ran on ${headBranch || 'an unknown branch'}, not main` };
    if (conclusion !== 'success') return { deploy: false, reason: `the regeneration run ended ${conclusion || 'without a conclusion'}` };
    return { deploy: true, reason: 'the regeneration run on main finished' };
  }
  if (event !== 'push' || m !== 'push') return { deploy: true, reason: `${event}, mode ${m}` };
  if (botLogin && actor === botLogin) return { deploy: false, reason: 'a push by the bot: its finished run deploys (workflow_run)' };
  if (!Array.isArray(changed)) return { deploy: true, reason: 'the pushed paths could not be listed' };
  const inputs = changed.filter(startsRegeneration);
  if (inputs.length) return { deploy: false, reason: `the push changes regeneration inputs (${inputs.slice(0, 5).join(', ')}): the bot's run deploys` };
  return { deploy: true, reason: 'the push changes no regeneration input' };
};
