# Windows Test Portability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm test` pass in Windows linked worktrees and continuously verify that contract in GitHub Actions.

**Architecture:** Keep the existing test runner and private-copy design. Fix the two platform boundaries at their sources: file URL conversion before process spawn, and replacement of the copied `.git` metadata file before normalization. Add one focused regression test and one independent Windows CI job.

**Tech Stack:** Node.js ESM, `node:test`, Git, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-14-windows-test-portability-design.md`

## Global Constraints

- Node.js 18 or newer; no new dependencies.
- Never mutate the source worktree's `.git` file or attributes.
- Preserve the existing Linux job name and required-check contract.
- Do not weaken, skip, or special-case away Windows tests.

## Review Focus

- A Windows drive-letter file URL must become a native path before Node spawn.
- Removing the copied `.git` file must never remove or edit the source worktree `.git` file.
- The rewritten `gitdir:` target must be absolute when the source pointer was relative.
- Private builds must still mine the real repository history.
- The Windows job must use full history and locked dependencies without lifecycle scripts.

---

### Task 1: Native validate-script path

**Files:**
- Modify: `scripts/key-hosts.test.mjs`
- Test: `scripts/key-hosts.test.mjs`

**Interfaces:**
- Consumes: `import.meta.url` for the test module.
- Produces: native absolute `VALIDATE` path passed to both `spawnSync` calls.

- [ ] Run `node --test scripts/key-hosts.test.mjs` and confirm the existing dataset-check test fails because Node resolves `C:\C:\...`.
- [ ] Import `fileURLToPath` from `node:url`, define `VALIDATE = fileURLToPath(new URL('./validate.mjs', import.meta.url))`, and use it for both spawned validations.
- [ ] Run `node --test scripts/key-hosts.test.mjs`; expect 10/10 passing.
- [ ] Commit as `test: use native paths for validator subprocesses`.

### Task 2: Replace copied linked-worktree metadata safely

**Files:**
- Create: `scripts/private-tree.test.mjs`
- Modify: `scripts/lib/private-tree.mjs`

**Interfaces:**
- Consumes: a repository root whose `.git` may be a hidden linked-worktree file.
- Produces: a private tree whose `.git` contains an absolute `gitdir:` pointer and is readable by Git.

- [ ] Add a focused test that calls `privateTree()` on the current repository, asserts the copy differs from the source, asserts its `.git` pointer is absolute, and runs `git rev-parse --show-toplevel` in the copy.
- [ ] Run `node --test scripts/private-tree.test.mjs`; expect `EPERM` on Windows before the implementation change.
- [ ] Import `rmSync` and remove only `join(dir, '.git')` after parsing the copied metadata and before `writeFileSync` writes the normalized pointer.
- [ ] Run `node --test scripts/private-tree.test.mjs scripts/build.test.mjs`; expect all tests passing.
- [ ] Commit as `test: make private worktrees portable on Windows`.

### Task 3: Continuous Windows verification

**Files:**
- Modify: `.github/workflows/verify.yml`

**Interfaces:**
- Consumes: the same checkout and locked Node toolchain as the Linux gate.
- Produces: independent `Windows tests` check running `npm test` on `windows-latest`.

- [ ] Add a `windows-tests` job with full checkout history, `.nvmrc`, `npm ci --ignore-scripts`, and `npm test`; retain immutable action pins.
- [ ] Run a YAML parse or structural inspection and `npm test`; expect the suite to pass locally.
- [ ] Run `git diff --check` and `npm run check`; expect no whitespace or generated drift.
- [ ] Commit as `ci: verify the full suite on Windows`.

### Task 4: Final review and pull request

**Files:**
- Review all files changed since `origin/main`.

**Interfaces:**
- Consumes: Tasks 1–3 and their evidence.
- Produces: one focused PR closing #551.

- [ ] Run the final whole-branch review with the review focus above.
- [ ] Run `npm test`, `npm run check`, and `git diff --check` from a clean tree.
- [ ] Push `fix/windows-linked-worktree-tests` and open a PR that links `Closes #551`, reports RED→GREEN evidence, and states that no release is included.
