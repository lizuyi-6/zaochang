import { extname } from "node:path";
import { inspectZip, ZipValidationError } from "./zip.mjs";

export class BundleValidationError extends Error {
  constructor(message, { path = null, reasonCode = null } = {}) {
    super(message);
    this.name = "BundleValidationError";
    this.code = "validation_bundle";
    this.path = path;
    this.reasonCode = reasonCode;
    this.detail = message;
  }
}

export async function validateBundle(filePath, job, rules) {
  let archive;
  try {
    archive = await inspectZip(filePath);
    const { bundle } = rules;
    if (archive.fileSize > bundle.maxZipBytes) throw new BundleValidationError("zip exceeds maximum size");
    if (archive.entries.length > bundle.maxEntries) throw new BundleValidationError("too many zip entries");

    const seen = new Set();
    let files = 0;
    let totalUncompressedBytes = 0;
    let totalCompressedBytes = 0;
    let hasRootFile = false;
    for (const entry of archive.entries) {
      const path = entry.path;
      const normalized = entry.isDirectory ? path.slice(0, -1) : path;
      const segments = normalized.split("/");
      const lowerSegments = segments.map((segment) => segment.toLowerCase());
      if (!normalized || path.length > bundle.maxPathLength || segments.length > bundle.maxPathDepth) {
        throw new BundleValidationError(`invalid path length or depth: ${safePath(path)}`);
      }
      if (path.includes("\\") || /[\u0000-\u001f\u007f-\u009f]/u.test(path) || path.startsWith("/") || /^[A-Za-z]:/u.test(path) || segments.includes("..") || segments.some((segment) => segment.length === 0)) {
        throw new BundleValidationError(`rejected path: ${safePath(path)}`);
      }
      if (segments.some((segment) => segment.startsWith(".")) || lowerSegments.some((segment) => segment === "__macosx" || segment === "node_modules")) {
        throw new BundleValidationError(`rejected path: ${safePath(path)}`);
      }
      const duplicateKey = normalized.normalize("NFC").toLowerCase();
      if (seen.has(duplicateKey)) throw new BundleValidationError(`duplicate path: ${safePath(path)}`);
      seen.add(duplicateKey);
      if (entry.isSymlink) throw new BundleValidationError(`symbolic link rejected: ${safePath(path)}`);
      if ((entry.flags & 1) !== 0) throw new BundleValidationError(`encrypted entry rejected: ${safePath(path)}`);
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) throw new BundleValidationError(`compression method rejected: ${safePath(path)}`);
      if (entry.isDirectory) {
        if (entry.uncompressedSize !== 0) throw new BundleValidationError(`invalid directory entry: ${safePath(path)}`);
        continue;
      }

      files += 1;
      if (entry.uncompressedSize > bundle.maxFileBytes) throw new BundleValidationError(`file exceeds maximum size: ${safePath(path)}`);
      totalUncompressedBytes += entry.uncompressedSize;
      if (totalUncompressedBytes > bundle.maxUncompressedBytes) throw new BundleValidationError("total uncompressed size exceeds maximum");
      totalCompressedBytes += entry.compressedSize;
      const fileName = segments.at(-1);
      const extension = extname(fileName).slice(1).toLowerCase();
      if (rules.extensions.forbidden.includes(extension) || !rules.extensions.allowed.includes(extension)) {
        throw new BundleValidationError(`extension rejected: ${safePath(path)}`);
      }
      if (/^(?:id_rsa|id_ed25519)$/iu.test(fileName) || /\.(?:pem|key|p12|pfx)$/iu.test(fileName)) {
        throw new BundleValidationError(`sensitive filename rejected: ${safePath(path)}`);
      }
      if (normalized === bundle.rootFile) hasRootFile = true;
      if (entry.compressedSize === 0 ? entry.uncompressedSize > 0 : entry.uncompressedSize / entry.compressedSize > bundle.maxCompressionRatio) {
        throw new BundleValidationError(`compression ratio exceeds maximum: ${safePath(path)}`);
      }
    }
    if (totalCompressedBytes === 0 ? totalUncompressedBytes > 0 : totalUncompressedBytes / totalCompressedBytes > bundle.maxCompressionRatio) {
      throw new BundleValidationError("overall compression ratio exceeds maximum");
    }
    if (!hasRootFile) throw new BundleValidationError(`required root file missing: ${bundle.rootFile}`);
    if (Number(job.bundleFileCount) !== files) throw new BundleValidationError("file count differs from claimed bundle metadata");
    let actualUncompressedBytes = 0;
    for (const entry of archive.entries) {
      const content = await archive.readEntry(entry, entry.uncompressedSize);
      actualUncompressedBytes += content.length;
      if (actualUncompressedBytes > bundle.maxUncompressedBytes) {
        throw new BundleValidationError(`path=${safePath(entry.path)}; reason=expansion_exceeded`, {
          path: safePath(entry.path),
          reasonCode: "expansion_exceeded",
        });
      }
    }
    return { archive, fileCount: files, totalUncompressedBytes: actualUncompressedBytes };
  } catch (error) {
    if (archive) await archive.close().catch(() => undefined);
    if (error instanceof BundleValidationError) throw error;
    if (error instanceof ZipValidationError) {
      throw new BundleValidationError(error.message, { path: error.path, reasonCode: error.reasonCode });
    }
    throw error;
  }
}

function safePath(value) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/gu, "?").slice(0, 120);
}
