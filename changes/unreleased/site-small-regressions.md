### Changed and fixed

- The embeddable widget renders with its styles again: the quoted `Segoe UI` font name
  closed the inline `style` attribute early, so the box lost its colours and border (#891).
- `/changes/`: the "no revision" months use the table's text font instead of the
  browser default (#891).
- Guides: the "Checked" date no longer wraps across two lines (#891).
- Counts read the same way everywhere: a provider page says "#N of 76 scored", and the
  production checklist guide counts every figure over the verified providers it
  says it covers, instead of mixing in the tracked total (#891). Agent-assisted.
