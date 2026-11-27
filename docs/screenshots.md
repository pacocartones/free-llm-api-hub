# Screenshots

A dev-only tool that regenerates the gallery images and pull-request screenshots from the current data, so the numbers in them are never stale. It is not part of the site, the dataset pipeline or any required check.

## Run it in CI (the usual way)

Actions → **Screenshots** → *Run workflow*. Optional inputs:

- `only`: shot ids, comma separated (`S1,S7`); empty for all of them.
- `date`: the pinned date (`YYYY-MM-DD`); empty for the dataset's as-of date.
- `scale`: device scale factor (default `2`).

The PNGs and a `manifest.json` (date, Chrome version, one row per shot) are uploaded as the artifact `screenshots-<commit>`, kept for 30 days. The workflow only reads the repository; nothing is committed or deployed.

## Run it locally

```bash
npm ci --ignore-scripts --prefix tools/screenshots
```

```bash
node tools/screenshots/run.mjs --only=S1,S3
```

Flags: `--only=<ids>`, `--no-build` (use `site/` as it is), `--out=<dir>` (default `tools/screenshots/out/`, gitignored), `--scale=<n>`. Chrome comes from `CHROME_PATH`, or the usual install locations.

## The shots

[`tools/screenshots/shots.json`](../tools/screenshots/shots.json) lists them, S1–S15: home hero (light, dark, 375 px), a provider page (verified ticket, FAQ, dark, 375 px), `/find/` (desktop and 375 px dark), a model-family page, a compare verdict and table, the `/api/` examples, `/api/v1/status.json` and `/badges/`. Each has a `path`, a `viewport`, a `theme` (`light` or `dark`), and optionally `waitFor` (a selector that must be visible), `clip` (capture only that element), `scrollTo` (scroll that element to the top, then capture the viewport) or `fullPage`. Output files are named `<id>-<name>.png`.

## Determinism

- The site is built with the clock pinned to `SCREENSHOT_DATE` at 12:00 UTC (default: the dataset's as-of date), via [`fixed-date.mjs`](../tools/screenshots/fixed-date.mjs) preloaded into `scripts/build.mjs`; the same clock is injected into every page.
- `prefers-reduced-motion: reduce`, animations, transitions and the caret switched off, UTC time zone, `en-US`, sRGB colour profile, hidden scrollbars.
- The theme is set through both `prefers-color-scheme` and the stored theme the site reads.
- Every request outside the local server is blocked, and each capture waits for `document.fonts.ready`.

Two runs on the same commit and date give byte-identical PNGs on the same Chrome.
