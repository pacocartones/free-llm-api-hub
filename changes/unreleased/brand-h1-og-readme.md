### Changed and fixed

- Social images in the new brand: a dark card with the mark, the title in Roboto Flex, and the auras of the
  collection's or guide's providers; provider cards show three published limits, a "verified · sourced" stamp and the
  provider's own aura. They are rendered with fonts kept in the repository, so every machine draws the same image.
- The README opens with a banner of every provider's aura (light and dark), and its badges use the brand colours.
- The tagline is one constant (`scripts/lib/brand.mjs`, still a placeholder) that the home title, the README, the
  social image, the banner and the GitHub social preview (`assets/social-preview.png`, `npm run brand-assets`) all read.
