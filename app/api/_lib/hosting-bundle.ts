import defaultRules from "./hosting-rules.json" with { type: "json" };

export const BUNDLE_ERROR_CODES = [
  "bundle_not_zip",
  "bundle_too_large",
  "bundle_structure_corrupt",
  "bundle_zip64_unsupported",
  "bundle_multidisk_unsupported",
  "bundle_encrypted",
  "bundle_method_unsupported",
  "bundle_too_many_entries",
  "bundle_path_invalid",
  "bundle_path_duplicate",
  "bundle_extension_forbidden",
  "bundle_extension_unknown",
  "bundle_symlink",
  "bundle_file_too_large",
  "bundle_uncompressed_too_large",
  "bundle_ratio_exceeded",
  "bundle_overlapping_entries",
  "bundle_local_header_mismatch",
  "bundle_missing_index",
] as const;

export type BundleErrorCode = (typeof BUNDLE_ERROR_CODES)[number];
export type HostingRules = typeof defaultRules;

type BundleSuccess = {
  ok: true;
  summary: {
    fileCount: number;
    uncompressedBytes: number;
    zipBytes: number;
    entries: string[];
  };
};

type BundleFailure = {
  ok: false;
  code: BundleErrorCode;
  detail: string;
  path?: string;
};

type Entry = {
  rawName: Uint8Array;
  name: string;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  externalAttributes: number;
  localHeaderOffset: number;
  directory: boolean;
  invalidName?: boolean;
};

type Interval = { start: number; end: number; path: string };
type CandidateResult =
  | { ok: true; entries: Entry[]; zip64: boolean; multidisk: boolean }
  | { ok: false; error: BundleFailure; consistent: boolean };

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_SIGNATURE = 0x06064b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_COMMENT = 0xffff;
const UTF8 = new TextDecoder("utf-8", { fatal: true });

export function loadDefaultRules(): HostingRules {
  return defaultRules;
}

function failure(code: BundleErrorCode, detail: string, path?: string): BundleFailure {
  const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "�").slice(0, 200);
  const result: BundleFailure = { ok: false, code, detail: clean(detail) };
  if (path !== undefined) result.path = clean(path);
  return result;
}

function hasBytes(bytes: Uint8Array, offset: number, length: number): boolean {
  return Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset <= bytes.length - length;
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function u64Safe(bytes: Uint8Array, offset: number): number | null {
  if (!hasBytes(bytes, offset, 8)) return null;
  const low = u32(bytes, offset);
  const high = u32(bytes, offset + 4);
  const value = high * 0x1_0000_0000 + low;
  return Number.isSafeInteger(value) ? value : null;
}

function hasSignature(bytes: Uint8Array, offset: number, signature: number): boolean {
  return hasBytes(bytes, offset, 4) && u32(bytes, offset) === signature;
}

function isZip64Locator(bytes: Uint8Array, eocdOffset: number): boolean {
  const locatorOffset = eocdOffset - 20;
  if (!hasSignature(bytes, locatorOffset, EOCD64_LOCATOR_SIGNATURE)) return false;
  const zip64Offset = u64Safe(bytes, locatorOffset + 8);
  if (zip64Offset === null || !hasSignature(bytes, zip64Offset, EOCD64_SIGNATURE)) return false;
  if (!hasBytes(bytes, zip64Offset, 56)) return false;
  const recordSize = u64Safe(bytes, zip64Offset + 4);
  if (recordSize === null || recordSize < 44 || zip64Offset + 12 + recordSize !== locatorOffset) return false;
  return u32(bytes, locatorOffset + 4) === 0 && u32(bytes, locatorOffset + 16) === 1;
}

function collectEocdCandidates(bytes: Uint8Array): number[] {
  const candidates: number[] = [];
  const earliest = Math.max(0, bytes.length - (22 + MAX_EOCD_COMMENT));
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (!hasSignature(bytes, offset, EOCD_SIGNATURE) || !hasBytes(bytes, offset, 22)) continue;
    if (offset + 22 + u16(bytes, offset + 20) === bytes.length) candidates.push(offset);
  }
  return candidates;
}

function readExtraFields(bytes: Uint8Array, offset: number, length: number): { ok: boolean; zip64: boolean } {
  const end = offset + length;
  if (!hasBytes(bytes, offset, length)) return { ok: false, zip64: false };
  let cursor = offset;
  let zip64 = false;
  while (cursor < end) {
    if (cursor + 4 > end) return { ok: false, zip64 };
    const id = u16(bytes, cursor);
    const size = u16(bytes, cursor + 2);
    cursor += 4;
    if (cursor + size > end) return { ok: false, zip64 };
    if (id === 0x0001) zip64 = true;
    cursor += size;
  }
  return { ok: cursor === end, zip64 };
}

