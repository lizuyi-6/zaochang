import { appendFile, readFile, writeFile } from "node:fs/promises";

export async function runFakeSteppage({ argv, env }) {
  const statePath = env.FAKE_STEP_PAGE_STATE;
  const logPath = env.FAKE_STEP_PAGE_LOG;
  const args = argv[0] === "--json" ? argv.slice(1) : argv;
  const command = args[0] === "preview" ? `preview ${args[1]}` : args[0];
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const logEntry = {
    command,
    argv,
    envKeys: Object.keys(env).sort(),
    hasStepfunKey: Boolean(env.STEPFUN_API_KEY),
    hasWorkerToken: Boolean(env.HOSTING_DEPLOYER_TOKEN),
  };
  await appendFile(logPath, `${JSON.stringify(logEntry)}\n`);

  const injectedFailure = state.failures?.[command];
  if (injectedFailure && !(command === "deploy" && injectedFailure.afterSideEffect === true)) {
    return { stdout: "", stderr: String(injectedFailure.stderr ?? "Error: fake CLI failure"), exitCode: Number(injectedFailure.exitCode ?? 1) };
  }

  if (command === "deploy") {
    const zipPath = args[1];
    const nameAt = args.indexOf("--name");
    const name = nameAt >= 0 ? args[nameAt + 1] : "";
    const siteId = String(++state.nextSiteId);
    const versionId = String(++state.nextVersionId);
    const previewUrl = `https://p-${"a".repeat(32)}.preview.stepcloud.com`;
    const metadata = state.deployMetadata ?? {};
    state.sites[siteId] = {
      siteId,
      name,
      slug: "warm-cedar-df1c",
      liveUrl: "",
      status: 1,
      liveVersionId: "0",
      versions: [{ siteId, versionId, fileCount: Number(metadata.fileCount ?? env.FAKE_STEP_PAGE_FILES), totalBytes: String(metadata.totalBytes ?? env.FAKE_STEP_PAGE_BYTES), previewUrl, expiresAt: "0" }],
    };
    await save();
    if (injectedFailure) {
      return { stdout: "", stderr: String(injectedFailure.stderr ?? "Error: fake CLI failure"), exitCode: Number(injectedFailure.exitCode ?? 1) };
    }
    return { stdout: JSON.stringify({ siteId, versionId, previewUrl, zipPath }), stderr: "", exitCode: 0 };
  }
  if (command === "get") {
    const siteId = valueAfter(args, "--site");
    if (state.failures?.getNotFound || !state.sites[siteId]) return notFound();
    return success(state.sites[siteId]);
  }
  if (command === "promote") {
    const siteId = valueAfter(args, "--site");
    const versionId = valueAfter(args, "--version");
    if (!state.sites[siteId]) return notFound();
    const site = state.sites[siteId];
    site.liveVersionId = String(versionId);
    site.liveUrl = `https://${site.slug}.page.stepcloud.com`;
    const version = site.versions.find((item) => String(item.versionId) === String(versionId));
    if (version) version.isLive = true;
    await save();
    return success({ promoted: true });
  }
  if (command === "preview expiry") {
    const siteId = valueAfter(args, "--site");
    const versionId = valueAfter(args, "--version");
    const site = state.sites[siteId];
    if (!site) return notFound();
    const version = site.versions.find((item) => String(item.versionId) === String(versionId));
    if (!version) return notFound("version");
    version.expiresAt = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await save();
    return success({ token: "p-fake", expiresAt: version.expiresAt });
  }
  if (command === "preview revoke") {
    const siteId = valueAfter(args, "--site");
    const versionId = valueAfter(args, "--version");
    const version = state.sites[siteId]?.versions.find((item) => String(item.versionId) === String(versionId));
    if (version) version.revoked = true;
    await save();
    return success({ token: "p-fake", revoked: true });
  }
  if (command === "delete") {
    const siteId = valueAfter(args, "--site");
    if (!state.sites[siteId]) return notFound();
    const site = state.sites[siteId];
    delete state.sites[siteId];
    await save();
    return success({ siteId, name: site.name, deleted: true });
  }
  if (command === "list") return success({ sites: Object.values(state.sites), total: String(Object.keys(state.sites).length) });
  if (command === "versions") {
    const site = state.sites[valueAfter(args, "--site")];
    if (!site) return notFound();
    return success({ versions: site.versions });
  }
  return { stdout: "", stderr: `Error: unsupported fake command ${command}`, exitCode: 1 };

  async function save() {
    await writeFile(statePath, JSON.stringify(state));
  }
}

function valueAfter(list, flag) {
  const index = list.indexOf(flag);
  return index < 0 ? "" : list[index + 1];
}

function success(value) {
  return { stdout: JSON.stringify(value), stderr: "", exitCode: 0 };
}

function notFound(entity = "site") {
  return { stdout: "", stderr: `Error: ${entity} not found [not_found]`, exitCode: 1 };
}
