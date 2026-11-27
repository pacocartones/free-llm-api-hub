# Merge manager (merge trains in GitHub Actions)

The merge manager merges the pull requests a maintainer approved, after the required checks have passed **on the combination** of `main` and every approved pull request. It runs in GitHub Actions on events, costs nothing on a public repository, and spends no personal API quota.

It replaces the local loop (`queue.sh` + `train.sh` + `heal.sh`) that ran on the maintainer's PC and polled GitHub every 150 s with a personal token shared by about ten agent sessions.

- Part 1 is the **general pattern**: it applies to any repository without GitHub's native merge queue (personal accounts, free plans) and is meant to be copied into a playbook.
- Part 2 is **how this repository runs it**: files, variables, settings, rollout.

---

## Part 1 — The pattern

### Why trains

When "require branches to be up to date before merging" is off (it is too expensive with many open pull requests: every merge would force every other pull request to re-run CI), two pull requests that are each green can still break `main` together. It happened here with #920 + #922. A train fixes that at the cost of one CI round per batch, not per pull request:

1. Build a branch = `main` + approved green pull requests merged in order (one that conflicts with an earlier member is left for the next train).
2. Open it as a pull request, so the required checks run once on exactly that tree.
3. If it is green and `main` has not moved (except by a bot that only rewrites generated files), merge each **original** pull request with the head that was tested (`sha` / `--match-head-commit`), in the same order. Close the train and delete its branch.

Merging the originals (instead of the train branch) keeps the history, the pull-request links and the authors exactly as with a manual merge.

### Rules

