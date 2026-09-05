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
    "build/**",
    "dist/**",
    "public/product-apps/**",
    // Hyperknow 复刻 SPA(独立 Vite 工程,不参与主站 lint)。
    "hyperknow-spa/**",
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
