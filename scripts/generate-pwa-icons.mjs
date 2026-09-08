/**
 * Generates the PWA icon set (FEATURE_PLAN.md §20 subtasks 1 & 3) as raw PNGs
 * with zero dependencies (Node's built-in zlib + a small CRC32).
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 * The design is a rounded accent square with a white medical cross — enough
 * to satisfy the installability criteria (192/512 + maskable with the cross
 * inside the 66 % safe zone). Swap in real brand art when available and
 * re-run, or replace the PNGs in public/icons/ directly.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const ACCENT = [15, 107, 181]; // #0f6bb5 — matches --accent / manifest theme_color
const WHITE = [255, 255, 255];

// ---- minimal PNG encoder (8-bit RGBA, no interlace) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode `rgba` (Uint8Array, size*size*4) as a PNG buffer. */
function png(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = size * 4 + 1; // filter byte per scanline
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4).copy(
      raw,
      y * stride + 1
    );
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- drawing ----

/** Rounded-rect mask for a size×size canvas with corner radius r. */
function inRoundedRect(x, y, size, r) {
  const x0 = r;
  const y0 = r;
  const x1 = size - 1 - r;
  const y1 = size - 1 - r;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 - x, x - x1, 0);
  const dy = Math.max(y0 - y, y - y1, 0);
  return dx * dx + dy * dy <= r * r;
}

/**
 * White medical cross centered in a `content`-sized box (the maskable safe
 * zone). Bar thickness is 14 % of the box, bars are 56 % long.
 */
function inCross(x, y, content) {
  const half = content / 2;
  const thick = content * 0.14;
  const length = content * 0.56;
  const hx = Math.abs(x - half);
  const hy = Math.abs(y - half);
  return (hx <= thick && hy <= length / 2) || (hy <= thick && hx <= length / 2);
}

/**
 * Render one icon. `scale` shrinks the design (cross) to keep it inside the
 * maskable safe zone: scale 1 for regular icons, ~0.66 for the maskable one.
 */
function render(size, scale) {
  const rgba = new Uint8Array(size * size * 4);
  const content = Math.round(size * scale);
  const offset = Math.round((size - content) / 2);
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundedRect(x, y, size, r)) {
        rgba[i + 3] = 0; // transparent outside the rounded square
        continue;
      }
      const [cr, cg, cb] = inCross(x - offset, y - offset, content) ? WHITE : ACCENT;
      rgba[i] = cr;
      rgba[i + 1] = cg;
      rgba[i + 2] = cb;
      rgba[i + 3] = 255;
    }
  }
  return png(size, rgba);
}

mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.66],
];
for (const [name, size, scale] of targets) {
  writeFileSync(join(OUT, name), render(size, scale));
  console.log(`wrote public/icons/${name}`);
}