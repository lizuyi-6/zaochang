import { NextResponse } from "next/server";
import { APP_DOWNLOAD } from "../_lib/app-download";
import { publicAppOrigin } from "../../oauth-session";

// 安卓壳(web-to-android 方案 B:远程 WebView 壳)与 Web 层的唯一兼容性契约。
// 壳在冷启动/回前台(节流)时以缓存穿透方式 GET 本路由:
//   - web.minShellVersionCode > 壳 versionCode,或 web.maxShellVersionCode < 壳 versionCode
//     ⇒ 壳显示原生升级页(fail-closed,不加载站点);
//   - 请求失败 ⇒ 视为网络问题,继续正常加载站点(站点自身加载失败由壳的错误重试页兜底)。
// 无原生 JS 桥(bridgeApiVersion 恒为 0):Web 层永不假设壳具备任何原生能力。
// 变更纪律:Web 层出现影响壳的破坏性变化(换域名、新增必需能力等)时,提升
// minShellVersionCode 并同步更新 buildId;android.* 字段在发布新 APK 时更新。
const SHELL_MANIFEST = {
  schemaVersion: 1,
  channel: "production",
  web: {
    // 信息性构建号:仅用于日志/观测,不参与门禁判断(壳不缓存站点资源,
    // 每次启动都直连生产 URL,站点更新天然即时生效——Mode 1 restart-to-latest)。
    buildId: "2026-08-26.2",
    mode: "remote",
    minShellVersionCode: 1,
    maxShellVersionCode: null,
    bridgeApiVersion: 0,
  },
  android: {
    latestVersionCode: APP_DOWNLOAD.versionCode,
    latestVersionName: APP_DOWNLOAD.versionName,
    required: false,
    // 占位 null;GET 内用请求真实 origin 覆盖(与 web.url 同理)。
    downloadUrl: null,
    sha256: APP_DOWNLOAD.sha256,
  },
} as const;

export async function GET(request: Request) {
  return NextResponse.json(
    {
      ...SHELL_MANIFEST,
      web: { ...SHELL_MANIFEST.web, url: `${publicAppOrigin(request)}/` },
      android: { ...SHELL_MANIFEST.android, downloadUrl: `${publicAppOrigin(request)}/${APP_DOWNLOAD.filePath}` },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
