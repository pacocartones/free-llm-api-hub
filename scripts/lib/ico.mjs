// ico.mjs — wraps one PNG in an ICO container (a PNG-compressed icon entry, supported by every current browser).
// /favicon.ico is what browsers, feed readers and crawlers ask for when a page names no icon; without it each of
// those requests was a 404. site/favicon.ico is the committed 32 px favicon-32.png wrapped this way (`npm run icons`).
export function pngToIco(png) {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47 || png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('not a PNG');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width > 256 || height > 256) throw new Error(`ICO entries are at most 256 px (got ${width}x${height})`);
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); // reserved
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(1, 4); // one image
  head.writeUInt8(width === 256 ? 0 : width, 6);
  head.writeUInt8(height === 256 ? 0 : height, 7);
  head.writeUInt8(0, 8); // no palette
  head.writeUInt8(0, 9); // reserved
  head.writeUInt16LE(1, 10); // colour planes
  head.writeUInt16LE(32, 12); // bits per pixel
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18); // offset of the image data
  return Buffer.concat([head, png]);
}