function parseDirectory(bytes: Uint8Array, eocdOffset: number, rules: HostingRules): CandidateResult {
  if (!hasBytes(bytes, eocdOffset, 22)) {
    return { ok: false, consistent: false, error: failure("bundle_structure_corrupt", "ZIP end record is truncated") };
  }

  const diskNumber = u16(bytes, eocdOffset + 4);
  const centralDisk = u16(bytes, eocdOffset + 6);
  const entriesOnDisk = u16(bytes, eocdOffset + 8);
  const totalEntries = u16(bytes, eocdOffset + 10);
  const centralSize = u32(bytes, eocdOffset + 12);
  const centralOffset = u32(bytes, eocdOffset + 16);

  if (isZip64Locator(bytes, eocdOffset) || entriesOnDisk === 0xffff || totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    return { ok: false, consistent: true, error: failure("bundle_zip64_unsupported", "ZIP64 archives are not supported") };
  }
  if (!Number.isSafeInteger(centralOffset + centralSize) || centralOffset + centralSize !== eocdOffset || !hasBytes(bytes, centralOffset, centralSize)) {
    return { ok: false, consistent: false, error: failure("bundle_structure_corrupt", "Central directory bounds do not match the end record") };
  }

  const entries: Entry[] = [];
  let hasZip64Extra = false;
  let hasMultidiskEntry = false;
  let cursor = centralOffset;
  const centralEnd = centralOffset + centralSize;
  for (let index = 0; index < totalEntries; index += 1) {
    if (!hasSignature(bytes, cursor, CENTRAL_SIGNATURE) || !hasBytes(bytes, cursor, 46)) {
      return { ok: false, consistent: false, error: failure("bundle_structure_corrupt", "Central directory entry is truncated or malformed") };
    }
    const versionMadeBy = u16(bytes, cursor + 4);
    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const crc32 = u32(bytes, cursor + 16);
    const compressedSize = u32(bytes, cursor + 20);
    const uncompressedSize = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const diskStart = u16(bytes, cursor + 34);
    const externalAttributes = u32(bytes, cursor + 38);
    const localHeaderOffset = u32(bytes, cursor + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    if (!hasBytes(bytes, cursor, recordLength) || cursor + recordLength > centralEnd) {
      return { ok: false, consistent: false, error: failure("bundle_structure_corrupt", "Central directory entry exceeds its declared size") };
    }
    const extra = readExtraFields(bytes, cursor + 46 + nameLength, extraLength);
    if (!extra.ok) {
      return { ok: false, consistent: false, error: failure("bundle_structure_corrupt", "Central directory extra field is malformed") };
    }
    if (extra.zip64 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff || diskStart === 0xffff) hasZip64Extra = true;
    if (diskStart !== 0 && diskStart !== 0xffff) hasMultidiskEntry = true;
    if (index < rules.bundle.maxEntries + 1) {
      const rawName = bytes.slice(cursor + 46, cursor + 46 + nameLength);
      let name: string;
      let invalidName = false;
      try {
        name = UTF8.decode(rawName);
      } catch {
        name = "";
        invalidName = true;
      }
      entries.push({
        rawName,
        name: name.normalize("NFC"),
        invalidName,
        flags,
        method,
        crc32,
        compressedSize,
        uncompressedSize,
        externalAttributes,
        localHeaderOffset,
        directory: name.endsWith("/"),
      });
    }
    // versionMadeBy is intentionally read with the record but not used as a policy signal.
    void versionMadeBy;
    cursor += recordLength;
  }
  if (cursor !== centralEnd) {
    return { ok: false, consistent: false, error: failure("bundle_structure_corrupt", "Parsed entry count does not consume the declared central directory") };
  }
  if (entriesOnDisk !== totalEntries) {
    return { ok: false, consistent: true, error: failure("bundle_multidisk_unsupported", "Entry counts indicate a multi-disk archive") };
  }
  if (diskNumber !== 0 || centralDisk !== 0) {
    return { ok: false, consistent: true, error: failure("bundle_multidisk_unsupported", "Multi-disk ZIP archives are not supported") };
  }
  if (hasZip64Extra) {
    return { ok: false, consistent: true, error: failure("bundle_zip64_unsupported", "ZIP64 entry fields are not supported") };
  }
  if (hasMultidiskEntry) {
    return { ok: false, consistent: true, error: failure("bundle_multidisk_unsupported", "Multi-disk entries are not supported") };
  }
  if (entries.some((entry) => entry.invalidName)) {
    return { ok: false, consistent: true, error: failure("bundle_path_invalid", "Entry name is not valid UTF-8") };
  }
  return { ok: true, entries, zip64: false, multidisk: false };
}

function activePathRules(rules: HostingRules): string {
  return rules.rejectedPathRules.join("\n").toLowerCase();
}

function hasRequiredRuleSet(rules: HostingRules): boolean {
  const ruleText = activePathRules(rules);
  // 规则目前是人读字符串；缺少策略锚点时拒绝加载，避免改文案时静默放宽校验。
  const requiredPhrases = [
    "以 '.' 开头",
    "__macosx",
    "node_modules",
    "反斜杠",
    "控制字符",
    "'..' 段",
    "绝对路径",
    "不区分大小写",
    "id_rsa",
    "id_ed25519",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "符号链接",
    "加密条目",
    "zip64",
    "分卷压缩",
  ];
  return requiredPhrases.every((phrase) => ruleText.includes(phrase));
}

function validatePath(name: string, rules: HostingRules): BundleFailure | null {
  const ruleText = activePathRules(rules);
  const displayName = name;
  const path = name.endsWith("/") ? name.slice(0, -1) : name;
  const segments = path.split("/");
  if (path.length === 0 || segments.some((segment) => segment.length === 0)) {
    return failure("bundle_path_invalid", "Entry path is empty, absolute, or uses a forbidden separator", displayName);
  }
  if (ruleText.includes("绝对路径") && (path.startsWith("/") || /^[a-z]:/iu.test(path))) {
    return failure("bundle_path_invalid", "Absolute entry paths are not allowed", displayName);
  }
  if (ruleText.includes("反斜杠") && path.includes("\\")) {
    return failure("bundle_path_invalid", "Backslashes are not allowed in entry paths", displayName);
  }
  if (ruleText.includes("'..' 段") && segments.includes("..")) {
    return failure("bundle_path_invalid", "Entry path contains a parent-directory segment", displayName);
  }
  if (ruleText.includes("控制字符") && /[\u0000-\u001f\u007f-\u009f]/u.test(path)) {
    return failure("bundle_path_invalid", "Entry path contains a control character", displayName);
  }
  if (ruleText.includes("以 '.' 开头") && segments.some((segment) => segment.startsWith("."))) {
    return failure("bundle_path_invalid", "Hidden path segments are not allowed", displayName);
  }
  if (segments.length > rules.bundle.maxPathDepth || path.length > rules.bundle.maxPathLength) {
    return failure("bundle_path_invalid", "Entry path exceeds the configured length or depth", displayName);
  }
  const loweredSegments = segments.map((segment) => segment.toLowerCase());
  if ((ruleText.includes("__macosx") && loweredSegments.includes("__macosx")) || (ruleText.includes("node_modules") && loweredSegments.includes("node_modules"))) {
    return failure("bundle_path_invalid", "Entry path contains a forbidden directory", displayName);
  }
  const baseName = loweredSegments[loweredSegments.length - 1];
  if (ruleText.includes("id_rsa") && (baseName === "id_rsa" || baseName === "id_ed25519" || /\.(?:pem|key|p12|pfx)$/iu.test(baseName))) {
    return failure("bundle_path_invalid", "Entry filename matches a sensitive-file rule", displayName);
  }
  return null;
}

function checkLocalEntry(bytes: Uint8Array, entry: Entry, centralOffset: number): { error?: BundleFailure; interval?: Interval; zip64?: boolean } {
  const offset = entry.localHeaderOffset;
  if (offset >= centralOffset || !hasSignature(bytes, offset, LOCAL_SIGNATURE) || !hasBytes(bytes, offset, 30)) {
    return { error: failure("bundle_local_header_mismatch", "Local file header is missing or outside the local-data area", entry.name) };
  }
  const flags = u16(bytes, offset + 6);
  const method = u16(bytes, offset + 8);
  const crc32 = u32(bytes, offset + 14);
  const compressedSize = u32(bytes, offset + 18);
  const uncompressedSize = u32(bytes, offset + 22);
  const nameLength = u16(bytes, offset + 26);
  const extraLength = u16(bytes, offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (!hasBytes(bytes, offset + 30, nameLength + extraLength) || nameLength !== entry.rawName.length) {
    return { error: failure("bundle_local_header_mismatch", "Local and central filename lengths differ", entry.name) };
  }
  for (let index = 0; index < nameLength; index += 1) {
    if (bytes[offset + 30 + index] !== entry.rawName[index]) {
      return { error: failure("bundle_local_header_mismatch", "Local and central filenames differ", entry.name) };
    }
  }
  if (flags !== entry.flags || method !== entry.method) {
    return { error: failure("bundle_local_header_mismatch", "Local and central flags or methods differ", entry.name) };
  }
  const localExtra = readExtraFields(bytes, offset + 30 + nameLength, extraLength);
  if (!localExtra.ok) return { error: failure("bundle_local_header_mismatch", "Local extra field is malformed", entry.name) };
  if (localExtra.zip64 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
    return { zip64: true };
  }
  if ((flags & 0x0008) === 0) {
    if (crc32 !== entry.crc32 || compressedSize !== entry.compressedSize || uncompressedSize !== entry.uncompressedSize) {
      return { error: failure("bundle_local_header_mismatch", "Local sizes or checksum differ from the central directory", entry.name) };
    }
  } else {
    const validCrc = crc32 === 0 || crc32 === entry.crc32;
    const validCompressed = compressedSize === 0 || compressedSize === entry.compressedSize;
    const validUncompressed = uncompressedSize === 0 || uncompressedSize === entry.uncompressedSize;
    if (!validCrc || !validCompressed || !validUncompressed) {
      return { error: failure("bundle_local_header_mismatch", "Data-descriptor local fields conflict with the central directory", entry.name) };
    }
  }
  if (!Number.isSafeInteger(dataStart) || !Number.isSafeInteger(dataEnd) || dataEnd < dataStart || dataEnd > centralOffset) {
    return { error: failure("bundle_local_header_mismatch", "Local data range is outside the archive payload area", entry.name) };
  }
  return { interval: { start: offset, end: dataEnd, path: entry.name } };
}

function inspectEntries(bytes: Uint8Array, entries: Entry[], centralOffset: number, rules: HostingRules): BundleSuccess | BundleFailure {
  const seen = new Set<string>();
  const intervals: Interval[] = [];
  const names: string[] = [];
  let fileCount = 0;
  let totalUncompressed = 0;
  let totalCompressed = 0;
  let hasRootIndex = false;

  for (const entry of entries) {
    names.push(entry.name);
    const pathFailure = validatePath(entry.name, rules);
    if (pathFailure) return pathFailure;
    const duplicateKey = entry.name.replace(/\/$/u, "").toLowerCase();
    if (activePathRules(rules).includes("不区分大小写")) {
      if (seen.has(duplicateKey)) return failure("bundle_path_duplicate", "Entry path is duplicated without case sensitivity", entry.name);
      seen.add(duplicateKey);
    }

    if (activePathRules(rules).includes("符号链接") && ((entry.externalAttributes >>> 16) & 0o170000) === 0o120000) {
      return failure("bundle_symlink", "Symbolic-link entries are not allowed", entry.name);
    }
    if ((entry.flags & 0x0001) !== 0) return failure("bundle_encrypted", "Encrypted ZIP entries are not allowed", entry.name);
    if (entry.method !== 0 && entry.method !== 8) return failure("bundle_method_unsupported", "Only store and deflate compression methods are allowed", entry.name);

    if (entry.uncompressedSize > rules.bundle.maxFileBytes) return failure("bundle_file_too_large", "Entry exceeds the configured uncompressed file-size limit", entry.name);
    const nextTotal = totalUncompressed + entry.uncompressedSize;
    const nextCompressed = totalCompressed + entry.compressedSize;
    if (!Number.isSafeInteger(nextTotal) || nextTotal > rules.bundle.maxUncompressedBytes) {
      return failure("bundle_uncompressed_too_large", "Total uncompressed size exceeds the configured limit", entry.name);
    }
    if (!Number.isSafeInteger(nextCompressed)) return failure("bundle_structure_corrupt", "Compressed-size sum exceeds safe integer bounds", entry.name);
    totalUncompressed = nextTotal;
    totalCompressed = nextCompressed;
    if (!entry.directory) {
      fileCount += 1;
      const baseName = entry.name.slice(entry.name.lastIndexOf("/") + 1);
      const dot = baseName.lastIndexOf(".");
      if (dot <= 0 || dot === baseName.length - 1) return failure("bundle_extension_unknown", "File must have an allowed extension", entry.name);
      const extension = baseName.slice(dot + 1).toLowerCase();
      if (rules.extensions.forbidden.includes(extension)) return failure("bundle_extension_forbidden", "File extension is forbidden", entry.name);
      if (!rules.extensions.allowed.includes(extension)) return failure("bundle_extension_unknown", "File extension is not in the allowlist", entry.name);
      if (entry.name === rules.bundle.rootFile) hasRootIndex = true;
    }
  }

  for (const entry of entries) {
    if (entry.compressedSize === 0 ? entry.uncompressedSize > 0 : entry.uncompressedSize > entry.compressedSize * rules.bundle.maxCompressionRatio) {
      return failure("bundle_ratio_exceeded", "Entry compression ratio exceeds the configured limit", entry.name);
    }
  }
  if (totalCompressed === 0 ? totalUncompressed > 0 : totalUncompressed > totalCompressed * rules.bundle.maxCompressionRatio) {
    return failure("bundle_ratio_exceeded", "Overall compression ratio exceeds the configured limit");
  }

  for (const entry of entries) {
    const local = checkLocalEntry(bytes, entry, centralOffset);
    if (local.zip64) return failure("bundle_zip64_unsupported", "ZIP64 local fields are not supported", entry.name);
    if (local.error) return local.error;
    if (local.interval) intervals.push(local.interval);
  }
  intervals.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index].start < intervals[index - 1].end) {
      return failure("bundle_overlapping_entries", "Local entry data ranges overlap", intervals[index].path);
    }
  }

  if (!hasRootIndex) return failure("bundle_missing_index", "Archive must contain a root-level index.html file");
  return {
    ok: true,
    summary: { fileCount, uncompressedBytes: totalUncompressed, zipBytes: bytes.length, entries: names },
  };
}

