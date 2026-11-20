import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPdf, pdfToText } from './lib/pdf-text.mjs';
import { readText, entriesFor } from './lib/quotes-add.mjs';
import { judgeReading, readingText, PDF_METHOD, METHOD } from './lib/page-text.mjs';

// A minimal valid PDF: one page, Helvetica, one text line per entry of `lines`.
function makePdf(lines) {
  const content = ['BT', '/F1 12 Tf', '72 720 Td', ...lines.flatMap((l, i) => [i ? '0 -16 Td' : '', `(${l.replace(/[()\\]/g, '\\$&')}) Tj`]).filter(Boolean), 'ET'].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n'; const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

// Lines stay short: pdf.js drops glyphs that fall outside the page box, as a real wrapped document never has them.
const LONG_LINES = ['NVIDIA will not store or use User Content or Generated Content', 'at the end of each API Service session. These lines pad the page so', 'it is long enough to count as a readable document for the register.'];
const LONG = LONG_LINES.join(' ');
const SPLIT = ['Unless you purchase a Subscription, you may only use the API Service', 'for internal testing and evaluation purposes, not in production.'];

test('isPdf: by Content-Type, or by a .pdf path when the type is generic', () => {
  assert.equal(isPdf('application/pdf', 'https://x.example/terms'), true);
  assert.equal(isPdf('application/pdf; charset=binary', 'https://x.example/t'), true);
  assert.equal(isPdf('application/octet-stream', 'https://x.example/legal/Trial%20Terms.pdf'), true);
  assert.equal(isPdf('text/html', 'https://x.example/terms'), false);
  assert.equal(isPdf('', 'not a url'), false);
});

test('pdfToText extracts the text and collapses a line break inside a sentence into one space', async () => {
  const text = await pdfToText(makePdf([...LONG_LINES, ...SPLIT]));
  assert.ok(text.includes(LONG), text);
  assert.ok(text.includes(SPLIT.join(' ')), 'the two lines read as one sentence');
  assert.doesNotMatch(text, /\s{2}/);
});

test('pdfToText refuses a file that is not a PDF', async () => {
  await assert.rejects(pdfToText(new TextEncoder().encode('<html>not a pdf</html>')));
});

const fakeFetch = (bytes, type = 'application/pdf') => async () => ({
  ok: true, status: 200, headers: new Headers({ 'content-type': type }),
  body: new Response(bytes).body, text: async () => Buffer.from(bytes).toString('latin1'),
});

test('quotes:add reads a PDF source, records the PDF method and finds a quote across a line break', async () => {
  const bytes = makePdf([...LONG_LINES, ...SPLIT]);
  const page = await readText('https://assets.example/terms.pdf', fakeFetch(bytes));
  assert.equal(page.ok, true, page.why);
  assert.equal(page.method, PDF_METHOD);
  const policy = { source: 'https://assets.example/terms.pdf', quote: SPLIT.join(' ') };
  const { entries, problems } = await entriesFor('demo', policy, (u) => readText(u, fakeFetch(bytes)), { today: '2026-11-20' });
  assert.deepEqual(problems, []);
  assert.equal(entries[0].method, PDF_METHOD);
  assert.match(entries[0].page_sha256, /^[0-9a-f]{64}$/);
});

test('quotes:add keeps PDF sources English-only and refuses a PDF with almost no text', async () => {
  const bytes = makePdf(LONG_LINES);
  assert.equal((await readText('https://assets.example/terms.pdf', fakeFetch(bytes), 'de')).ok, false);
  assert.equal((await readText('https://assets.example/short.pdf', fakeFetch(makePdf(['Too short'])))).ok, false);
});

test('verify-quotes judges a PDF reading on its text, with no language declaration needed', () => {
  const reading = { status: 200, pdfText: `${LONG} ${SPLIT.join(' ')}` };
  assert.equal(readingText(reading), reading.pdfText);
  assert.equal(judgeReading(reading, SPLIT.join(' ')), 'ok');
  assert.equal(judgeReading(reading, 'a sentence that is not there'), 'expired');
  assert.equal(judgeReading({ status: 200, pdfText: 'short' }, 'short'), 'unreachable');
  assert.notEqual(PDF_METHOD, METHOD);
});
