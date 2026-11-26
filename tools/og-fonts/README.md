# Fonts for the social images

`scripts/og.mjs` and `scripts/brand-assets.mjs` rasterise SVG with resvg, which cannot read the site's woff2 files. These
are static TrueType instances of the same two families, renamed so resvg can pick them by name, subset to Latin, and
used only at build time (they are not published with the site):

| File | Source | Instance | Family name in the SVG |
|---|---|---|---|
| `og-display.ttf` | Roboto Flex | wght 800, wdth 75, opsz 32 | `OG Display` |
| `og-text-400.ttf` | Roboto Flex | wght 400, wdth 100, opsz 32 | `OG Text` 400 |
| `og-text-650.ttf` | Roboto Flex | wght 650, wdth 112, opsz 32 | `OG Text` 650 |
| `og-mono-400.ttf` | DM Mono Regular | — | `OG Mono` 400 |
| `og-mono-500.ttf` | DM Mono Medium | — | `OG Mono` 500 |

Both families are SIL Open Font License 1.1 (`OFL-RobotoFlex.txt`, `OFL-DMMono.txt`); neither declares a Reserved Font
Name. Made with fontTools from `google/fonts` (`ofl/robotoflex`, `ofl/dmmono`): `varLib.instancer` for the Roboto Flex
instances, then a Latin subset, new name records and the weight class set. The site's own woff2 files and their recipe
are in [`docs/brand.md`](../../docs/brand.md).
