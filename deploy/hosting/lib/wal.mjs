import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export class WriteAheadLog {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.jobsDir = join(stateDir, "jobs");
  }

  async initialize() {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await mkdir(this.jobsDir, { recursive: true, mode: 0o700 });
    await restrictDirectory(this.stateDir);
    await restrictDirectory(this.jobsDir);
    await this.removeTemporaryFiles();
  }

  filePath(id) {
    return join(this.jobsDir, `${safeId(id)}.json`);
  }

  workDir(id) {
    return join(this.jobsDir, safeId(id));
  }

  async read(id) {
    try {
      return JSON.parse(await readFile(this.filePath(id), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async write(record) {
    const destination = this.filePath(record.hostingId);
    const temporary = `${destination}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
    let directory;
    try {
      directory = await open(this.jobsDir, "r");
      await directory.sync();
    } catch {
      // Windows 不允许同步目录；原子 rename 仍然保留。
    } finally {
      await directory?.close().catch(() => undefined);
    }
  }

  async all() {
    const records = [];
    for (const name of await readdir(this.jobsDir)) {
      if (!/^\d+\.json$/u.test(name)) continue;
      const record = JSON.parse(await readFile(join(this.jobsDir, name), "utf8"));
      records.push(record);
    }
    return records.sort((a, b) => Number(a.hostingId) - Number(b.hostingId));
  }

  async cleanupWorkDir(id) {
    await rm(this.workDir(id), { recursive: true, force: true });
  }

  async cleanExpiredWorkDirs(maxAgeMs = 0, now = Date.now()) {
    for (const name of await readdir(this.jobsDir)) {
      if (!/^\d+$/u.test(name)) continue;
      const path = join(this.jobsDir, name);
      const metadata = await stat(path).catch(() => null);
      if (!metadata?.isDirectory()) continue;
      if (now - metadata.mtimeMs >= maxAgeMs) await rm(path, { recursive: true, force: true });
    }
  }

  async removeTemporaryFiles() {
    for (const name of await readdir(this.jobsDir)) {
      if (!name.endsWith(".tmp")) continue;
      await rm(join(this.jobsDir, name), { force: true });
    }
  }
}

function safeId(id) {
  const value = String(id);
  if (!/^\d{1,18}$/u.test(value) || Number(value) < 1) throw new TypeError("hosting id must be a positive integer");
  return value;
}

async function restrictDirectory(path) {
  try {
    await chmod(path, 0o700);
  } catch (error) {
    if (process.platform !== "win32") throw error;
  }
}
