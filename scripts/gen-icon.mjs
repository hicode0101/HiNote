// Generate the HiNote source icon (1024x1024 PNG) without any image
// dependency: a Fluent-blue rounded square with a white document glyph.
// Feed it to `npx tauri icon` to produce the full platform icon set.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 1024;
const SS = 2; // supersampling factor per axis

// ---- geometry --------------------------------------------------------

function roundedRectCoverage(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dist = Math.hypot(x - cx, y - cy) - r;
  return Math.min(Math.max(0.5 - dist / 1.6, 0), 1);
}

// Background gradient: top (60,130,226) -> bottom (0,95,184)
function bgColor(t) {
  return [
    Math.round(lerp(60, 0, t)),
    Math.round(lerp(130, 95, t)),
    Math.round(lerp(226, 184, t)),
  ];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix(c1, c2, t) {
  return [
    lerp(c1[0], c2[0], t),
    lerp(c1[1], c2[1], t),
    lerp(c1[2], c2[2], t),
  ];
}

const WHITE = [255, 255, 255];
const ACCENT = [0, 103, 192];

// Document glyph + its three text lines
const DOC = { x0: 336, y0: 246, x1: 688, y1: 778, r: 44 };
const LINES = [
  { x0: 400, y0: 417, x1: 624, y1: 443, r: 13 },
  { x0: 400, y0: 492, x1: 624, y1: 518, r: 13 },
  { x0: 400, y0: 567, x1: 540, y1: 593, r: 13 },
];

// ---- render ----------------------------------------------------------

function pixel(px, py) {
  // 2x2 supersample
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = px + (sx + 0.5) / SS;
      const y = py + (sy + 0.5) / SS;

      const bg = roundedRectCoverage(x, y, 0, 0, SIZE, SIZE, 176);
      let color = [0, 0, 0];
      if (bg > 0) {
        color = bgColor(Math.min(Math.max((y / SIZE - 0.12) / 0.76, 0), 1));

        const doc = roundedRectCoverage(x, y, DOC.x0, DOC.y0, DOC.x1, DOC.y1, DOC.r);
        if (doc > 0) {
          color = mix(color, WHITE, doc);
          for (const line of LINES) {
            const lc =
              roundedRectCoverage(x, y, line.x0, line.y0, line.x1, line.y1, line.r) * doc;
            if (lc > 0) color = mix(color, ACCENT, lc);
          }
        }
      }
      r += color[0] * bg;
      g += color[1] * bg;
      b += color[2] * bg;
      a += bg;
    }
  }
  const n = SS * SS;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round((a / n) * 255)];
}

// ---- PNG encode ------------------------------------------------------

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    let c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let off = 0;
for (let y = 0; y < SIZE; y++) {
  raw[off++] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixel(x, y);
    raw[off++] = r;
    raw[off++] = g;
    raw[off++] = b;
    raw[off++] = a;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "scripts");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "icon.png");
writeFileSync(out, png);
console.log(`[gen-icon] wrote ${out} (${SIZE}x${SIZE})`);
