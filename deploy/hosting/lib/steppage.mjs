import { execFile as nodeExecFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFile = promisify(nodeExecFile);
const MAX_STDOUT_BYTES = 1024 * 1024;

export class SteppageError extends Error {
  constructor(message, { code = null, stdout = "", stderr = "", timedOut = false } = {}) {
    super(message);
    this.name = "SteppageError";
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
    this.timedOut = timedOut;
  }
}

export class Steppage {
  constructor({ command, apiKey, execFileImpl = execFile, baseDir }) {
    this.command = command;
    this.apiKey = apiKey;
    this.execFileImpl = execFileImpl;
    this.baseDir = baseDir;
  }

  async run(args, timeoutMs = 60_000) {
    const [executable, ...prefix] = this.command;
    let result;
    try {
      result = await this.execFileImpl(executable, [...prefix, ...args], {
        cwd: this.baseDir,
        env: childEnvironment(this.apiKey),
        shell: false,
        windowsHide: true,
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: MAX_STDOUT_BYTES,
        encoding: "utf8",
      });
    } catch (error) {
      throw new SteppageError("StepFun CLI call failed", {
        code: error?.code ?? null,
        stdout: safeString(error?.stdout),
        stderr: safeString(error?.stderr),
        timedOut: error?.killed === true || error?.signal === "SIGKILL" || error?.code === "ETIMEDOUT",
      });
    }
    return safeString(result.stdout);
  }

  async json(args, timeoutMs = 60_000) {
    const stdout = await this.run(["--json", ...args], timeoutMs);
    try {
      return JSON.parse(stdout);
    } catch {
      throw new SteppageError("StepFun CLI returned invalid JSON", { stdout });
    }
  }

  deploy(zipPath, siteName) {
    return this.json(["deploy", zipPath, "--name", siteName], 120_000);
  }

  get(siteId) {
    return this.json(["get", "--site", siteId]);
  }

  promote(siteId, versionId) {
    return this.run(["--json", "promote", "--site", siteId, "--version", versionId], 60_000);
  }

  expirePreview(siteId, versionId, ttl) {
    return this.json(["preview", "expiry", "--site", siteId, "--version", versionId, "--expires", ttl]);
  }

  revokePreview(siteId, versionId) {
    return this.run(["--json", "preview", "revoke", "--site", siteId, "--version", versionId]);
  }

  delete(siteId) {
    return this.json(["delete", "--site", siteId, "--yes"]);
  }

  list() {
    return this.json(["list"]);
  }

  versions(siteId) {
    return this.json(["versions", "--site", siteId]);
  }
}

export function parseCommand(value) {
  let command;
  try {
    command = JSON.parse(value ?? '["steppage"]');
  } catch {
    throw new Error("STEPPAGE_CMD must be a JSON array");
  }
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string" || part.length === 0)) {
    throw new Error("STEPPAGE_CMD must be a non-empty JSON string array");
  }
  return command;
}

export async function verifyPinnedScript(command, checksumPath) {
  const expected = (await readFile(checksumPath, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/u.test(expected)) throw new Error("STEPPAGE_SHA256 must contain one lowercase SHA-256 value");
  const scriptPath = command.find((part) => part.toLowerCase().endsWith(".mjs"));
  if (!scriptPath) return { expected, checked: false };
  const metadata = await stat(scriptPath).catch(() => null);
  if (!metadata?.isFile()) throw new Error("pinned steppage script was not found");
  const actual = createHash("sha256").update(await readFile(scriptPath)).digest("hex");
  if (actual !== expected) throw new Error("installed steppage script checksum does not match deploy/hosting/STEPPAGE_SHA256");
  return { expected, checked: true };
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function childEnvironment(apiKey) {
  const env = { ...process.env, STEPFUN_API_KEY: apiKey };
  delete env.HOSTING_DEPLOYER_TOKEN;
  return env;
}
