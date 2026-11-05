// 把飞书「见界创赛选拔 · 笔试」的提交同步到 aetherstudio.top 的阅卷台。
//
// 为什么需要这个脚本:飞书工作流只能把附件的 file_token 推给 Worker,拿不到 PDF/Word
// 的正文;附件正文要用 lark-cli 先下载再抽文本(与 Worker 用同一个 extractMaterialText)。
// 脚本幂等:同一条飞书记录重复同步只会更新,不会产生第二份提交;飞书里改过答案再跑
// 一次也会同步过去,并把改动过的题目的 AI 判分作废(收件接口负责)。
//
// 用法:
//   node --experimental-strip-types scripts/written-test-sync.mjs [--dry-run]
//
// 环境变量(都有默认值,换环境时覆盖):
//   WRITTEN_TEST_BASE_TOKEN  飞书 Base token(见界创赛选拔 · 笔试)
//   WRITTEN_TEST_TABLE_ID    数据表 id(笔试答题)
//   WRITTEN_TEST_ENDPOINT    收件接口地址
//   WRITTEN_TEST_TOKEN       共享密钥(与 Worker secret RECRUIT_WRITTEN_TEST_TOKEN 一致)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractMaterialText } from "../app/api/_lib/hyperknow/material-content.ts";
import {
  WRITTEN_TEST_INTEGRITY_FIELD,
  WRITTEN_TEST_ITEMS,
  WRITTEN_TEST_TIMING_FIELDS,
  writtenTestFieldMap,
} from "../app/api/_lib/recruit-written-test-rubric.ts";

const BASE_TOKEN = process.env.WRITTEN_TEST_BASE_TOKEN ?? "NohFbW4sxanfY3sp57bcSSuWnof";
const TABLE_ID = process.env.WRITTEN_TEST_TABLE_ID ?? "tblFR5Y8TzgJDfh9";
const ENDPOINT = process.env.WRITTEN_TEST_ENDPOINT ?? "https://aetherstudio.top/api/recruit/written-test";
const TOKEN = process.env.WRITTEN_TEST_TOKEN ?? "";
const DRY_RUN = process.argv.includes("--dry-run");
const WORK_DIR = join(process.cwd(), ".tmp", "written-test-sync");

// lark-cli 的可执行文件:npm 全局装的是 .cmd 壳,直接 spawn 会被 Windows 拦,
// 走 cmd.exe 又会把 UTF-8 输出按 GBK 重编码(中文乱码)。所以优先找真正的 .exe。
function resolveLarkCli() {
  const candidates = [];
  if (process.env.WRITTEN_TEST_LARK_CLI) candidates.push(process.env.WRITTEN_TEST_LARK_CLI);
  if (process.platform === "win32" && process.env.APPDATA) {
    candidates.push(join(process.env.APPDATA, "npm", "node_modules", "@larksuite", "cli", "bin", "lark-cli.exe"));
  }
  candidates.push(process.platform === "win32" ? "lark-cli.exe" : "lark-cli");
  for (const candidate of candidates) {
    if (candidate.includes("/") || candidate.includes("\\")) {
      if (!existsSync(candidate)) continue;
    }
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      continue;
    }
  }
  return process.platform === "win32" ? "lark-cli.cmd" : "lark-cli";
}

const LARK_CLI = resolveLarkCli();

