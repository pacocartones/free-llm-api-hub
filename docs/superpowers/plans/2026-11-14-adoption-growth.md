# Adoption Growth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the rate at which repository and website visitors understand, use and star Free LLM API Hub.

**Architecture:** Audit the existing README and generated site before editing. Select one high-confidence conversion gap, make the smallest coherent change in its source, regenerate derived output and verify accessibility, links and claims.

**Tech Stack:** Markdown, generated static site, Node.js build/tests, Lighthouse.

**Spec:** `docs/superpowers/specs/2026-11-14-hub-improvement-sprint-design.md`

## Global Constraints

- No fabricated social proof, pop-ups or aggressive star prompts.
- Keep claims derivable from repository data or existing verified behavior.
- Change source files, then regenerate tracked outputs.

## Review Focus

- First-time visitors must understand the value before encountering contribution mechanics.
- Mobile and keyboard flows must remain usable.
- Calls to action must not displace API/data access.
- Generated pages must remain byte-stable after a second build.
- Metadata and structured data must reflect visible page content.

---

### Task 1: Audit the acquisition and activation path

**Files:** Read-only inspection of `README.md`, `scripts/build.mjs`, `site/**`, metadata and public pages.

**Interfaces:**
- Produces: ranked conversion gaps with evidence and one selected intervention.

- [ ] Map the path from GitHub/search arrival to first useful API or dataset action.
- [ ] Check README hero, installation/use examples, metadata, mobile rendering and calls to action.
- [ ] Reject ideas that require analytics not currently collected.
- [ ] Select the smallest intervention with a measurable proxy such as clearer first-use steps or stronger metadata completeness.

### Task 2: Implement and verify one adoption improvement

**Files:** Exact source and generated files identified in Task 1; add a focused regression test where behavior changes.

**Interfaces:**
- Consumes: Task 1 selected intervention.
- Produces: one independently mergeable PR.

- [ ] Write or update the focused regression before behavioral implementation.
- [ ] Implement the minimal source change and regenerate outputs.
- [ ] Run focused tests, link checks, a second-build drift check and required CI.
- [ ] Request independent review and resolve all Important findings.
