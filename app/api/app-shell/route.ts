import { NextResponse } from "next/server";
import { APP_DOWNLOAD } from "../_lib/app-download";
import { SHELL_MANIFEST } from "../_lib/shell-manifest";
import { publicAppOrigin } from "../../oauth-session";

// 清单常量与门禁语义见 app/api/_lib/shell-manifest.ts(纯常量模块,
// 与 /app/version 页共用同一事实源);本路由只负责按请求 origin 填充两个 URL。
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
