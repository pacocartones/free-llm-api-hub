# Brand

The site follows brand direction **H1, "Fingerprint + Receipts"**: every provider has a generative *aura* drawn from its
own data (what it is), and every verified value carries a dated *receipt* stamp (how we know). This page records the
parts that live in code, so a contributor can extend them without guessing.

## Colour

The palette is the final variant **H1-e · Cálida**: a toasted-saffron brand accent, warm off-white or warm near-black
grounds, and one warm hue per modality. All colours are CSS custom properties in [`site/styles.css`](../site/styles.css):
`:root` holds the dark values and `[data-theme="light"]` the light ones. Light is the default; the theme guard in each
page's `<head>` picks dark when the visitor's system prefers it or they chose it with the toggle. Components read
semantic names, never a raw colour. Contrast is on `--bg` / `--panel` (WCAG 2.x relative luminance).

| Token | Light | Contrast | Dark | Contrast | Use |
|---|---|---|---|---|---|
| `--bg` / `--panel` / `--panel-2` | `#fff9f6` / `#ffffff` / `#fcf1ec` | | `#17110f` / `#211915` / `#251c18` | | Grounds |
| `--border` (line) | `#f0e2db` | | `#352822` | | Hairlines |
| `--text` (ink) | `#22140f` | 17.13 / 17.87 | `#fbf1ec` | 16.82 / 15.56 | Body text |
| `--muted` | `#6a5048` | 7.05 / 7.36 | `#c2a89e` | 8.36 / 7.73 | Secondary text |
| `--control` | `#9a8179` | 3.48 / 3.63 | `#7a645b` | 3.38 / 3.13 | Control borders (3:1, WCAG 1.4.11) |
| `--accent` | `#9c4a00` | 5.93 / 6.19 | `#ffb25c` | 10.48 / 9.69 | Brand: links, focus ring, primary button |
| `--accent-ink` (on-accent) | `#ffffff` | 6.19 on the accent | `#17110f` | 10.48 on the accent | Text on the accent |
| `--ok` | `#2f6b1f` | 6.21 / 6.47 | `#9ad27f` | 10.59 / 9.80 | Confirmed good |
| `--unk` | `#7f5a00` | 5.98 / 6.24 | `#f2c14e` | 11.14 / 10.30 | Not stated |
| `--bad` | `#b3261e` | 6.27 / 6.54 | `#ff8a7a` | 8.16 / 7.55 | Confirmed bad |
| `--chg` | `#7a2e8c` | 7.75 / 8.09 | `#e0a3f0` | 9.49 / 8.78 | A change in the record |
| `--seal-bg` | `#ffebd9` | accent on it 5.35 | `#2e2119` | accent on it 8.74 | The receipt stamp's fill |

`--panel-2`, `--accent-dim` (accent text on an accent tint), `--faint` and `--trial` are derived so every text token
still reaches 4.5:1 on all three grounds.

**Modalities** have two tokens each. `--h-*` is the graphic hue (aura bars, dots), one set per theme; `--m-*` is the text
variant, darkened in light until it reaches 4.5:1 (in dark every hue already does, so `--m-*` equals `--h-*`).

| Modality | `--h-*` light (on `--bg`) | `--m-*` light | `--h-*` = `--m-*` dark (on `--bg`) |
|---|---|---|---|
| text | `#d9502a` (3.92) | `#bd4625` | `#ff7a4d` (7.25) |
| vision | `#c48200` (3.08) | `#956300` | `#f5b21f` (10.03) |
| audio | `#c2185b` (5.63) | `#c2185b` | `#ff5c93` (6.41) |
| embeddings | `#8e7a00` (4.08) | `#7e6d00` | `#c9b02e` (8.66) |
| image | `#d85a85` (3.52) | `#b14a6d` | `#ff9cbc` (9.55) |
| ocr | `#8b3a2e` (7.34) | `#8b3a2e` | `#d97a62` (6.15) |
| rerank | `#7b2d6b` (8.29) | `#7b2d6b` | `#c77ab8` (6.15) |

The `--h-*` hues are fills only and always sit next to the modality's name, so colour never carries meaning alone
(WCAG 1.4.1); each reaches 3:1 on `--bg` and `--panel` (WCAG 1.4.11). `scripts/build.test.mjs` checks every text token
on `--bg`, `--panel` and `--panel-2` in both themes, `--control` at 3:1, the hues at 3:1, the accent on `--seal-bg`,
that the Cálida values are the ones in this table, that every schema modality has both tokens, and that no rule sets a
text colour from an `--h-*` hue.

## Type

- **Roboto Flex** (variable; `wght` 300–900 and `wdth` 75–130 kept) for display and text. Headings use the Cálida
  axes: weight 760, `font-stretch` 92 %, tracking −0.03 em (`--h1-weight`, `--h1-stretch`, `--h1-tracking`).
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