const MEDIA_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  md: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function lark(args) {
  return execFileSync(LARK_CLI, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function mediaTypeOf(name) {
  const extension = name.toLowerCase().split(".").at(-1) ?? "";
  return MEDIA_TYPES[extension] ?? "application/octet-stream";
}

// 飞书单选/多选字段的值可能是数组,统一拍平成字符串。
function flatten(value) {
  if (Array.isArray(value)) return value.map((entry) => flatten(entry)).filter(Boolean).join(" ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function downloadAttachment(recordId, fileToken, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  const before = new Set(existsSync(targetDir) ? readdirSync(targetDir) : []);
  try {
    lark([
      "base",
      "+record-download-attachment",
      "--base-token",
      BASE_TOKEN,
      "--table-id",
      TABLE_ID,
      "--record-id",
      recordId,
      "--file-token",
      fileToken,
      "--output",
      targetDir,
      "--as",
      "user",
    ]);
  } catch {
    return null;
  }
  const after = existsSync(targetDir) ? readdirSync(targetDir) : [];
  const fresh = after.filter((name) => !before.has(name));
  if (!fresh.length) return null;
  // 取最新写入的那个:CLI 的落盘文件名带随机后缀,按修改时间排最稳。
  fresh.sort((a, b) => statSync(join(targetDir, b)).mtimeMs - statSync(join(targetDir, a)).mtimeMs);
  return join(targetDir, fresh[0]);
}

async function buildPayload(row) {
  const recordId = String(row.record_id ?? "");
  const fieldMap = writtenTestFieldMap();
  const answers = {};
  const attachments = {};
  const payload = {
    sourceRecordId: recordId,
    integrityConfirmed: false,
  };

  for (const [field, value] of Object.entries(row)) {
    if (field === "record_id") continue;
    const key = fieldMap[field];
    if (!key) continue;
    if (field === WRITTEN_TEST_INTEGRITY_FIELD) {
      payload.integrityConfirmed = flatten(value) === "我确认";
      continue;
    }
    const timingEntry = WRITTEN_TEST_TIMING_FIELDS.find((entry) => entry.field === field);
    if (timingEntry) {
      payload[timingEntry.key] = Number(flatten(value)) || 0;
      continue;
    }
    if (Array.isArray(value)) {
      // 飞书里多选字段也是数组:元素是字符串 → 当作作答;元素是对象 → 是附件。
      const isAttachment = value.some((entry) => entry && typeof entry === "object");
      if (!isAttachment) {
        const flat = flatten(value);
        if (flat) answers[key] = flat;
        continue;
      }
      // 附件字段:下载 → 抽文本。
      const files = [];
      for (const entry of value) {
        const fileToken = String(entry?.file_token ?? "");
        const name = String(entry?.name ?? "");
        if (!fileToken && !name) continue;
        let text = "";
        if (fileToken) {
          const path = downloadAttachment(recordId, fileToken, join(WORK_DIR, "attachments", recordId));
          if (path) {
            const bytes = new Uint8Array(readFileSync(path));
            const extracted = await extractMaterialText(name || path, mediaTypeOf(name || path), bytes);
            if (extracted.ok) text = extracted.text;
          }
        }
        files.push({ fileToken, name, size: entry?.size ?? null, text });
      }
      if (files.length) attachments[key] = files;
      continue;
    }
    const flat = flatten(value);
    if (flat) answers[key] = flat;
  }

  // 基本信息字段在 rubric 里也是 item,单独搬过去。
  // 身份(name/school/contact)不再由表单收集:Worker 收件时按报名ID反查报名库回填。
  for (const item of WRITTEN_TEST_ITEMS) {
    if (!["signupRef", "position", "competition"].includes(item.key)) continue;
    const field = item.sourceField;
    const value = field ? row[field] : undefined;
    const flat = flatten(value);
    if (!flat) continue;
    if (item.key === "signupRef") payload.signupRef = flat;
    else if (item.key === "position") payload.positions = [flat];
    else if (item.key === "competition") payload.competition = flat;
  }

  if (Object.keys(attachments).length) payload.attachments = attachments;
  if (Object.keys(answers).length) Object.assign(payload, answers);
  return payload;
}

async function main() {
  if (!TOKEN && !DRY_RUN) {
    console.error("缺少 WRITTEN_TEST_TOKEN(与 Worker secret RECRUIT_WRITTEN_TEST_TOKEN 一致)");
    process.exit(2);
  }
  rmSync(WORK_DIR, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });

  const recordsPath = join(WORK_DIR, "records.ndjson");
  lark([
    "base",
    "+record-list",
    "--base-token",
    BASE_TOKEN,
    "--table-id",
    TABLE_ID,
    "--format",
    "ndjson",
    "--output",
    recordsPath,
    "--as",
    "user",
  ]);
  const rows = readFileSync(recordsPath, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
  console.log(`拉到 ${rows.length} 条笔试提交`);

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    const payload = await buildPayload(row);
    if (!payload.signupRef) {
      console.warn(`跳过 ${payload.sourceRecordId}:没有报名ID`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`[dry-run] ${payload.sourceRecordId} ${payload.signupRef}`, JSON.stringify(payload).slice(0, 200));
      ok += 1;
      continue;
    }
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-recruit-token": TOKEN },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error(`同步失败 ${payload.sourceRecordId}:HTTP ${response.status} ${JSON.stringify(body)}`);
        failed += 1;
        continue;
      }
      console.log(`已同步 ${payload.signupRef}(${payload.sourceRecordId})硬判 ${body.hardScore}/${body.hardMaxScore}${body.signupMatched === false ? " [报名ID未匹配]" : ""}`);
      ok += 1;
    } catch (error) {
      console.error(`同步异常 ${payload.sourceRecordId}:${error instanceof Error ? error.message : error}`);
      failed += 1;
    }
  }
  console.log(`完成:成功 ${ok},失败 ${failed}`);
  if (failed) process.exitCode = 1;
}

await main();