1. **Act only on explicit approval.** A label (`merge-train`) is the queue. Only a list of allowed accounts may add it (checked from the label's timeline event); a label from anyone else is removed. New commits on an approved **fork** pull request void the approval at once.
2. **Never run pull-request code with a secret.** The manager fetches pull-request commits as git objects and merges them; it installs nothing and runs only the default branch's own script. A local `.git/info/attributes` (`* !merge !filter !diff`) overrides any merge driver or filter a branch's `.gitattributes` asks for.
3. **Split the trigger from the actor.** Pull-request events (`pull_request_target`, `workflow_run`) only *dispatch* the manager on the default branch, from a tiny workflow that checks nothing out. The manager itself starts only from `workflow_dispatch` and `schedule`, so it always runs trusted code, and repository rules against privileged triggers stay simple.
4. **Read once, write rarely.** One GraphQL query per run reads every approved pull request (labels, mergeability, review threads, who labelled it, the required checks on the head) and every open train. Git (anonymous fetches of a public repository) answers the rest for free: is the head up to date with `main`, which files it touches, what moved on `main`. Writes happen only when a decision needs them.
5. **Use a token whose pushes trigger CI.** Pushes, pull requests and merges made with `GITHUB_TOKEN` start no workflow, so the train's checks and the post-merge workflows would never run. A GitHub App token does trigger them. Keep its private key in an environment limited to the default branch, and mint the token only in the job that writes.
6. **Stateless, with the state on GitHub.** Nothing is stored between runs. The train's base and members (number + tested head) live in a JSON comment in the train pull request's body; "retry alone" is a label; "hands off" is a label. Any run can pick up where the previous one stopped, and a crashed run leaves nothing a later run cannot clean up.
7. **One run at a time, never cancelled.** A concurrency group without `cancel-in-progress`: a run may be merging a train. GitHub keeps one pending run, and each run reads the state afresh, so bursts of events collapse into one run.
8. **When in doubt, hand it to a human.** Anything not clearly safe gets a `needs-coordinator` label and one short comment, and the manager never touches that pull request again until a human removes the label.
9. **Shadow first.** A mode variable: `shadow` logs every decision in the run summary and changes nothing; `on` acts.

### State machine of one approved pull request

| Situation (checked in this order) | Decision |
|---|---|
| Labelled `needs-coordinator`, or a member of the train in flight | leave it |
| Label added by someone not allowed | remove the label, comment |
| Draft; mergeability not computed yet; who labelled it unknown | wait |
| Changes CI workflow files | park (the App token cannot push or merge them; merge by hand) |
| Unresolved review threads (e.g. CodeQL) | park |
| Conflicts with `main` | same-repository branch: merge `main` into it, resolving the files the conflict rules allow, else park. Fork: park |
| A required check failed | head behind `main` (same repository): merge `main` into it **once** (that changes the head, so it cannot repeat for the same head). Head already contains `main`, or fork: park |
| Required checks running | wait. Approved fork whose first-time-contributor runs wait for approval: approve them |
| All required checks green, mergeable | **candidate** |

### State machine of a train

| Situation | Decision |
|---|---|
| A member closed, lost its label, got new commits or was parked | abandon: close the train; the rest go into the next one |
| Not opened by the manager's App, or no readable state block | abandon |
| A required check failed | one member: park it. Several: close, mark every member "solo" so each goes alone in the next trains (a cheap bisection that also absorbs a flaky check) |
| Checks running | wait (abandon after 4 hours) |
| Green, but `main` moved by anything other than the bot | abandon and rebuild on the new `main` |
| Green and `main` unchanged (or bot-only) | merge each member with its tested head, in order; stop at the first refusal (park that one); check before each merge that `main` is where the previous merge left it; close the train |

A run then starts a new train from the candidates (oldest first, up to the size limit) if none is in flight. **Shortcut:** when there is exactly one candidate and its head already contains `main`, its own checks already ran on `main` + it, so it is merged directly without a train.

### Conflict rules (merging `main` into a branch)

| Path | Rule |
|---|---|
| Generated outputs (the regeneration bot's allowlist) | take `main`'s side: the bot regenerates them after the merge |
| Files that only ever grow in parallel (a stylesheet, a big test file) | union (both sides), via git's built-in union driver in `.git/info/attributes` |
| A hand-written page whose only conflicts are cache stamps (`?v=…`) | take `main`'s side for hunks that differ only in stamps; any other difference: park |
| Anything else | park |

### Tokens

| Token | Used for | Why |
|---|---|---|
| `GITHUB_TOKEN`, read-only | the GraphQL query and the plan | its own rate limit, per repository; no personal quota |
| `GITHUB_TOKEN`, write (act job only) | labels, comments, closing a train, approving fork runs, dispatching the manager | these must not start workflows anyway |
| GitHub App installation token (act job only, one hour) | pushing the train branch and healed branches, opening the train pull request, merging | its pushes and merges trigger CI and the post-merge workflows; it has its own rate limit |

If the App is in a ruleset bypass list, GitHub does not re-check the required checks when it merges: the manager must check them itself (it does, on every member and on the train).

### Failure modes

| What goes wrong | What happens |
|---|---|
| A kick is dropped (concurrency, outage) | the schedule (every 30 min) catches up |
| A run dies mid-train | the next run sees a train whose members are partly merged: merged members are no longer open, so it abandons the train; the unmerged ones go into a new train on the new `main` (which now contains the merged ones) |
| Someone pushes to a member during the train | its head no longer matches: the merge API refuses (`sha` mismatch), the train is abandoned, nothing untested is merged |
| Someone merges by hand during the train | `main` moved: the train is abandoned and rebuilt |
| A check is flaky | a multi-member train goes solo; a solo train that fails parks the pull request for a human to re-run |
| CI never reports | the train is abandoned after 4 hours and rebuilt |
| The App key leaks | delete it on the App page, generate a new one, update the secret; the key lives only in a main-only environment |
| The manager misbehaves | set the mode variable to `off` (stops at the next run), or disable the workflow |

### Cost

Free on a public repository (Actions minutes are free). Per run: one GraphQL query (about 2 points), plus one REST call per write. No personal token is used at all. Conditional requests (ETag) do not apply to GraphQL; the one optional REST read (runs waiting for approval) is made only when an approved fork pull request has no check at all yet.

---

## Part 2 — In this repository

### Files

| File | Role |
|---|---|
| `.github/workflows/merge-train-kick.yml` | `pull_request_target` (`labeled`, `synchronize`, `ready_for_review`) and `workflow_run` (Verify, Commit policy, Lighthouse, CodeQL completed): dispatches `merge-train.yml` on `main`. Its `revoke` job removes `merge-train` from a fork pull request that receives new commits. No checkout, no repository code. |
| `.github/workflows/merge-train.yml` | `workflow_dispatch` + `schedule` (`7,37 * * * *`). Job `plan` (read-only) decides; job `act` (mode `on` only, environment `regenerate`) acts. |
| `scripts/merge-train.mjs` | the CLI: `plan` and `act`. Node built-ins only, nothing installed. |
| `scripts/lib/merge-train.mjs` | every decision, as pure functions |
| `scripts/merge-train.test.mjs` | unit tests, the conflict rules on real git repositories, the shape of both workflows |

### Labels

| Label | Who adds it | Meaning |
|---|---|---|
| `merge-train` | a maintainer or the coordinator (accounts in `MERGE_TRAIN_LABELERS`, default the repository owner) | approved: merge when green |
| `needs-coordinator` | the manager | it stopped; a human must look. Remove it to put the pull request back in the queue |
| `merge-train-solo` | the manager | a train with this pull request failed: it goes alone next |
| `merge-train-run` | the manager | marks the train pull requests |

The manager creates missing labels on its first acting run.

### Variables (Settings → Secrets and variables → Actions → Variables)

| Variable | Default | Meaning |
|---|---|---|
| `MERGE_TRAIN_MODE` | unset = off | `shadow` or `on` |
| `MERGE_TRAIN_LABELERS` | repository owner | comma-separated logins allowed to add `merge-train` |
| `MERGE_TRAIN_MAX` | 6 | most pull requests in one train (1–20) |
| `MERGE_TRAIN_REQUIRED_CHECKS` | Dataset integrity, Windows tests, commit policy, Lighthouse accessibility and performance, Analyze (javascript-typescript) | comma- or newline-separated check names |
| `MERGE_TRAIN_METHOD` | `merge` | `merge`, `squash` or `rebase` |

It reuses `REGEN_APP_CLIENT_ID`, `REGEN_APP_SLUG` and the `regenerate` environment's `REGEN_APP_PRIVATE_KEY` (see [regeneration-bot.md](../regeneration-bot.md)). The token is requested with `contents: write` and `pull-requests: write` only.

### Interplay with the regeneration bot

The manager merges with the regeneration App, so `main`'s new commits are pushed by `free-llm-api-hub-regen[bot]`. `regenerate.yml` and `pages.yml` skipped every push by the bot; they now skip only the bot's own commits: a push whose tip is `Merge pull request #N …` is a merge like any other, regenerated and deployed (`isPullRequestMerge()` in `scripts/lib/regenerate.mjs`). `lighthouse.yml`'s performance job still skips pushes by the bot; the nightly run measures `main`.

`main` moving under a train is tolerated only for commits by the bot with the `chore(generated):` subject that touch generated files only.

### What the maintainer clicks

1. **Environment.** Nothing to change: `merge-train.yml` only starts from `workflow_dispatch` (dispatched with `--ref main`) and `schedule`, so its ref is always `main`, which the `regenerate` environment's deployment-branch rule (`main` only) allows. Check under *Settings → Environments → regenerate* that the rule is still "Selected branches and tags: `main`" and that there is no required reviewer (a reviewer would hold every acting run).
2. **App permissions.** Nothing to change: Contents and Pull requests (read and write) are enough. Pull requests that change `.github/workflows/` are parked and merged by hand (the App has no `workflows` permission, on purpose).
3. **Label permission.** GitHub lets anyone with *Triage* access or more add labels; the manager also checks that the last account to add `merge-train` is in `MERGE_TRAIN_LABELERS`. Agents that act through the maintainer's account count as the maintainer. Add a co-maintainer with `MERGE_TRAIN_LABELERS=pacocartones,LeonMAG`.
4. **Actions → General → Fork pull request workflows.** Keep "Require approval for first-time contributors". The manager approves the waiting runs only of fork pull requests a maintainer labelled.
5. **Stop the local loop** (`queue.sh`, `train.sh`, `heal.sh`) before step 2 of the rollout, so the two never act at once.

### Rollout

1. **Shadow.** Merge this. Set `MERGE_TRAIN_MODE=shadow`. Label a few pull requests. Each run's summary (*Actions → Merge train*) lists every decision and the actions it would take; nothing is changed. Compare with what the local loop does. Exit: a few days with no decision you disagree with.
2. **On.** Stop the local loop. Set `MERGE_TRAIN_MODE=on`. Watch the first trains: the train pull request opens, its checks run, the members merge, the train closes, and one `chore(generated):` commit follows per merge window.
3. **Tune.** `MERGE_TRAIN_MAX`, `MERGE_TRAIN_LABELERS`.

### Everyday use

- **Add a pull request:** add the `merge-train` label.
- **Remove a pull request:** remove the label. If it is in a train, the train is abandoned at the next run and rebuilt without it.
- **Put a parked pull request back:** fix it, then remove `needs-coordinator` (keep `merge-train`).
- **Run now:** *Actions → Merge train → Run workflow* (on `main`).
- **Stop:** set `MERGE_TRAIN_MODE` to `off` (or delete it). A run already merging finishes its train; no new run acts. For an immediate stop: *Actions → Merge train → ⋯ → Disable workflow*, and close any open `merge-train-run` pull request.

### Differences from the local loop

- Generated files take `main`'s side only when they are real generated outputs (`isGeneratedOutput()`), not every `site/**` file: a hand-written script under `site/` that conflicts is parked instead of silently losing the branch's change.
- "Update once per head" needs no memory: a red pull request is updated only when its head is behind `main`, and the update itself makes the head contain `main`.
- A failed multi-pull-request train is retried one pull request at a time instead of rebuilding the same train.
- An approved fork pull request loses its approval when it receives new commits.
