# 造场安卓壳(Zaochang Android Shell)

远程 WebView 壳(web-to-android **方案 B**,更新模式 **Mode 1: restart-to-latest**)。
应用本体就是网站本身:壳只做导航分流、会话保持、兼容性门禁与错误兜底,**不打包任何 Web 资产**,网站每次部署对已安装应用即时生效,无需发 APK。

## 为什么是远程 WebView(而不是 TWA / Capacitor / 原生重写)

- 站点是 **SSR**(Cloudflare Workers 上的 vinext App Router),Web 层就是服务器,APK 打包 Web 资产没有意义;
- 站点**不是 PWA**(无 manifest/SW),TWA 不成立;且国内 OEM ROM 浏览器普遍不支持 Custom Tabs,TWA 会退化成普通浏览器标签;
- 无任何原生桥需求, Capacitor 只增加体积与维护面;
- 壳**零 AndroidX 依赖**(纯框架 API + Kotlin),构建只依赖本机已缓存的 Gradle/AGP 工件,可完全离线构建。

## 兼容性契约(唯一 Web↔壳接口)

`GET https://aetherstudio.top/api/app-shell`(源码 `app/api/app-shell/route.ts`,`cache-control: no-store`):

```json
{
  "schemaVersion": 1,
  "web": {
    "buildId": "2026-08-26.1",
    "mode": "remote",
    "minShellVersionCode": 1,
    "maxShellVersionCode": null,
    "bridgeApiVersion": 0
  }
}
```

壳行为(`AppShell.kt` / `MainActivity.kt#checkShellCompatibility`):

| 情形 | 壳行为 |
|---|---|
| `minShellVersionCode > 壳 versionCode` 或 `maxShellVersionCode < 壳 versionCode` | 原生升级页(fail-closed,**不加载站点**),可跳浏览器应急 |
| 清单拉取失败(网络/超时/解析) | 视为网络问题照常加载;但**已判定过不兼容后**,失败不再洗掉升级页 |
| 兼容 | 正常加载 |

`bridgeApiVersion` 恒为 0——本壳**没有 JS↔原生桥**,Web 层不得假设任何原生能力。

## 构建与验证:如何发布

| 更新类型 | 做法 |
|---|---|
| **网站内容/样式/功能**(绝大多数) | 正常 `git push main` → CI → deploy。已装应用下次启动即最新,**无需任何安卓操作** |
| **壳本身**(导航规则、主机白名单、UI 兜底) | 改 `android/**`,`versionCode +1`,`gradlew assembleRelease` 出新 APK 侧载;同时更新站点 `/api/app-shell` 的 `android.*` 字段 |
| **换域名/破坏性 Web 变更** | 先发兼容旧壳的过渡版本,再提升站点 `minShellVersionCode` 强制升级 |
| **回滚壳** | 直接侧载上一个 versionCode 的 APK(Android 允许 `adb install -d` 或卸载重装) |

签名(密钥已生成并使用中):密钥库 `android/zaochang-release.jks` + 口令文件 `android/keystore.properties`(均已 gitignore)。**权威备份在阿里盒子 `/etc/zaochang/zaochang-release.jks` + `keystore.properties`**(与生产 Worker secrets 同目录,root:zaochang 640)。丢失此密钥 = 无法向已装用户推送更新(签名不一致不能覆盖安装),务必备份。证书指纹(SHA-256):`71:E2:E8:40:4B:DB:A1:C4:90:30:FE:85:5E:8C:65:BD:5E:68:C6:CC:EE:A2:EA:C1:BE:A0:16:F3:D9:FC:A3:59`。若需重签新密钥,命令参考:

```powershell
& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -keystore zaochang-release.jks -alias zaochang -keyalg RSA -keysize 2048 -validity 10950 -dname "CN=Zaochang Android Release, OU=Zaochang, O=Aether Studio, C=CN"
```

注意:JKS 默认已迁 PKCS12,**storePassword 与 keyPassword 必须相同**(PKCS12 单口令),`keystore.properties` 里两行填同一个值。

## APK 分发(已上线流程)

APK 托管在站点自身:`public/downloads/zaochang-<version>.apk`(文件名带版本,不覆盖旧文件)。发布新 APK 的完整流程:

