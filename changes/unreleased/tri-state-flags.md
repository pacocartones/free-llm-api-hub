### Changed and fixed

- The explorer and the provider pages show card, phone, commercial use and training on prompts through one flag, in that order, drawn with a shape as well as a colour: ✓ when it holds, ✕ when it does not, ~ when commercial use is conditional and a dashed ? when the provider's docs do not confirm it. Screen readers hear the whole answer, for example "Card required: unknown — not stated in the provider's docs" (#813). Agent-assisted.
- The modality filter of the explorer drops the emoji from its options, which screen readers announced ("speech balloon, Text / LLM"), and shows a small dot in the colour of the selected modality instead (#813, issue #792). Agent-assisted.
