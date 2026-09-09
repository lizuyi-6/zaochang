import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  // 本地开发变量(非 secret,与测试 harness 的 wrangler dev --var 同纪律):
  // APP_ENV=development + LOCAL_DEV_LOGIN=1 打开 /api/auth/dev-login 模拟登录
  // (dev-login-gate 双 fail-closed,生产即使误配也不可达);AI 上游密钥走
  // gitignore 的 .dev.vars,绝不写进本文件。
  vars: {
    APP_ENV: "development",
    LOCAL_DEV_LOGIN: "1",
  },
  // /lattice/* 在 worker 里做登录门禁后经 env.ASSETS 取静态资源(与生产
  // wrangler.prod.jsonc 的 assets.binding=ASSETS 同语义);dev 下以 public/
  // 为源,免得门禁放行后 fetch 撞上 undefined。
  assets: {
    directory: "public",
    binding: "ASSETS",
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
