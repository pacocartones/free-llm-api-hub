### Added

- Every provider now has an *aura*: a fan of radial bars drawn from its own record at build time. Each colour sector is
  a modality it serves, bars that grow from the centre mean an ongoing free tier and an outer crown only a trial, a
  dashed circle means its docs leave a production flag unsaid, and it fades when the last check is over 30 days old.
  The fan's rotation and bar lengths come from the provider's slug, so each aura is its own. It leads each row of the
  explorer and sits at the top of each provider page with its reading in words; the methodology explains how to read it (#845).
- The verified date is now a *receipt*: a perforated ticket on the provider page ("✓ | Verified 24 Nov 2026 · 7
  sources") and a flat pill in the explorer ("Verified · 24 Nov 2026 · 7 sources"). Both link to the page the entry was
  checked on and show the quoted sentence on hover; "N sources" counts the distinct pages behind the entry. Due and
  stale entries keep their own mark and a dashed border (#845).
- New brand mark: the hub's own aura, in the header, the favicon, the app icons and `assets/logo-*.svg` (#845).
