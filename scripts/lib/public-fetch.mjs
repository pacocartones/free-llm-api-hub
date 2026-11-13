// Outbound reader for provider-controlled documentation URLs. The address is
// checked in the same DNS lookup that supplies the socket, and every redirect
// comes back through this module before another connection is opened.
import { lookup as dnsLookup } from 'node:dns';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'host', 'proxy-authorization']);

export class UnsafeUrlError extends Error {
  constructor(message) { super(message); this.name = 'UnsafeUrlError'; }
}

export class ResponseTooLargeError extends Error {
  constructor(maxBytes) {
    super(`response exceeds ${maxBytes}-byte limit`);
    this.name = 'ResponseTooLargeError';
  }
}

export class UnsupportedContentEncodingError extends Error {
  constructor(encoding) {
    super(`unsupported Content-Encoding: ${encoding}`);
    this.name = 'UnsupportedContentEncodingError';
  }
}

function requestLifecycle(externalSignal, timeoutMs) {
  const controller = new AbortController();
  const timeoutError = new DOMException(`documentation request exceeded ${timeoutMs}ms deadline`, 'TimeoutError');
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  const forwardAbort = () => controller.abort(
    externalSignal.reason || new DOMException('documentation request aborted', 'AbortError')
  );
  if (externalSignal?.aborted) forwardAbort();
  else externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  let cleaned = false;
  return {
    signal: controller.signal,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', forwardAbort);
    },
    normalize(error) {
      return controller.signal.aborted ? (controller.signal.reason || error) : error;
    },
  };
}

