// 安卓壳 APK 的发布事实——单一事实源:/app 下载页、/api/app-shell 清单、
// 集成测试三方共用,防止「清单说 vN、文件是 vM」的漂移。
// 发布新 APK 的流程(android/README.md §发布):bump versionCode/versionName →
// 重签名构建 → 替换 public/downloads/ 下的文件(文件名带版本,不覆盖旧文件)→
// 更新此处全部常量。tests/rendered-html.test.mjs 会校验 sha256/大小与实际文件一致。
export const APP_DOWNLOAD = {
  versionCode: 2,
  versionName: "1.0.1",
  fileName: "zaochang-1.0.1.apk",
  // 相对站点根的下载路径(不带前导斜杠,便于拼 origin)。
  filePath: "downloads/zaochang-1.0.1.apk",
  sizeBytes: 664682,
  sha256: "8f2df8272d76d1c06cd9ae4539cab1aa565c0babdc409c493c0ec57d998b02f6",
  // minSdk 26 = Android 8.0。
  minAndroid: "8.0",
} as const;
