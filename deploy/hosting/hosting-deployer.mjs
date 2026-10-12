import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile, access } from "node:fs/promises";
import { hostname } from "node:os";
import { WorkerApi } from "./lib/api.mjs";
import { parseCommand, Steppage, verifyPinnedScript } from "./lib/steppage.mjs";
import { WriteAheadLog } from "./lib/wal.mjs";
import { HostingRunner } from "./lib/runner.mjs";

const entryDir = dirname(fileURLToPath(import.meta.url));

export async function loadConfig(env = process.env) {
  const apiToken = env.HOSTING_DEPLOYER_TOKEN ?? "";
  const apiKey = env.STEPFUN_API_KEY ?? "";
  if (!apiToken.trim() || !apiKey.trim()) throw new Error("HOSTING_DEPLOYER_TOKEN and STEPFUN_API_KEY are required");
  const apiBase = env.HOSTING_API_BASE ?? "https://aetherstudio.top";
  const parsedBase = new URL(apiBase);
  if (parsedBase.protocol !== "https:" && parsedBase.hostname !== "127.0.0.1" && parsedBase.hostname !== "localhost") {
    throw new Error("HOSTING_API_BASE must use HTTPS outside loopback tests");
  }
  const rulesPath = await resolveRulesPath(env.HOSTING_RULES_PATH);
  const rules = JSON.parse(await readFile(rulesPath, "utf8"));
  const command = parseCommand(env.STEPPAGE_CMD);
  if (command.some((part) => part.includes(apiToken) || part.includes(apiKey) || ["--go-live", "--site"].some((flag) => part === flag || part.startsWith(`${flag}=`)))) {
    throw new Error("STEPPAGE_CMD must not contain credentials or deploy-only flags");
  }
  const checksumPath = resolve(entryDir, "STEPPAGE_SHA256");
  const pin = await verifyPinnedScript(command, checksumPath);
  const workerId = String(env.HOSTING_WORKER_ID ?? `${hostname()}-${process.pid}`);
  if (workerId.length === 0) throw new Error("HOSTING_WORKER_ID must not be empty");
  return {
    apiBase,
    apiToken,
    apiKey,
    command,
    stateDir: resolve(env.HOSTING_STATE_DIR ?? "/var/lib/zaochang/hosting"),
    rules,
    rulesPath,
    workerId: workerId.slice(0, 64),
    idleMs: positiveInteger(env.HOSTING_POLL_IDLE_MS, 10_000),
    pin,
  };
}

export async function resolveRulesPath(configuredPath) {
  const candidates = [
    configuredPath ? resolve(configuredPath) : null,
    resolve(entryDir, "hosting-rules.json"),
    resolve(entryDir, "../../app/api/_lib/hosting-rules.json"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // 按契约顺序继续查找规则文件。
    }
  }
  throw new Error("HOSTING_RULES_PATH could not be resolved");
}

export async function createService({ env = process.env, fetchImpl = fetch, execFileImpl } = {}) {
  const config = await loadConfig(env);
  const api = new WorkerApi({ baseUrl: config.apiBase, token: config.apiToken, fetchImpl, retry: { tries: 4, baseMs: 1000 } });
  const steppage = new Steppage({ command: config.command, apiKey: config.apiKey, execFileImpl, baseDir: config.stateDir });
  const wal = new WriteAheadLog(config.stateDir);
  const runner = new HostingRunner({ api, steppage, wal, rules: config.rules, workerId: config.workerId, idleMs: config.idleMs });
  return { config, runner };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write("[hosting-deployer] startup failed; check environment and local configuration\n");
    process.exitCode = 1;
  });
}

async function main() {
  const { config, runner } = await createService();
  process.stdout.write(`[hosting-deployer] started; rules=${config.rulesPath}; pinned-script-checked=${config.pin.checked}\n`);
  let shuttingDown = false;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      runner.stop();
      process.stdout.write(`[hosting-deployer] ${signal} received; exiting after current operation\n`);
    });
  }
  await runner.run();
}

function positiveInteger(value, fallback) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("HOSTING_POLL_IDLE_MS must be a positive integer");
  return number;
}