function looksLikeZip(bytes: Uint8Array): boolean {
  if (bytes.length >= 4) {
    const signature = u32(bytes, 0);
    if (signature === LOCAL_SIGNATURE || signature === CENTRAL_SIGNATURE || signature === EOCD_SIGNATURE || signature === EOCD64_SIGNATURE) return true;
  }
  const start = Math.max(0, bytes.length - (22 + MAX_EOCD_COMMENT));
  for (let offset = start; offset + 4 <= bytes.length; offset += 1) {
    if (u32(bytes, offset) === EOCD_SIGNATURE) return true;
  }
  return false;
}

/**
 * 不解压 ZIP 数据，只读取有界的 EOCD、中央目录和本地头；扫描器上限之上的声明在此拒绝。
 */
export function inspectBundleZip(bytes: Uint8Array, rules: HostingRules = loadDefaultRules()): BundleSuccess | BundleFailure {
  try {
    if (!(bytes instanceof Uint8Array)) return failure("bundle_structure_corrupt", "ZIP input must be a byte array");
    const limits = [
      rules.bundle.maxZipBytes,
      rules.bundle.maxEntries,
      rules.bundle.maxUncompressedBytes,
      rules.bundle.maxFileBytes,
      rules.bundle.maxCompressionRatio,
      rules.bundle.maxPathLength,
      rules.bundle.maxPathDepth,
    ];
    if (limits.some((limit) => !Number.isSafeInteger(limit) || limit < 0)
      || !Array.isArray(rules.extensions.allowed)
      || !rules.extensions.allowed.every((extension) => typeof extension === "string")
      || !Array.isArray(rules.extensions.forbidden)
      || !rules.extensions.forbidden.every((extension) => typeof extension === "string")
      || !Array.isArray(rules.rejectedPathRules)
      || !rules.rejectedPathRules.every((rule) => typeof rule === "string")
      || !hasRequiredRuleSet(rules)
      || typeof rules.bundle.rootFile !== "string") {
      return failure("bundle_structure_corrupt", "Bundle rules are invalid");
    }
    if (bytes.length > rules.bundle.maxZipBytes) return failure("bundle_too_large", "Compressed ZIP exceeds the configured limit");

    const candidates = collectEocdCandidates(bytes);
    if (candidates.length === 0) {
      return failure(looksLikeZip(bytes) ? "bundle_structure_corrupt" : "bundle_not_zip", looksLikeZip(bytes) ? "ZIP end record is missing or malformed" : "Input does not contain a ZIP signature");
    }

    let lastError: BundleFailure | null = null;
    for (const eocdOffset of candidates) {
      const parsed = parseDirectory(bytes, eocdOffset, rules);
      if (!parsed.ok) {
        lastError = parsed.error;
        // Malformed candidates inside a ZIP comment must not hide an earlier consistent EOCD.
        if (parsed.consistent) return parsed.error;
        continue;
      }
      if (parsed.entries.length > rules.bundle.maxEntries) {
        return failure("bundle_too_many_entries", "Archive has more entries than the configured limit");
      }
      const result = inspectEntries(bytes, parsed.entries, u32(bytes, eocdOffset + 16), rules);
      return result;
    }
    return lastError ?? failure("bundle_structure_corrupt", "No consistent ZIP end record was found");
  } catch {
    return failure("bundle_structure_corrupt", "ZIP structure could not be parsed safely");
  }
}
