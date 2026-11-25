# Brand

The site follows brand direction **H1, "Fingerprint + Receipts"**: every provider has a generative *aura* drawn from its
own data (what it is), and every verified value carries a dated *receipt* stamp (how we know). This page records the
parts that live in code, so a contributor can extend them without guessing.

## Colour

All colours are CSS custom properties in [`site/styles.css`](../site/styles.css): `:root` holds the dark values and
`[data-theme="light"]` the light ones. Light is the default; the theme guard in each page's `<head>` picks dark when the
visitor's system prefers it or they chose it with the toggle. Components read semantic names, never a raw colour.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` / `--panel` / `--panel-2` | `#fafafa` / `#ffffff` / `#f1f1f4` | `#0e0e11` / `#18181d` / `#1f1f25` | Grounds |
| `--text` | `#0f0f12` | `#f3f3f5` | Body text |
| `--muted` | `#55565e` | `#a6a7b0` | Secondary text |
| `--accent` | `#c2255c` | `#ff6b9a` | Brand magenta: links, focus ring, primary button |
| `--ok` / `--unk` / `--bad` | `#1b7a44` / `#8a5700` / `#c0262d` | `#4fd08a` / `#f0ba4e` / `#ff7a7a` | Confirmed good · not stated · confirmed bad |
| `--chg` / `--trial` | `#3550e8` / `#0a6a75` | `#8c9eff` / `#55c8d4` | A change in the record · the trial category |
| `--control` | `#85868f` | `#71727c` | Control borders (3:1, WCAG 1.4.11) |

**Modalities** have two tokens each:

| Modality | `--h-*` graphic hue (both themes) | `--m-*` text, light | `--m-*` text, dark |
|---|---|---|---|
| text | `#7c5cff` | `#5b3fe0` | `#a594ff` |
| vision | `#00c2e0` | `#006f88` | `#3fd0ee` |
| image | `#ff4f8b` | `#b01d63` | `#ff7fb4` |
| audio | `#ffa31a` | `#8a5200` | `#ffb547` |
| embeddings | `#2bc48a` | `#0f7445` | `#4fd08a` |
| rerank | `#4c8dff` | `#1f5fc4` | `#8cb4ff` |
| ocr | `#ff7a3d` | `#a3420c` | `#ff9a5c` |

The `--h-*` hues are fills only (aura sectors, dots) and always sit next to the modality's name, so colour never carries
meaning alone (WCAG 1.4.1). Text uses `--m-*`, which reaches 4.5:1. `scripts/build.test.mjs` checks every text token on
`--bg`, `--panel` and `--panel-2` in both themes, `--control` at 3:1, that every schema modality has both tokens, and that
no rule sets a text colour from an `--h-*` hue.

## Type

- **Roboto Flex** (variable; `wght` 300–900 and `wdth` 75–130 kept) for display and text. Headings narrow as they grow
  (`font-stretch` 80–88 %).
- **DM Mono** 400 and 500 for data, code and badges.

Both are SIL OFL 1.1 (licences in [`site/fonts/`](../site/fonts/)), self-hosted, preloaded and declared in each page's
`<head>` by `scripts/lib/assets.mjs` with `font-display: optional`. A page may load at most **90 KB** of fonts
(`FONT_BUDGET_BYTES`); `scripts/assets.test.mjs` and the Lighthouse gate both enforce it. Today's three files weigh about
64 KB.

The files are Latin subsets of the Google Fonts sources (`google/fonts`, `ofl/robotoflex` and `ofl/dmmono`), made with
[fontTools](https://github.com/fonttools/fonttools):

```bash
fonttools varLib.instancer 'RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].ttf' \
  wght=300:900 wdth=75:130 opsz=drop GRAD=drop XOPQ=drop XTRA=drop YOPQ=drop YTAS=drop YTDE=drop YTFI=drop \
  YTLC=drop YTUC=drop slnt=drop -o rf-inst.ttf
```

```bash
U='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+2713,U+2715,U+2605'
for f in rf-inst.ttf:roboto-flex DMMono-Regular.ttf:dm-mono-400 DMMono-Medium.ttf:dm-mono-500; do
  pyftsubset "${f%%:*}" --unicodes="$U" --layout-features='kern,liga,calt,tnum,lnum,case' \
    --flavor=woff2 --no-hinting --desubroutinize --output-file="${f##*:}.woff2"
done
```

## Aura, stamp and mark

- **Aura** (`scripts/lib/aura.mjs`): one per provider, from its record. How to read it is on the
  [methodology page](methodology.md#how-to-read-an-aura). `auraHtml()` draws it with CSS, `auraSvg()` with SVG arcs.
- **Receipt stamp** (`scripts/lib/stamp.mjs`): "✓ 24 Nov · source", linked to the checked page, the quoted sentence
  in its title.
- **Mark**: the hub's own aura (six modalities, full disc). `npm run icons` writes the sprite symbol, `favicon.svg`,
  the PNG/ICO icons and `assets/logo-{light,dark,full}.svg`; the wordmark is outlined (`scripts/lib/wordmark.mjs`).

## Tagline

One constant, `TAGLINE` in [`scripts/lib/brand.mjs`](../scripts/lib/brand.mjs), is **a placeholder until the
owner picks one** (candidates in the brand drafts). The home title, the README, the home social image, the README
banner and the GitHub social preview read it. After changing it, run `npm run build`, `npm run og` and
`npm run brand-assets`.

## Images outside the site

- **Social images** (`npm run og`): dark cards drawn by `scripts/lib/og-art.mjs` and rasterised with the static fonts in
  [`tools/og-fonts/`](../tools/og-fonts/) (system fonts are not loaded). `scripts/check-og.mjs` fails when one no longer
  matches the data; the regeneration workflow re-renders them.
- **README banner and GitHub social preview** (`npm run brand-assets`): `assets/banner-{light,dark}.png` and
  `assets/social-preview.png` (1280×640). They are a snapshot of the dataset, not checked in CI; refresh them at a
  release. GitHub does not read the social preview from the repository: upload it in *Settings → General → Social
  preview*.
