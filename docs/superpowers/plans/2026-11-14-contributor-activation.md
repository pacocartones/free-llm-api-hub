# Contributor Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current issue inventory into clearer, faster contributor entry paths without disturbing active work.

**Architecture:** Treat GitHub issues as an operational funnel: inventory, classify, then make only evidence-backed metadata or wording changes. Active or discussed issues are protected; unclaimed issues may be improved but are not churned merely for recency.

**Tech Stack:** GitHub issues/labels, repository issue templates and contributor documentation.

**Spec:** `docs/superpowers/specs/2026-11-14-hub-improvement-sprint-design.md`

## Global Constraints

- Preserve active assignments and conversations.
- Leave current `good first issue` implementation work to external contributors.
- Every issue mutation must have a specific discoverability or clarity reason.

## Review Focus

- An assigned issue must never be relabelled or closed as stale.
- An issue with external comments must not be deleted or silently replaced.
- Acceptance criteria must remain achievable from public information.
- Labels must match actual prerequisites, not desired visibility.
- Duplicate umbrellas must point clearly to their surviving task before closure.

---

### Task 1: Audit and segment the open issue funnel

**Files:** GitHub issue metadata and bodies only.

**Interfaces:**
- Consumes: all open issues, assignments, comments and labels.
- Produces: a table of active, newcomer-ready, maintainer-complex and stale/duplicate candidates with exact issue numbers.

- [ ] Export the current open issue inventory including comments, assignees, labels and timestamps.
- [ ] Classify every issue; flag uncertainty instead of mutating it.
- [ ] Verify that every `good first issue` has bounded scope, public evidence and a named check.
- [ ] Report proposed mutations before applying any destructive change.

### Task 2: Apply safe contributor-funnel improvements

**Files:** Selected issue bodies/labels and, only if evidence requires it, `.github/ISSUE_TEMPLATE/**` or `CONTRIBUTING.md`.

**Interfaces:**
- Consumes: Task 1 classification.
- Produces: clearer newcomer tasks and an explicit response/review path.

- [ ] Improve only issues whose acceptance criteria or entry instructions are materially unclear.
- [ ] Preserve authorship, comments and assignment state.
- [ ] Validate repository links if tracked documentation changes.
- [ ] Record every applied issue mutation and its reason.
