import { TextDecoder } from "node:util";

export async function findSecret(archive, entries, rules) {
  const textExtensions = new Set(rules.extensions.textScannable);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.path.split("/").at(-1);
    const dot = name.lastIndexOf(".");
    const extension = dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    let text;
    try {
      text = decoder.decode(await archive.readEntry(entry, entry.uncompressedSize));
    } catch (error) {
      if (error instanceof TypeError) throw Object.assign(new Error("text file is not valid UTF-8"), { code: "validation_bundle" });
      throw error;
    }
    for (const pattern of rules.secretPatterns) {
      const regex = new RegExp(pattern.regex, pattern.flags);
      if (regex.test(text)) return { patternId: pattern.id, path: entry.path };
    }
  }
  return null;
}
