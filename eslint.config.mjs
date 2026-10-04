import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    // build/** 整体忽略,但 sites-vite-plugin 是 vite.config 直接引用的插件源码,必须参与 lint。
    "build/**",
    "!build/sites-vite-plugin.ts",
    "dist/**",
    "public/product-apps/**",
    "public/lattice/**",
    // Hyperknow 复刻 SPA(独立 Vite 工程,不参与主站 lint)。
    "hyperknow-spa/**",
    // qa-runs 是验收证据归档(2026-10 审计第 5 批):历史产物只读,不参与 lint;
    // 新产物经 .gitignore 停止入库。
    "qa-runs/**",
    ".wrangler/**",
    ".playwright-cli/**",
    "output/**",
    "node_modules.xdrive-partial-*/**",
    "next-env.d.ts",
    // 未跟踪的 scratch 脚本与自动生成的 binding 类型声明，不参与 lint。
    ".tmp-preview-state/**",
    "worker-configuration.d.ts",
    // 安卓壳工程（Gradle/Kotlin），不参与 web 侧 lint。
    "android/**",
  ]),
  {
    // vinext 用原生 <img> + /_vinext/image 优化，不走 next/image，
    // 因此 @next/next/no-img-element 是误报（本项目并非 next/image 项目）。
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
