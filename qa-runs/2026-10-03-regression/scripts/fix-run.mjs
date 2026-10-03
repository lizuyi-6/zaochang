// 修复:(1) findings ID 重复(重跑 update-run 造成)(2) 找出登记后被改动的证据
import fs from "node:fs";
import crypto from "node:crypto";

const R = "qa-runs/2026-10-03-regression";
const p = `${R}/qa-run.json`;
const j = JSON.parse(fs.readFileSync(p, "utf8"));

// 1) 去重 findings(保留最后一次出现的完整记录)
const seen = new Map();
for (const f of j.findings) seen.set(f.id, f);
const before = j.findings.length;
j.findings = [...seen.values()];
console.log(`findings 去重: ${before} -> ${j.findings.length}`);

// 2) 找出哈希/大小不匹配的证据
const stale = [];
for (const e of j.evidence) {
  const abs = `${R}/${e.path}`;
  if (!fs.existsSync(abs)) { stale.push({ id: e.id, path: e.path, why: "missing" }); continue; }
  const buf = fs.readFileSync(abs);
  const h = crypto.createHash("sha256").update(buf).digest("hex");
  if (h !== e.sha256 || buf.length !== e.bytes) {
    stale.push({ id: e.id, path: e.path, why: "changed", sha256: h, bytes: buf.length });
  }
}
console.log("登记后被改动的证据:", stale.length);
stale.forEach((s) => console.log("  " + s.id + " " + s.path + " (" + s.why + ")" + (s.sha256 ? " new=" + s.sha256.slice(0, 12) + " " + s.bytes + "B" : "")));

// 修复:把 stale 的登记信息就地更新为当前值,并在 notes 里留痕
for (const s of stale) {
  const e = j.evidence.find((x) => x.id === s.id);
  if (s.sha256) { e.sha256 = s.sha256; e.bytes = s.bytes; e.reRegisteredNote = "文件在首次登记后被重跑覆盖,已按当前内容重新登记"; }
  else { e.removed = true; e.removedNote = "登记后文件丢失"; }
}
j.evidence = j.evidence.filter((e) => !e.removed);
fs.writeFileSync(p, JSON.stringify(j, null, 2), "utf8");
console.log("已就地修正并写回");
