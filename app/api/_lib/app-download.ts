// 安卓壳 APK 的发布事实——单一事实源:/app 下载页、/api/app-shell 清单、
// 集成测试三方共用,防止「清单说 vN、文件是 vM」的漂移。
// 发布新 APK 的流程(android/README.md §发布):bump versionCode/versionName →
// 重签名构建 → 替换 public/downloads/ 下的文件(文件名带版本,不覆盖旧文件)→
// 更新此处全部常量。tests/rendered-html.test.mjs 会校验 sha256/大小与实际文件一致。
export const APP_DOWNLOAD = {
  versionCode: 5,
  versionName: "1.2.1",
  fileName: "zaochang-1.2.1.apk",
  // 相对站点根的下载路径(不带前导斜杠,便于拼 origin)。
  filePath: "downloads/zaochang-1.2.1.apk",
  sizeBytes: 672778,
  sha256: "da7295bf19a2a86c2218e88653a138d7b5f56dd02e4f80d0f8531bf90d60a735",
  // minSdk 26 = Android 8.0。
  minAndroid: "8.0",
} as const;
