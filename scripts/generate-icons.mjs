/*
 * Generates the extension toolbar/store icons (16/32/48/128 px PNG) without
 * any image dependency. The design mirrors public/favicon.svg: a gift parcel
 * with ribbon and a small tree on a soft pink rounded square. Shapes are
 * rendered as a binary 1536x1536 mask (24x supersampling of the 64x64
 * design grid) and box-filtered down to each target size for antialiasing.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TARGET = resolve(here, "..", "extension-src", "icons");

const SUPER = 1536;
const SCALE = SUPER / 64;

const COLORS = {
  background: [255, 247, 249, 255],
  box: [225, 75, 106, 255],
  ribbon: [255, 216, 62, 255],
  tree: [8, 127, 69, 255],
  star: [255, 216, 62, 255]
};

/* ------------------------------------------------------------------
 * Minimal PNG encoder (RGBA, 8 bit, no interlace)
 * ------------------------------------------------------------------ */

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));

  return Buffer.concat([length, body, checksum]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ------------------------------------------------------------------
 * Shape rasterisation on the 64-unit design grid
 * ------------------------------------------------------------------ */

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) {
    return false;
  }

  const dx = Math.max(left + radius - x, x - (right - radius), 0);
  const dy = Math.max(top + radius - y, y - (bottom - radius), 0);

  return dx * dx + dy * dy <= radius * radius;
}

function insideTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);

  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNegative && hasPositive);
}

function pickColor(x, y) {
  // star sits on the tree tip
  if ((x - 32) ** 2 + (y - 9) ** 2 <= 4 ** 2) {
    return COLORS.star;
  }

  if (insideTriangle(x, y, 32, 5, 41.5, 24, 22.5, 24)) {
    return COLORS.tree;
  }

  const inBox = insideRoundedRect(x, y, 11, 20, 53, 52, 5);

  if (!inBox) {
    return null;
  }

  // vertical and horizontal ribbon stripes over the parcel
  if ((x >= 27.5 && x <= 36.5) || (y >= 31 && y <= 38.5)) {
    return COLORS.ribbon;
  }

  return COLORS.box;
}

function renderSuperSampled() {
  const pixels = Buffer.alloc(SUPER * SUPER * 4);

  for (let py = 0; py < SUPER; py++) {
    const designY = py / SCALE;

    for (let px = 0; px < SUPER; px++) {
      const designX = px / SCALE;
      const offset = (py * SUPER + px) * 4;

      if (
        insideRoundedRect(designX, designY, 0.25, 0.25, 63.75, 63.75, 15.5)
      ) {
        const color = pickColor(designX, designY) || COLORS.background;
        pixels.set(color, offset);
      }
    }
  }

  return pixels;
}

function boxDownscale(source, sourceSize, targetSize) {
  const factor = sourceSize / targetSize;
  const pixels = Buffer.alloc(targetSize * targetSize * 4);

  for (let y = 0; y < targetSize; y++) {
    const sourceY0 = Math.floor(y * factor);
    const sourceY1 = Math.min(
      sourceSize,
      Math.max(sourceY0 + 1, Math.floor((y + 1) * factor))
    );

    for (let x = 0; x < targetSize; x++) {
      const sourceX0 = Math.floor(x * factor);
      const sourceX1 = Math.min(
        sourceSize,
        Math.max(sourceX0 + 1, Math.floor((x + 1) * factor))
      );

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let sy = sourceY0; sy < sourceY1; sy++) {
        for (let sx = sourceX0; sx < sourceX1; sx++) {
          const offset = (sy * sourceSize + sx) * 4;
          const alpha = source[offset + 3] / 255;

          r += source[offset] * alpha;
          g += source[offset + 1] * alpha;
          b += source[offset + 2] * alpha;
          a += source[offset + 3];
          count++;
        }
      }

      const coverage = a / (count * 255);
      const offset = (y * targetSize + x) * 4;

      if (coverage <= 0) {
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
        pixels[offset + 3] = 0;
        continue;
      }

      pixels[offset] = Math.round(r / (count * coverage));
      pixels[offset + 1] = Math.round(g / (count * coverage));
      pixels[offset + 2] = Math.round(b / (count * coverage));
      pixels[offset + 3] = Math.round(a / count);
    }
  }

  return pixels;
}

export async function generateIconSet(targetDir = DEFAULT_TARGET) {
  await mkdir(targetDir, { recursive: true });

  const source = renderSuperSampled();
  const written = [];

  for (const size of [16, 32, 48, 128]) {
    const pixels = boxDownscale(source, SUPER, size);
    const png = encodePng(size, size, pixels);
    const file = resolve(targetDir, `icon${size}.png`);

    await writeFile(file, png);
    written.push(file);
  }

  return written;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  generateIconSet(process.argv[2] || DEFAULT_TARGET)
    .then((files) => {
      console.log("Icons written:");
      for (const file of files) {
        console.log(`  ${file}`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
