# Data Quality Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve high-value dataset coverage and freshness while preserving newcomer-friendly data tasks.

**Architecture:** Derive gaps from the current dataset and open issues, rank them by user value and evidence availability, then implement one complex or cross-cutting gap that is not labelled `good first issue`. All claims retain official-source evidence and UTC verification dates.

**Tech Stack:** JSON datasets and schemas, Node.js validators/build, official provider documentation.

**Spec:** `docs/superpowers/specs/2026-11-14-hub-improvement-sprint-design.md`

## Global Constraints

- Do not claim or implement current `good first issue` work.
- Use official provider sources only; unknown remains unknown.
- Regenerate and commit every derived artifact required by the data change.

## Review Focus

- Marketing pages that omit eligibility details must not be treated as proof.
- Trial credit and ongoing free tier must remain distinct.
- Dates must be current UTC dates and never future dates.
- Cross-dataset slugs and generated outputs must remain consistent.
- A source outage or ambiguity must fail closed rather than become a guessed value.

---

### Task 1: Rank non-newcomer data gaps

**Files:** Read-only analysis of `data/**`, schemas, source evidence and open data issues.

**Interfaces:**
- Produces: ranked candidates with affected fields, user impact, official sources and exclusion reasons.

- [ ] Compute missing/stale field coverage from the committed datasets.
- [ ] Exclude assigned issues, active external discussions and every `good first issue`.
- [ ] Verify candidate evidence on official provider pages.
- [ ] Select one bounded candidate whose evidence is sufficient today.

### Task 2: Implement one evidence-backed data improvement

**Files:** Exact dataset, quote register and generated files required by Task 1's candidate.

**Interfaces:**
- Consumes: verified evidence from Task 1.
- Produces: one independently mergeable data PR or a self-contained evidence issue when the answer remains unknown.

- [ ] Add a failing fixture or focused assertion when the change extends schema behavior.
- [ ] Apply only sourced facts and record the checked date.
- [ ] Run validation, focused tests, build, generated-file drift and source checks.
- [ ] Request independent review and resolve all Important findings.
