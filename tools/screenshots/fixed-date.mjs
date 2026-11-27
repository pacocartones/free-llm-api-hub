// fixed-date.mjs — pins the clock to SCREENSHOT_NOW (an ISO timestamp) for a deterministic build.
// Loaded with `node --import ./tools/screenshots/fixed-date.mjs scripts/build.mjs`, so `new Date()` and `Date.now()`
// in the build return that instant while dated constructors (`new Date('2026-01-01')`) behave as usual.
// The same function is injected into every page the screenshot runner opens (see run.mjs).

export function pinClock(iso) {
  const NOW = Date.parse(iso);
  if (Number.isNaN(NOW)) throw new Error(`Not a date: ${iso}`);
  const Real = Date;
  class FixedDate extends Real {
    constructor(...args) { if (args.length) super(...args); else super(NOW); }
    static now() { return NOW; }
  }
  globalThis.Date = FixedDate;
}

if (typeof process !== 'undefined' && process.env && process.env.SCREENSHOT_NOW) pinClock(process.env.SCREENSHOT_NOW);