function isPublicIpv4(address) {
  const [a, b, c, d] = address.split('.').map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    // Azure's platform virtual address is reachable only from inside a VM.
    (a === 168 && b === 63 && c === 129 && d === 16) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function ipv6Words(address) {
  let input = address.split('%', 1)[0].toLowerCase();
  if (input.includes('.')) {
    const colon = input.lastIndexOf(':');
    const v4 = input.slice(colon + 1);
    if (isIP(v4) !== 4) return null;
    const octets = v4.split('.').map(Number);
    input = `${input.slice(0, colon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = input.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || (halves.length === 2 && omitted < 1)) return null;
  const groups = halves.length === 1 ? left : [...left, ...Array(omitted).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

function isPublicIpv6(address) {
  const words = ipv6Words(address);
  if (!words) return false;
  // IPv4-mapped IPv6 must obey the IPv4 policy too.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const mapped = `${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`;
    return isPublicIpv4(mapped);
  }
  // Currently allocated public unicast space. This excludes unspecified,
  // loopback, link-local, unique-local, multicast and IPv4 transition ranges.
  if ((words[0] & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2002) return false; // 6to4 embeds an IPv4 destination.
  // IETF special-purpose space and documentation prefixes inside 2000::/3.
  if (words[0] === 0x2001 && words[1] <= 0x01ff) return false;
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false;
  if (words[0] === 0x3fff && (words[1] & 0xf000) === 0) return false;
  return true;
}

/** True only for globally routable unicast addresses accepted by documentation readers. */
export function isPublicAddress(address) {
  const plain = String(address || '').split('%', 1)[0];
  const family = isIP(plain);
  if (family === 4) return isPublicIpv4(plain);
  if (family === 6) return isPublicIpv6(plain);
  return false;
}

function bareHostname(url) {
  return url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname;
}

/** Returns null for a canonical public HTTPS URL, otherwise a reviewer-facing reason. */
export function publicHttpsUrlError(value) {
  if (typeof value !== 'string' || !value || value.trim() !== value) return 'address must be a non-empty string without surrounding whitespace';
  let url;
  try { url = new URL(value); }
  catch { return 'address is not a valid absolute URL'; }
  if (url.protocol !== 'https:') return 'address must use HTTPS';
  if (url.username || url.password) return 'address must not contain credentials';
  const hostname = bareHostname(url).toLowerCase();
  if (!hostname) return 'address must name a host';
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return 'localhost is not a public destination';
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.home.arpa')) return 'address must not use a private-use hostname';
  if (!isIP(hostname) && !hostname.replace(/\.$/, '').includes('.')) return 'address must use a fully qualified public hostname';
  if (isIP(hostname) && !isPublicAddress(hostname)) return 'address must not target a non-public IP address';
  return null;
}

function parsePublicHttpsUrl(value) {
  const problem = publicHttpsUrlError(value instanceof URL ? value.href : value);
  if (problem) throw new UnsafeUrlError(problem);
  return value instanceof URL ? value : new URL(value);
}

/** Resolves and validates a redirect target before the next request is made. */
export function resolvePublicRedirect(current, location) {
  let next;
  try { next = new URL(location, current); }
  catch { throw new UnsafeUrlError('redirect location is not a valid URL'); }
  return parsePublicHttpsUrl(next);
}

/**
 * A socket lookup that rejects the whole DNS result if any answer is not
 * public, then returns one of those exact checked addresses to the connector.
 */
export function createPublicLookup(resolver = dnsLookup) {
  return (hostname, options, callback) => {
    const requested = typeof options === 'number' ? { family: options } : { ...(options || {}) };
    resolver(hostname, { ...requested, all: true, verbatim: true }, (error, addresses) => {
      if (error) { callback(error); return; }
      if (!Array.isArray(addresses) || addresses.length === 0) {
        callback(new UnsafeUrlError(`DNS returned no addresses for ${hostname}`)); return;
      }
      const unsafe = addresses.find(({ address }) => !isPublicAddress(address));
      if (unsafe) {
        callback(new UnsafeUrlError(`DNS resolved ${hostname} to non-public address ${unsafe.address}`)); return;
      }
      if (requested.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function checkedHeaders(headers) {
  const clean = {};
  let acceptsEncoding = false;
  for (const [name, value] of Object.entries(headers || {})) {
    if (SENSITIVE_HEADERS.has(name.toLowerCase())) throw new UnsafeUrlError(`documentation requests must not send the ${name} header`);
    if (name.toLowerCase() === 'accept-encoding') {
      if (String(value).trim().toLowerCase() !== 'identity') {
        throw new UnsafeUrlError('Accept-Encoding must be identity for bounded documentation reads');
      }
      acceptsEncoding = true;
    }
    clean[name] = value;
  }
  // Native fetch decoded compressed bodies; request identity so this small
  // fetch-like wrapper keeps returning readable text without a codec stack.
  if (!acceptsEncoding) clean['accept-encoding'] = 'identity';
  return clean;
}

function responseHeaders(headers) {
  return {
    get(name) {
      const value = headers[String(name).toLowerCase()];
      return Array.isArray(value) ? value.join(', ') : value ?? null;
    },
  };
}

function declaredLength(headers) {
  const value = responseHeaders(headers).get('content-length');
  if (!/^\d+$/.test(value || '')) return null;
  try { return BigInt(value); } catch { return null; }
}

function boundedBody(response, maxBytes, lifecycle) {
  const reader = Readable.toWeb(response).getReader();
  let bytesRead = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) { lifecycle.cleanup(); controller.close(); return; }
        if (value.byteLength > maxBytes - bytesRead) {
          const error = new ResponseTooLargeError(maxBytes);
          response.destroy(error);
          try { await reader.cancel(error); } catch { /* preserve the size error */ }
          lifecycle.cleanup();
          controller.error(error);
          return;
        }
        bytesRead += value.byteLength;
        controller.enqueue(value);
      } catch (error) {
        lifecycle.cleanup();
        controller.error(lifecycle.normalize(error));
      }
    },
    async cancel(reason) {
      response.destroy(reason instanceof Error ? reason : undefined);
      try { await reader.cancel(reason); } catch { /* cancellation remains best effort */ }
      finally { lifecycle.cleanup(); }
    },
  });
}

async function requestHop(input, { headers, maxBytes }, redirects, transport, lifecycle) {
  const url = parsePublicHttpsUrl(input);
  return new Promise((resolve, reject) => {
    const request = transport.requestImpl(url, {
      method: 'GET',
      headers,
      lookup: transport.lookup,
      agent: transport.agent,
      signal: lifecycle.signal,
    }, (response) => {
      const location = response.headers.location;
      if (location && REDIRECT_STATUSES.has(response.statusCode)) {
        response.destroy();
        if (redirects >= MAX_REDIRECTS) { reject(new UnsafeUrlError(`documentation request exceeded ${MAX_REDIRECTS} redirects`)); return; }
        let next;
        try { next = resolvePublicRedirect(url, location); }
        catch (error) { reject(error); return; }
        requestHop(next, { headers, maxBytes }, redirects + 1, transport, lifecycle).then(resolve, reject);
        return;
      }
      const encoding = responseHeaders(response.headers).get('content-encoding')?.trim() || '';
      if (encoding && encoding.toLowerCase() !== 'identity') {
        const error = new UnsupportedContentEncodingError(encoding);
        response.destroy();
        reject(error);
        return;
      }
      const length = declaredLength(response.headers);
      if (length !== null && length > BigInt(maxBytes)) {
        const error = new ResponseTooLargeError(maxBytes);
        response.destroy();
        reject(error);
        return;
      }
      const bodyResponse = new Response(boundedBody(response, maxBytes, lifecycle));
      resolve({
        status: response.statusCode || 0,
        ok: response.statusCode >= 200 && response.statusCode < 300,
        url: url.href,
        redirected: redirects > 0,
        headers: responseHeaders(response.headers),
        body: bodyResponse.body,
        text: () => bodyResponse.text(),
      });
    });
    request.on('error', reject);
    request.end();
  });
}

/** Creates a fetch-like GET whose owned agent cannot inherit global proxy or pooling behavior. */
export function createPublicFetch({
  requestImpl = httpsRequest,
  resolver = dnsLookup,
  agent = new HttpsAgent({ keepAlive: false }),
} = {}) {
  const transport = { requestImpl, lookup: createPublicLookup(resolver), agent };
  return (input, {
    headers = {},
    signal,
    maxBytes = MAX_RESPONSE_BYTES,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {}) => {
    const lifecycle = requestLifecycle(signal, timeoutMs);
    return Promise.resolve().then(() => requestHop(
      input,
      { headers: checkedHeaders(headers), maxBytes },
      0,
      transport,
      lifecycle
    )).catch((error) => {
      lifecycle.cleanup();
      throw lifecycle.normalize(error);
    });
  };
}

/** Fetch-like GET for public documentation, with address-pinned DNS and manual redirects. */
export const fetchPublicUrl = createPublicFetch();
