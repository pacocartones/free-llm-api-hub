// Bounded body reads for maintenance scripts that fetch provider or public pages
// (model catalogues, probes, discovery, source checks, re-verification dossiers).
// A misbehaving or hostile endpoint must not be able to stream an unbounded body
// into memory. This is the one implementation; callers pick their own limit.

export const MAX_CATALOG_BYTES = 16 * 1024 * 1024;

export class ResponseTooLargeError extends Error {
  constructor(maxBytes) {
    super(`response exceeds ${maxBytes}-byte limit`);
    this.name = 'ResponseTooLargeError';
  }
}

const cancelQuietly = (target) => {
  try {
    const cancellation = target?.cancel();
    cancellation?.catch(() => {});
  } catch { /* the response is already being abandoned */ }
};

/** Discards a response body without reading it (e.g. after a non-2xx status). */
export const discardBody = (res) => cancelQuietly(res?.body);

/**
 * Reads a fetch Response body as text, failing once it exceeds maxBytes.
 * A missing body reads as '' unless `requireBody` is set, in which case it throws.
 */
export const readBoundedText = async (res, maxBytes = MAX_CATALOG_BYTES, { requireBody = false } = {}) => {
  const declared = res.headers?.get?.('content-length')?.trim() || '';
  // BigInt keeps the comparison exact for declared lengths beyond Number's safe range.
  if (/^\d+$/.test(declared) && BigInt(declared) > BigInt(maxBytes)) {
    discardBody(res);
    throw new ResponseTooLargeError(maxBytes);
  }
  if (!res.body) {
    if (requireBody) throw new Error('response body is not a readable stream');
    return '';
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > maxBytes - bytesRead) {
        cancelQuietly(reader);
        throw new ResponseTooLargeError(maxBytes);
      }
      bytesRead += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    reader.releaseLock();
  }
};

/** Reads a bounded body and parses it as JSON (throws SyntaxError if invalid). */
export const readBoundedJson = async (res, maxBytes = MAX_CATALOG_BYTES) =>
  JSON.parse(await readBoundedText(res, maxBytes));
