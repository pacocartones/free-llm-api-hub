### Added

- Every static comparison page (/compare/<a>-vs-<b>/) answers "<A> vs <B> free tier" right under its title, built only
  from the data: what each side gives for free (published limits or the free-tier wording), when to pick which (only
  where both records hold different values: ongoing tier or trial, higher limits in the same unit, card, phone,
  commercial use, training on prompts, OpenAI compatibility), the flags side by side and the day each record was
  verified. A field the dataset leaves null reads "not stated" and never decides the pick (#955).
- Every static comparison page has a four-question FAQ (which free tier, card and phone, commercial use, training on
  prompts), each answer citing the days its sources were read, mirrored word for word as FAQPage JSON-LD (#955).
