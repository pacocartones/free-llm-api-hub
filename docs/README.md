# Project documentation

How **Free LLM API Hub** works — how entries are verified, what earns a spot, and how the whole thing stays current. The dataset ([`data/providers.json`](../data/providers.json)) is the single source of truth; the README's marked data sections, badge and provider pages are generated from it. Companion datasets and authored build inputs are mapped in [Architecture](architecture.md).

## Start here

| Doc | What it covers |
|---|---|
| [Tutorial: add your first provider](tutorial-first-provider.md) | Follow along end to end — check, add, validate, regenerate, merge a real entry |
| [Methodology](methodology.md) | How each entry is verified — what "verified" means, and where its limits are |
| [Inclusion criteria](inclusion-criteria.md) | What earns a spot, and what gets rejected |
| [Comparison dimensions](comparison-dimensions.md) | Every field and flag in the dataset, defined |

## Maintaining the dataset

| Doc | What it covers |
|---|---|
| [Update playbook](update-playbook.md) | The weekly routine that keeps the freshness badge green |
| [Freshness SLA](freshness-sla.md) | The 90-day re-verification system: buckets, badge, worklist, reverify batch, verified column |
| [Quoted passages](quotes.md) | Evidence register, quote updates and offline versus live checks |
| [Architecture](architecture.md) | The data-first pipeline: what each script does, the data model, the two-places rule |
| [Regeneration bot](regeneration-bot.md) | The post-merge rebuild of derived files (off, then shadow mode, then direct push) and its pull-request preview |
| [Provider schema reference](schema.md) | Generated field types, nullability and required keys of `data/schema.json` |
| [Static JSON API: stability and versioning](api.md) | What `/api/v1/` guarantees, how `version` relates to the path, and pinning a snapshot by tag |
| [Discovery sources & competitive map](sources.md) | Where new providers are found, which lists to trust, and how we differ from rivals |
| [Live testing](live-testing.md) | Probing each free tier with a real key — `last_probed`, and the Infisical setup |
| [Roadmap](roadmap.md) | Where the project is going next |
| [Backlog](backlog.md) | The living, actionable to-do checklist |
| [Preparing dataset releases](release-preparation.md) | Stable local preparation procedure for dataset tags, GitHub Releases and snapshot assets |
| [MCP product boundaries and release checklist](mcp-productization.md) | Product limits and pre-release checks for public distribution of the MCP server |
| [MCP release setup](mcp-release.md) | Maintainer procedure for external setup and release of the MCP package |

## Adjacent references

| Doc | What it covers |
|---|---|
| [Self-hosting on free compute](self-hosting-on-free-compute.md) | Free GPU/compute for running your own model when no hosted API fits |
| [Credit programs (apply to get)](credit-programs.md) | Startup and student/research credit programs — the "free" you apply for |

## Project & community

[Release runbook](../RELEASING.md) · [Contributing](../CONTRIBUTING.md) · [Governance](../GOVERNANCE.md) · [Security](../SECURITY.md) · [Code of Conduct](../CODE_OF_CONDUCT.md) · [Changelog](../CHANGELOG.md)

---

Not sure where to start? [Find my free API](https://freellmapihub.com/find/) asks six questions and gives you a shortlist.

← [Back to the main README](../README.md) &nbsp;·&nbsp; [Interactive explorer ↗](https://freellmapihub.com/)