1. `app/build.gradle.kts` bump `versionCode`/`versionName`;
2. `gradlew assembleRelease` 出签名 APK;
3. 拷贝为 `public/downloads/zaochang-<version>.apk`(不删旧文件,留作回滚);
4. 更新 `app/api/_lib/app-download.ts` 的全部常量(sha256/sizeBytes/fileName/versionCode/versionName);
5. 跑 `npm test`——集成测试会**字节级校验**下载文件与常量的 sha256/大小一致,并断言 `/api/app-shell` 清单指向同一文件,不一致即红。

用户入口:站点 `/app` 页(下载按钮 + 校验值 + 安装说明);`/api/app-shell` 清单的 `android.downloadUrl` 同源直链,供壳与第三方程序化获取。缓存策略见 `public/_headers`(文件名版本化 → immutable)。

## 安全不变量(改动前自查)

1. 只加载 `https://aetherstudio.top`(及 OAuth 提供方 `github.com` / `accounts.google.com` 的登录闭环);其余 http(s) 全部外抛系统浏览器;`mailto:`/`tel:`/专有 scheme 同样外抛。白名单在 `ShellConfig.INTERNAL_HOSTS`,**精确主机匹配,不用子串匹配**。
2. SSL 错误永远 `handler.cancel()`;不放宽混合内容;`allowFileAccess`/`allowContentAccess`/定位全关。
3. 无 `addJavascriptInterface`,无任何原生桥。
4. WebView 调试仅 debuggable 构建开启;`allowBackup=false`(会话 cookie 不进云备份)。
5. 权限仅 `INTERNET` + `CAMERA`(扫一扫:getUserMedia 只对本站、只视频放行;运行时权限未授予先弹系统对话框)+ `REQUEST_INSTALL_PACKAGES`(应用内更新自装,受系统「安装未知应用」门控)。文件选择走系统 SAF、下载走自研 MediaStore 下载器(公共 Downloads,带会话 Cookie、还原中文文件名;失败清理残留行)。
6. 深链仅接受 `https://aetherstudio.top` / `www.aetherstudio.top`,进 Activity 前仍做主机校验。

## 构建命令

```powershell
cd android
.\gradlew.bat --offline assembleDebug     # 调试 APK:app\build\outputs\apk\debug\app-debug.apk
.\gradlew.bat assembleRelease             # 需要 keystore.properties,否则产出未签名 APK
```

- 本机(Android Studio SDK + Gradle 9.4.1 + AGP 9.2.0 + Kotlin 2.2.10 已缓存)可 `--offline` 构建;新机器首次构建需联网拉取。
- 版本三件套:AGP `android/build.gradle.kts`、Gradle wrapper(`gradle/wrapper/gradle-wrapper.properties`)、`app/build.gradle.kts` 的 `versionCode/versionName`。

## 更新记录

- **v1.2.1(versionCode 5,2026-10-05)**:相机修复。根因是站点自己的安全头——`permissions-policy` 曾全站 `camera=()`(无相机时代的加固),在策略层直接拒绝 getUserMedia,任何客户端权限都无效;Web 侧改 `camera=(self)`(GitHub 连接页维持全关)。壳侧按 WebView 已知坑加固:首次相机授权回调后不再续接旧请求(当次 grant 仍可能被拒),改为重载页面让页面在权限已持有时重新发起;新增 `mediaPlaybackRequiresUserGesture=false`。Web 扫码组件:`<video>` 只在拿到流后挂载(空 video 在国产内核渲染巨大播放占位图),错误文案按 App 内/浏览器分流,后置约束不可用时回落任意摄像头。

