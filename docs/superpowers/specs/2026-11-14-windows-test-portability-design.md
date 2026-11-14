# Windows test portability design

## Intent

Make the repository's real test command pass in Windows linked worktrees, so contributors and maintainers get the same reliable local gate that Linux CI provides. The current failures are test-harness portability defects, not product behavior failures.

## Goals

- Convert file URLs to native filesystem paths before spawning Node.
- Let `privateTree()` rewrite a copied linked-worktree `.git` file even when Windows preserves its hidden attribute.
- Exercise the complete suite on Windows in GitHub Actions without changing the existing required Linux job name.
- Preserve full-history behavior and keep generated writes inside private copies.

## Non-goals and anti-goals

- Do not skip or weaken tests on Windows.
- Do not mutate the source worktree's `.git` file or attributes.
- Do not refactor unrelated test helpers, generated files, or application behavior.
- Do not replace portable Node APIs with shell-specific `attrib`, PowerShell, or Bash commands.

## Approaches considered

1. **Portable Node primitives (chosen).** Use `fileURLToPath()` for script paths. In `privateTree()`, remove the copied `.git` file before writing the normalized absolute gitdir pointer. This is small, cross-platform, and avoids changing the source file.
2. **Clear Windows attributes in place.** Run `attrib` or platform-specific attribute code before overwriting. This adds an operating-system branch and external-command dependency for no benefit once the copied file can simply be replaced.
3. **Skip private-tree tests on Windows.** This would hide precisely the contributor failure the project needs to prevent and is rejected.

## Behavior and validation

- `scripts/key-hosts.test.mjs` must spawn `validate.mjs` with a native path and observe the intended validation message.
- A focused `scripts/private-tree.test.mjs` must create a private copy from the real linked worktree, preserve an absolute `gitdir:` pointer, and prove Git can read the copied tree.
- `npm test` must pass locally on Windows.
- The existing Linux `Dataset integrity` job remains unchanged; a separate `Windows tests` job runs the full `npm test` command on `windows-latest`.

## Constraints

- Node.js 18 or newer.
- No new dependencies.
- Keep action references pinned to the same immutable SHAs already used by the workflow.
- Close #551 through a focused pull request; no release or generated-data refresh.
