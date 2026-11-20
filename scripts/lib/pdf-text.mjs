// The text of a PDF source, for the few providers that publish their terms only as a PDF (for example NVIDIA's API Trial Terms).
// It is the PDF counterpart of htmlToText in page-text.mjs, and the register records which of the two methods read each page.
//
// Method (recorded in data/quotes.json as `method`, see PDF_METHOD in page-text.mjs):
//   1. the PDF is parsed with unpdf (a bundled build of Mozilla's pdf.js), with script evaluation off and no font loading;
//   2. the text of every page is extracted and the pages are joined;
//   3. every run of white space (including no-break spaces) is collapsed into one space and the result trimmed.
// A line break inside a sentence therefore becomes one space, as it does for HTML.
// unpdf is a devDependency and is loaded only when a PDF is actually read, so HTML-only paths stay dependency-free.
import { collapse } from './page-text.mjs';

/** True when a response is a PDF: by its Content-Type, or, when the server sends a generic type, by the .pdf path. */
export function isPdf(contentType, url) {
  if (/^application\/pdf\b/i.test(String(contentType || '').trim())) return true;
  try { return /\.pdf$/i.test(new URL(url).pathname); } catch { return false; }
}

/** Extracts the collapsed text of a PDF from its bytes. Throws on a file pdf.js cannot parse. */
export async function pdfToText(bytes) {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, disableFontFace: true, verbosity: 0 });
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    return collapse(Array.isArray(text) ? text.join(' ') : String(text || ''));
  } finally {
    await pdf.destroy?.();
  }
}

/** Reads a response body as bytes (the public-URL transport exposes the bounded body as a web stream). */
export async function responseBytes(res) {
  if (typeof res.arrayBuffer === 'function') return new Uint8Array(await res.arrayBuffer());
  return new Uint8Array(await new Response(res.body).arrayBuffer());
}