- **v1.2.0(versionCode 4,2026-10-05)**
  - **扫码登录(全栈,双向)**:正向(手机已登录 → 电脑未登录)在登录页展示 QR,手机确认后电脑登录;反向(电脑已登录 → 手机未登录)在个人页「让手机扫码登录」展示 QR + 6 位配对码,手机扫码输码、桌面显式「允许」后手机登录(多两道验证:二维码可能被截图/旁观)。`/api/auth/qr/{start,poll,confirm,host,pair,claim,host-state,approve}` 路由 + `qr_login_sessions` 表(迁移 `0029`,auth_sessions provider CHECK 扩 `'qr'` 整表重建)。token 一次性、只存 SHA-256、2 分钟 TTL;全部状态迁移条件 UPDATE + `meta.changes` 原子判定;会话与 GitHub/邮箱码/passkey 同管线(provider `'qr'`);配对码错 5 次整行作废;方向互斥(正向行 pair_code_hash='',反向行非空,互相不可消费)。手机端 `/signin/qr/scan` 纯 JS 扫码(jsQR,不依赖 Play Services 的 BarcodeDetector),只认同源两类登录链接并按路径分流。
  - **应用内更新**:清单 `android.latest*` 驱动「新版可用」横幅(可划掉,同版本不再打扰);立即更新走自研下载器 + PackageInstaller,受系统「安装未知应用」门控(授权页回来自动续装);强制升级页也新增「下载新版本」。AppShell 解析 `android.*` 时 fail-closed(版本必须是真 Int、downloadUrl 必须 https+站点主机)。
  - **壳内相机(扫一扫)**:`onPermissionRequest` 只对本站、只视频放行;WebView `grant()` 以 App 持有 CAMERA 运行时权限为前提,未授予先 `requestPermissions`,对话框回来续授。新增 `CAMERA`、`REQUEST_INSTALL_PACKAGES` 两权限 + 安装器包可见性 queries。
  - **passkey 检测修复**:`browserSupportsWebAuthn()` 只查 API 面存在,Android WebView(不支持 WebAuthn)会渲染出永远失败的按钮;现叠加 `platformAuthenticatorIsAvailable()` 异步探测,无平台认证器的环境(WebView/无锁屏凭据桌面)按钮不渲染。App 内 passkey 登录仍不可用(WebView 平台限制),用户走扫码/GitHub/邮箱码。
  - 测试:`tests/qr-login.test.mjs` 契约钉 12 条 + `tests/suites/13-qr-login.tests.mjs` 端到端 4 条(签发→401→成员确认→同权会话→重放/过期终态);harness 迁移列表补 0029。
  - 已知边界:模拟器(API 35 镜像)上 WebView getUserMedia 因平台相机 HAL 问题不可用(枚举有设备但打开挂起),真机不受影响;扫码也可改用系统相机扫后跳转。

- **v1.1.0(versionCode 3,2026-10-05)**
  - 全屏支持:`WebChromeClient.onShowCustomView/onHideCustomView` 落地,星野页「切换全屏」按钮在 App 内生效(此前 requestFullscreen 被静默丢弃)。全屏视图挂 window decor 顶层 + 沉浸模式,back 先退全屏,升级判定/主文档错误时先摘全屏视图再弹遮罩(fail-closed 不允许遮罩下有活页面)。
  - 进程死亡状态恢复:`onSaveInstanceState` 保存 `WebView.saveState` + `pendingInitialUrl`,冷启动 `restoreState` 回到离开时的页面;恢复导航在途时门禁放行不再叠加首页加载(`restoredLaunch`),深链 intent 优先于恢复。
  - 预测性返回(API 33+,manifest `enableOnBackInvokedCallback=true`):可后退/全屏中注册 `OnBackInvokedCallback`(历史后退/退全屏),历史根注销回调交还系统(finish + 返回桌面动画);API < 33 仍走 `onBackPressed`,行为不变。
  - 冷启动体感:loading 遮罩在 `onPageCommitVisible`(首帧内容可见)即撤,不再等 `onPageFinished`。

## 已知取舍

- 深链未做 Digital Asset Links 验证(需在站点发 `/.well-known/assetlinks.json` 才能免确认弹窗),首次点链接系统会问"用哪个应用打开"。
- 预测性返回仅 API 33+ 动态启停;低版本返回行为不变(legacy `onBackPressed`)。
- `configChanges` 吸收旋转/键盘形态变化(WebView 不重载);深色模式跟随系统 UI 但站点自身是固定浅色主题。
- Google 登录在国内网络环境依赖 `accounts.google.com` 可达性,与网页端一致;邮箱验证码登录不受影响。
