// Bounded body reads for maintenance scripts that call provider APIs with the
// global fetch (model catalogues, probes, discovery). A misbehaving or hostile
// endpoint must not be able to stream an unbounded body into memory.

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

/** Reads a fetch Response body as text, failing once it exceeds maxBytes. */
export const readBoundedText = async (res, maxBytes = MAX_CATALOG_BYTES) => {
  const declared = res.headers?.get?.('content-length')?.trim() || '';
  if (/^\d+$/.test(declared) && Number(declared) > maxBytes) {
    discardBody(res);
    throw new ResponseTooLargeError(maxBytes);
  }
  if (!res.body) return '';
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
