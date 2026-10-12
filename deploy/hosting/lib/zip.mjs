import { open, stat } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_ID = 0x0001;

export class ZipValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ZipValidationError";
    this.code = "validation_bundle";
  }
}

async function readExact(handle, length, position) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
    if (bytesRead === 0) throw new ZipValidationError("truncated zip structure");
    offset += bytesRead;
  }
  return buffer;
}

function decodeName(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new ZipValidationError("invalid UTF-8 entry path");
  }
}

export async function inspectZip(filePath) {
  const handle = await open(filePath, "r");
  try {
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;
    if (fileSize < 22) throw new ZipValidationError("zip is too short");
    const tailLength = Math.min(fileSize, 22 + 0xffff);
    const tailStart = fileSize - tailLength;
    const tail = await readExact(handle, tailLength, tailStart);
    let eocdAt = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
        const commentLength = tail.readUInt16LE(i + 20);
        if (i + 22 + commentLength === tail.length) {
          eocdAt = i;
          break;
        }
      }
    }
    if (eocdAt < 0) throw new ZipValidationError("zip end record not found");
    const disk = tail.readUInt16LE(eocdAt + 4);
    const centralDisk = tail.readUInt16LE(eocdAt + 6);
    const entriesOnDisk = tail.readUInt16LE(eocdAt + 8);
    const entryCount = tail.readUInt16LE(eocdAt + 10);
    const centralSize = tail.readUInt32LE(eocdAt + 12);
    const centralOffset = tail.readUInt32LE(eocdAt + 16);
    const eocdPosition = tailStart + eocdAt;
    if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
      throw new ZipValidationError("multi-disk zip is not allowed");
    }
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new ZipValidationError("ZIP64 is not allowed");
    }
    if (centralOffset + centralSize > eocdPosition) {
      throw new ZipValidationError("invalid central directory bounds");
    }

    const entries = [];
    let cursor = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
      const fixed = await readExact(handle, 46, cursor);
      if (fixed.readUInt32LE(0) !== CENTRAL_SIGNATURE) {
        throw new ZipValidationError("invalid central directory entry");
      }
      const nameLength = fixed.readUInt16LE(28);
      const extraLength = fixed.readUInt16LE(30);
      const commentLength = fixed.readUInt16LE(32);
      const variable = await readExact(handle, nameLength + extraLength + commentLength, cursor + 46);
      const nameBytes = variable.subarray(0, nameLength);
      const extra = variable.subarray(nameLength, nameLength + extraLength);
      const flags = fixed.readUInt16LE(8);
      const compressionMethod = fixed.readUInt16LE(10);
      const diskStart = fixed.readUInt16LE(34);
      const compressedSize = fixed.readUInt32LE(20);
      const uncompressedSize = fixed.readUInt32LE(24);
      const localOffset = fixed.readUInt32LE(42);
      if (diskStart !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
        throw new ZipValidationError("split or ZIP64 entry is not allowed");
      }
      for (let extraOffset = 0; extraOffset + 4 <= extra.length;) {
        const extraId = extra.readUInt16LE(extraOffset);
        const extraSize = extra.readUInt16LE(extraOffset + 2);
        if (extraOffset + 4 + extraSize > extra.length) throw new ZipValidationError("invalid zip extra field");
        if (extraId === ZIP64_EXTRA_ID) throw new ZipValidationError("ZIP64 is not allowed");
        extraOffset += 4 + extraSize;
      }
      const externalAttributes = fixed.readUInt32LE(38);
      const unixMode = externalAttributes >>> 16;
      entries.push({
        path: decodeName(nameBytes),
        nameBytes: Buffer.from(nameBytes),
        flags,
        compressionMethod,
        crc32: fixed.readUInt32LE(16),
        compressedSize,
        uncompressedSize,
        localOffset,
        unixMode,
        isSymlink: (unixMode & 0o170000) === 0o120000,
        isDirectory: decodeName(nameBytes).endsWith("/"),
      });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    if (cursor !== centralOffset + centralSize) throw new ZipValidationError("central directory size mismatch");

    return {
      entries,
      fileSize,
      async readEntry(entry, maxOutputLength) {
        const local = await readExact(handle, 30, entry.localOffset);
        if (local.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new ZipValidationError("invalid local file header");
        const localFlags = local.readUInt16LE(6);
        const localMethod = local.readUInt16LE(8);
        const localCrc = local.readUInt32LE(14);
        const localCompressedSize = local.readUInt32LE(18);
        const localUncompressedSize = local.readUInt32LE(22);
        const localNameLength = local.readUInt16LE(26);
        const localExtraLength = local.readUInt16LE(28);
        const localVariable = await readExact(handle, localNameLength + localExtraLength, entry.localOffset + 30);
        const localName = localVariable.subarray(0, localNameLength);
        const localExtra = localVariable.subarray(localNameLength);
        if (!localName.equals(entry.nameBytes)) throw new ZipValidationError("local and central paths disagree");
        for (let extraOffset = 0; extraOffset + 4 <= localExtra.length;) {
          const extraId = localExtra.readUInt16LE(extraOffset);
          const extraSize = localExtra.readUInt16LE(extraOffset + 2);
          if (extraOffset + 4 + extraSize > localExtra.length) throw new ZipValidationError("invalid local zip extra field");
          if (extraId === ZIP64_EXTRA_ID) throw new ZipValidationError("ZIP64 is not allowed");
          extraOffset += 4 + extraSize;
        }
        if (localFlags !== entry.flags || localMethod !== entry.compressionMethod) {
          throw new ZipValidationError("local and central headers disagree");
        }
        if ((entry.flags & 0x08) === 0 && (localCrc !== entry.crc32 || localCompressedSize !== entry.compressedSize || localUncompressedSize !== entry.uncompressedSize)) {
          throw new ZipValidationError("local and central sizes disagree");
        }
        const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
        if (dataOffset + entry.compressedSize > centralOffset) throw new ZipValidationError("entry data overlaps central directory");
        const compressed = await readExact(handle, entry.compressedSize, dataOffset);
        let output;
        if (entry.compressionMethod === 0) {
          output = compressed;
        } else if (entry.compressionMethod === 8) {
          try {
            output = inflateRawSync(compressed, { maxOutputLength });
          } catch {
            throw new ZipValidationError("entry decompression failed or exceeded limit");
          }
        } else {
          throw new ZipValidationError("unsupported zip compression method");
        }
        if (output.length !== entry.uncompressedSize) throw new ZipValidationError("entry size mismatch");
        if (crc32(output) !== entry.crc32) throw new ZipValidationError("entry checksum mismatch");
        return output;
      },
      close() {
        return handle.close();
      },
    };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
