/*
 * Minimal deterministic ZIP writer (deflate, no external tools).
 *
 * Timestamps are pinned to 1980-01-01 and entries are written in sorted
 * order, so identical inputs always produce byte-identical archives —
 * a prerequisite for reproducible dist artifacts.
 */
import { deflateRawSync } from "node:zlib";

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

export function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/* 1980-01-01, 00:00:00 in MS-DOS packed format. */
const DOS_TIME = 0;
const DOS_DATE = 0x0021;
const EXTERNAL_ATTRS = (0o100644 << 16) >>> 0;

function localFileHeader(name, data, compressed, crc) {
  const header = Buffer.alloc(30);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4); // version needed: 2.0
  header.writeUInt16LE(0, 6); // flags
  header.writeUInt16LE(8, 8); // method: deflate
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28); // extra field length

  return Buffer.concat([header, name]);
}

function centralDirectoryEntry(name, data, compressed, crc, offset) {
  const header = Buffer.alloc(46);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4); // version made by
  header.writeUInt16LE(20, 6); // version needed
  header.writeUInt16LE(0, 8); // flags
  header.writeUInt16LE(8, 10); // method
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressed.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30); // extra field length
  header.writeUInt16LE(0, 32); // comment length
  header.writeUInt16LE(0, 34); // disk number start
  header.writeUInt16LE(0, 36); // internal attributes
  header.writeUInt32LE(EXTERNAL_ATTRS, 38);
  header.writeUInt32LE(offset, 42);

  return Buffer.concat([header, name]);
}

/*
 * entries: [{ path, data }] — paths must be relative, POSIX-style and
 * unique. Returns the archive as a Buffer.
 */
export function createZip(entries) {
  const sorted = [...entries].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  );

  if (new Set(sorted.map((entry) => entry.path)).size !== sorted.length) {
    throw new Error("ZIP entries contain duplicate paths");
  }

  const chunks = [];
  const directory = [];
  let offset = 0;

  for (const entry of sorted) {
    if (!entry.path || entry.path.includes("\\")) {
      throw new Error(`Invalid ZIP entry path: ${entry.path}`);
    }

    const name = Buffer.from(entry.path, "utf8");
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    chunks.push(localFileHeader(name, entry.data, compressed, crc), compressed);
    directory.push(
      centralDirectoryEntry(name, entry.data, compressed, crc, offset)
    );

    offset += 30 + name.length + compressed.length;
  }

  const directoryBuffer = Buffer.concat(directory);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(directoryBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, directoryBuffer, eocd]);
}
