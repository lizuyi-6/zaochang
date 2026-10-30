// 安卓壳 APK 的发布事实——单一事实源:/app 下载页、/app/version 版本页、
// /api/app-shell 清单、集成测试四方共用,防止「清单说 vN、文件是 vM」的漂移。
// 发布新 APK 的流程(android/README.md §发布):bump versionCode/versionName →
// 重签名构建 → 替换 public/downloads/ 下的文件(文件名带版本,不覆盖旧文件)→
// 更新此处全部常量。tests/rendered-html.test.mjs 会校验 sha256/大小与实际文件一致。
export const APP_DOWNLOAD = {
  versionCode: 7,
  versionName: "1.2.3",
  fileName: "zaochang-1.2.3.apk",
  // 相对站点根的下载路径(不带前导斜杠,便于拼 origin)。
  filePath: "downloads/zaochang-1.2.3.apk",
  sizeBytes: 677590,
  sha256: "6b03b2699c0be4a2505462279d89bae6f2c41ad8fc326ffd06024250daf75ca3",
  // minSdk 26 = Android 8.0。
  minAndroid: "8.0",
} as const;

// Android App Links(https 深链直进 App)的事实源:壳的 applicationId 与发布
// 签名证书指纹。站点必须在 /.well-known/assetlinks.json 提供同一份指纹,
// 系统据此把 aetherstudio.top 的 https 链接交给壳,而不是浏览器/选择器。
// 换签名证书必须同步改这两个文件,否则深链会退回浏览器。
export const APP_LINKS = {
  packageName: "top.aetherstudio.zaochang",
  // 发布证书 SHA-256(冒号分隔大写),与 keytool/apksigner 输出一致。
  signingCertSha256: "71:E2:E8:40:4B:DB:A1:C4:90:30:FE:85:5E:8C:65:BD:5E:68:C6:CC:EE:A2:EA:C1:BE:A0:16:F3:D9:FC:A3:59",
} as const;
