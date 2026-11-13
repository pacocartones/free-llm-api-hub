import { fetchPublicUrl } from './public-fetch.mjs';

const REQUEST_TIMEOUT_MS = 20000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

class ResponseTooLargeError extends Error {
  constructor(maxBytes) {
    super(`response exceeds ${maxBytes}-byte limit`);
    this.name = 'ResponseTooLargeError';
  }
}

const cancelBody = (body) => {
  try {
    const cancellation = body?.cancel();
    cancellation?.catch(() => {});
  } catch { /* the response is already being abandoned */ }
};

const readBoundedText = async (res, maxBytes) => {
  const contentLength = res.headers.get('content-length');
  const declaredBytes = contentLength?.trim() || '';
  if (/^\d+$/.test(declaredBytes) && Number(declaredBytes) > maxBytes) {
    cancelBody(res.body);
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
        try {
          const cancellation = reader.cancel();
          cancellation?.catch(() => {});
        } catch { /* report the limit even if cancellation also fails */ }
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

// Single-pass entity decode: one regex + callback, so entities are never
// double-unescaped (e.g. &amp;amp; -> &amp;, not &).
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decodeEntities = (s) => s.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] || m);
const stripHtml = (html) => {
  // Tolerant of whitespace AND stray attributes inside tags (e.g. <script >,
  // </script bar>), so a malformed end tag cannot leave script content behind.
  const s = decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
  return s.length > 6000 ? s.slice(0, 6000) + '…' : s;
};

export const fetchDocs = async (p, {
  fetchImpl = fetchPublicUrl,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxBytes = MAX_RESPONSE_BYTES,
} = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  timer.unref?.();
  try {
    const res = await fetchImpl(p.docs_url, {
      signal: ctrl.signal,
      timeoutMs,
      maxBytes,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; free-llm-api-hub-reverify/1.0)' },
    });
    const ct = res.headers.get('content-type') || '';
    if (!res.ok) {
      cancelBody(res.body);
      return { status: `HTTP ${res.status}`, text: '' };
    }
    if (!/html|text|markdown/.test(ct)) {
      cancelBody(res.body);
      return { status: String(res.status), text: '(non-text body — review manually)' };
    }
    const body = await readBoundedText(res, maxBytes);
    return { status: String(res.status), text: stripHtml(body) };
  } catch (e) {
    return { status: `fetch error: ${e.name === 'AbortError' || e.name === 'TimeoutError' ? 'timeout' : e.message}`, text: '' };
  } finally {
    clearTimeout(timer);
  }
};
