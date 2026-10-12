import { deflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  CRC_TABLE[n] = value >>> 0;
}

export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function bytesOf(value) {
  if (value === undefined || value === null) return Buffer.alloc(0);
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function writeU16(buffer, offset, value) {
  buffer.writeUInt16LE(value & 0xffff, offset);
}

function writeU32(buffer, offset, value) {
  buffer.writeUInt32LE(value >>> 0, offset);
}

function extraBytes(value) {
  return bytesOf(value);
}

function makeEocd({ diskNumber = 0, centralDiskNumber = 0, entriesOnDisk, totalEntries, centralSize, centralOffset, comment }) {
  const header = Buffer.alloc(22);
  writeU32(header, 0, 0x06054b50);
  writeU16(header, 4, diskNumber);
  writeU16(header, 6, centralDiskNumber);
  writeU16(header, 8, entriesOnDisk);
  writeU16(header, 10, totalEntries);
  writeU32(header, 12, centralSize);
  writeU32(header, 16, centralOffset);
  writeU16(header, 20, comment.length);
  return Buffer.concat([header, comment]);
}

/**
 * 生成小型 ZIP 和有意畸形的变体。解析目标只需 ZIP 元数据，因此可单独声明压缩/未压缩长度。
 */
export function buildZip(entries = [], options = {}) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;

  for (const entry of entries) {
    const centralName = entry.nameBytes ? bytesOf(entry.nameBytes) : Buffer.from(entry.name ?? "", "utf8");
    const localName = entry.localNameBytes
      ? bytesOf(entry.localNameBytes)
      : entry.localName !== undefined
        ? Buffer.from(entry.localName, "utf8")
        : centralName;
    const data = bytesOf(entry.data);
    const method = entry.method ?? 0;
    const flags = entry.flags ?? 0x0800;
    const compressed = entry.compressedData !== undefined
      ? bytesOf(entry.compressedData)
      : method === 8
        ? deflateRawSync(data)
        : data;
    const compressedSize = entry.compressedSize ?? compressed.length;
    const uncompressedSize = entry.uncompressedSize ?? data.length;
    const checksum = entry.crc32 ?? crc32(data);
    const localFlags = entry.localFlags ?? flags;
    const localMethod = entry.localMethod ?? method;
    const localCompressedSize = entry.localCompressedSize ?? compressedSize;
    const localUncompressedSize = entry.localUncompressedSize ?? uncompressedSize;
    const localChecksum = entry.localCrc32 ?? checksum;
    const localExtra = extraBytes(entry.localExtra);
    const centralExtra = extraBytes(entry.centralExtra);
    const local = Buffer.alloc(30);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, entry.versionNeeded ?? 20);
    writeU16(local, 6, localFlags);
    writeU16(local, 8, localMethod);
    writeU32(local, 14, localChecksum);
    writeU32(local, 18, localCompressedSize);
    writeU32(local, 22, localUncompressedSize);
    writeU16(local, 26, localName.length);
    writeU16(local, 28, localExtra.length);
    const localRecord = Buffer.concat([local, localName, localExtra, compressed]);
    localRecords.push(localRecord);

    const central = Buffer.alloc(46);
    writeU32(central, 0, 0x02014b50);
    writeU16(central, 4, entry.versionMadeBy ?? 20);
    writeU16(central, 6, entry.versionNeeded ?? 20);
    writeU16(central, 8, flags);
    writeU16(central, 10, method);
    writeU32(central, 16, entry.centralCrc32 ?? checksum);
    writeU32(central, 20, compressedSize);
    writeU32(central, 24, uncompressedSize);
    writeU16(central, 28, centralName.length);
    writeU16(central, 30, centralExtra.length);
    writeU16(central, 32, bytesOf(entry.comment).length);
    writeU16(central, 34, entry.diskStart ?? 0);
    writeU32(central, 38, entry.externalAttributes ?? (0o100644 << 16));
    writeU32(central, 42, entry.centralLocalOffset ?? localOffset);
    centralRecords.push(Buffer.concat([central, centralName, centralExtra, bytesOf(entry.comment)]));
    localOffset += localRecord.length;
  }

  const localArea = Buffer.concat(localRecords);
  const centralDirectory = Buffer.concat(centralRecords);
  const actualCentralOffset = options.centralOffset ?? localArea.length;
  const actualCentralSize = options.centralSize ?? centralDirectory.length;
  const archiveParts = [localArea, centralDirectory];

  if (options.zip64) {
    const zip64Offset = localArea.length + centralDirectory.length;
    const record = Buffer.alloc(56);
    writeU32(record, 0, 0x06064b50);
    record.writeBigUInt64LE(44n, 4);
    writeU16(record, 12, 45);
    writeU16(record, 14, 45);
    writeU32(record, 16, 0);
    writeU32(record, 20, 0);
    record.writeBigUInt64LE(BigInt(entries.length), 24);
    record.writeBigUInt64LE(BigInt(entries.length), 32);
    record.writeBigUInt64LE(BigInt(centralDirectory.length), 40);
    record.writeBigUInt64LE(BigInt(localArea.length), 48);
    const locator = Buffer.alloc(20);
    writeU32(locator, 0, 0x07064b50);
    writeU32(locator, 4, 0);
    locator.writeBigUInt64LE(BigInt(zip64Offset), 8);
    writeU32(locator, 16, 1);
    archiveParts.push(record, locator);
  }

  let comment = bytesOf(options.comment);
  if (options.fakeEocdInComment) {
    const fake = makeEocd({ entriesOnDisk: 0, totalEntries: 0, centralSize: 1, centralOffset: 1, comment: Buffer.alloc(0) });
    comment = Buffer.concat([comment, fake]);
  }

  const actualEntries = entries.length;
  const eocd = makeEocd({
    diskNumber: options.diskNumber ?? 0,
    centralDiskNumber: options.centralDiskNumber ?? 0,
    entriesOnDisk: options.entriesOnDisk ?? actualEntries,
    totalEntries: options.totalEntries ?? actualEntries,
    centralSize: options.zip64Fields ? 0xffffffff : actualCentralSize,
    centralOffset: options.zip64Fields ? 0xffffffff : actualCentralOffset,
    comment,
  });
  archiveParts.push(eocd);
  if (options.appendGarbage !== undefined) archiveParts.push(bytesOf(options.appendGarbage));
  let archive = Buffer.concat(archiveParts);
  if (options.truncateBytes) archive = archive.subarray(0, Math.max(0, archive.length - options.truncateBytes));
  return new Uint8Array(archive.buffer, archive.byteOffset, archive.byteLength);
}

export function entry(name, overrides = {}) {
  return { name, data: Buffer.from("ok"), ...overrides };
}
