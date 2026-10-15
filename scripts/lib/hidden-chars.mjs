// hidden-chars.mjs — the ONE definition of the characters that must never appear in a quoted sentence or a note:
// they are invisible or change how the text reads, so what a reader sees would differ from what the data says.
// Control characters, soft hyphen, combining grapheme joiner, Arabic letter mark, Mongolian vowel separator,
// bidirectional marks and overrides, zero-width characters, variation selectors and tag characters.
// Both the data_policy sentence (scripts/validate.mjs) and the coding tools sentences (scripts/lib/coding-tools.mjs)
// use this file, so the two rules cannot drift apart.

export const HIDDEN_CHARS_RE = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufe00-\ufe0f\ufeff\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/u;

/** true when the text holds at least one hidden character. */
export const hasHiddenChars = (text) => typeof text === 'string' && HIDDEN_CHARS_RE.test(text);
