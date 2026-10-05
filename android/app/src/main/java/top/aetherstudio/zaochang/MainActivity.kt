package top.aetherstudio.zaochang

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.SystemClock
import android.provider.MediaStore
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.util.Locale

/**
 * 造场安卓壳:单 Activity 远程 WebView。
 *
 * 安全不变量(改动前先读 android/README.md):
 *  - 仅加载 https://aetherstudio.top(及 OAuth 提供方 github.com / accounts.google.com 的登录闭环);
 *    其它 http(s) 一律交系统浏览器,mailto/tel/专有 scheme 同样外抛。
 *  - SSL 错误永远 cancel,绝不 proceed;不放宽混合内容;不暴露任何 JS↔原生桥。
 *  - 文件访问(file://、content://)与定位全部关闭;WebView 调试仅 debuggable 构建开启。
 */
class MainActivity : Activity() {

  private lateinit var webContainer: FrameLayout
  private lateinit var web: WebView
  private lateinit var loadingOverlay: LinearLayout
  private lateinit var errorOverlay: LinearLayout
  private lateinit var errorDetail: TextView
  private lateinit var upgradeOverlay: LinearLayout

  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
  // 全屏自定义视图(HTML5 requestFullscreen,如星野页的全屏按钮):
  // 视图挂到 window decor 顶层并进入沉浸模式;back 先退全屏再走历史。
  private var fullscreenView: View? = null
  private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
  // API 33+ 预测性返回:可后退/全屏中时注册系统返回回调;历史根上注销,
  // 让系统接管(finish + 返回桌面动画)。AndroidManifest 需
  // enableOnBackInvokedCallback=true(API 33 以下仍走 onBackPressed)。
  private var backInvoker: OnBackInvokedCallback? = null
  private var backInvokerRegistered = false
  // 冷启动恢复进程死亡前的会话:restoreState 会自动重载当前历史项,
  // 门禁放行时不要再叠加一次首页加载(否则首页被叠进刚恢复的历史)。
  private var restoredLaunch = false
  // 最近一次 /api/app-shell 清单(驱动「新版可用」横幅;升级判定时不显示)。
  private var latestManifest: ShellManifest? = null
  // 横幅被用户划掉的版本:同版本不再打扰,更新版本号后重新出现。
  private var updateBannerDismissedFor: Int? = null
  // 已下载、等待「安装未知应用」授权的 APK(MediaStore 行 URI)。
  private var pendingInstallApkUri: Uri? = null
  // 等待 CAMERA 运行时权限的 getUserMedia 请求(扫一扫)。
  private var pendingCameraRequest: android.webkit.PermissionRequest? = null
  private lateinit var updateBanner: LinearLayout
  private lateinit var updateBannerText: TextView
  private lateinit var upgradeDownload: Button
  private var upgradeVerdictSeen = false
  private var lastStartedUrl: String? = null
  private var pendingInitialUrl: String = ShellConfig.BASE_URL
  private var lastCompatCheckAt = 0L
  // onDestroy 后 compat 检查线程的回调不再触碰已销毁的视图树。
  @Volatile private var destroyed = false
  // release 构建不落用户导航日志(logcat/bugreport 可读)。AGP9 默认不生成
  // BuildConfig,复用 FLAG_DEBUGGABLE 判定。
  private val isDebugBuild by lazy {
    (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
  }

  // ————————————————————————— 生命周期 —————————————————————————

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)
    webContainer = findViewById(R.id.web_container)
    loadingOverlay = findViewById(R.id.loading_overlay)
    errorOverlay = findViewById(R.id.error_overlay)
    errorDetail = findViewById(R.id.error_detail)
    upgradeOverlay = findViewById(R.id.upgrade_overlay)
    findViewById<Button>(R.id.error_retry).setOnClickListener { retryLoad() }
    findViewById<Button>(R.id.upgrade_open_browser).setOnClickListener { openExternal(Uri.parse(ShellConfig.BASE_URL)) }
    findViewById<Button>(R.id.upgrade_retry).setOnClickListener {
      hide(upgradeOverlay)
      checkShellCompatibility(initial = true)
    }
    updateBanner = findViewById(R.id.update_banner)
    updateBannerText = findViewById(R.id.update_banner_text)
    upgradeDownload = findViewById(R.id.upgrade_download)
    findViewById<Button>(R.id.update_banner_action).setOnClickListener {
      latestManifest?.androidUpdate?.downloadUrl?.let { url ->
        hide(updateBanner)
        startApkUpdate(url)
      }
    }
    findViewById<ImageButton>(R.id.update_banner_dismiss).setOnClickListener {
      updateBannerDismissedFor = latestManifest?.androidUpdate?.latestVersionCode
      hide(updateBanner)
    }
    upgradeDownload.setOnClickListener {
      latestManifest?.androidUpdate?.downloadUrl?.let { url ->
        hide(upgradeOverlay)
        startApkUpdate(url)
      }
    }

    applySystemBarAppearance()
    rebuildWebView()
    applyWindowInsets()
    val deepLink = resolveSiteUrl(intent)
    if (deepLink != null) {
      pendingInitialUrl = deepLink
    } else if (savedInstanceState != null) {
      savedInstanceState.getString(KEY_PENDING_INITIAL_URL)?.let { pendingInitialUrl = it }
      // restoreState 返回恢复的 WebBackForwardList(null = 无可恢复状态)。
      if (web.restoreState(savedInstanceState) != null) restoredLaunch = true
    }
    updateBackHandler()
    // 兼容检查是网络往返(超时上限 6s):先显示 loading,别让用户盯着空白页。
    show(loadingOverlay)
    checkShellCompatibility(initial = true)
  }

  override fun onDestroy() {
    destroyed = true
    exitFullscreen()
    unregisterBackInvoker()
    super.onDestroy()
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    if (this::web.isInitialized) web.saveState(outState)
    outState.putString(KEY_PENDING_INITIAL_URL, pendingInitialUrl)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    resolveSiteUrl(intent)?.let { url ->
      when {
        upgradeVerdictSeen -> Unit // 升级判定后不再加载"不兼容"站点(遮罩下不许有活页面)
        web.url == null -> pendingInitialUrl = url
        else -> web.loadUrl(url)
      }
    }
  }

  override fun onResume() {
    super.onResume()
    web.onResume()
    web.resumeTimers()
    // 用户从「安装未知应用」授权页回来:若此前已下好 APK,自动续上安装。
    val pending = pendingInstallApkUri
    if (pending != null && canInstallPackages()) {
      pendingInstallApkUri = null
      launchInstaller(pending)
    }
    if (SystemClock.elapsedRealtime() - lastCompatCheckAt > COMPAT_RECHECK_INTERVAL_MS) {
      checkShellCompatibility(initial = false)
    }
  }

  override fun onPause() {
    super.onPause()
    web.onPause()
    web.pauseTimers()
    // 会话 cookie(HttpOnly,zaochang_session)落盘,冷启动保持登录态。
    CookieManager.getInstance().flush()
  }

  /** 返回键/返回手势:先退全屏,再在 WebView 历史中后退,历史为空才退出应用。 */
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    when {
      fullscreenView != null -> exitFullscreen()
      web.canGoBack() -> web.goBack()
      else -> super.onBackPressed()
    }
  }

  // ————————————————————————— WebView 装配 —————————————————————————

  /** 渲染进程崩溃后 WebView 不可复用:销毁重建并回到崩溃前的页面。 */
  private fun rebuildWebView() {
    if (this::web.isInitialized) {
      webContainer.removeAllViews()
      web.destroy()
    }
    web = createConfiguredWebView()
    webContainer.addView(
      web,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT),
    )
    // 新 WebView 无历史:历史根上注销系统返回回调,交还系统默认行为。
    updateBackHandler()
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun createConfiguredWebView(): WebView {
    val view = WebView(this)
    // 仅 debuggable 构建(enable debugging on chrome://inspect);release 构建保持关闭。
    if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      WebView.setWebContentsDebuggingEnabled(true)
    }
    view.settings.apply {
      javaScriptEnabled = true
      domStorageEnabled = true
      allowFileAccess = false
      allowContentAccess = false
      mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      setSupportMultipleWindows(false)
      javaScriptCanOpenWindowsAutomatically = false
      setGeolocationEnabled(false)
      // getUserMedia 起播不依赖手势(扫码页按钮本身即用户意图);不影响权限门控。
      mediaPlaybackRequiresUserGesture = false
      cacheMode = WebSettings.LOAD_DEFAULT
    }
    CookieManager.getInstance().setAcceptCookie(true)
    view.webViewClient = ShellWebViewClient()
    view.webChromeClient = ShellChromeClient()
    view.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
      startFileDownload(url, mimeType, contentDisposition)
    }
    return view
  }

  private inner class ShellWebViewClient : WebViewClient() {

    // shouldInterceptRequest 在 IO 线程回调;toast/enqueue 的 UI 部分切主线程。
    private val recentApkRequests = HashMap<String, Long>()

    /**
     * Chromium WebView(API 35 WebView 124 实测)对 <a download> 点击与
     * attachment 顶级导航既不走 shouldOverrideUrlLoading 也不回调
     * DownloadListener,静默丢弃。下载请求的 HTTP 一定发出,在此钩子
     * 确定性接管 .apk;去重窗口防同一请求多次 enqueue。
     */
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
      val url = request.url
      val isApk = url.scheme?.lowercase(Locale.ROOT) == "https" &&
        url.host?.lowercase(Locale.ROOT) in ShellConfig.INTERNAL_HOSTS &&
        url.path?.lowercase(Locale.ROOT)?.endsWith(".apk") == true
      if (isApk) {
        val key = url.toString()
        val now = SystemClock.elapsedRealtime()
        var shouldEnqueue = false
        synchronized(recentApkRequests) {
          if (now - (recentApkRequests[key] ?: 0L) > APK_REQUEST_DEDUPE_MS) {
            recentApkRequests[key] = now
            // 淘汰最旧一条,而不是整表清空:clear 会把仍在 5s 窗口内的请求全部重开闸。
            if (recentApkRequests.size > 32) {
              recentApkRequests.minByOrNull { it.value }?.let { recentApkRequests.remove(it.key) }
            }
            shouldEnqueue = true
          }
        }
        if (shouldEnqueue) {
          runOnUiThread { if (!destroyed) startFileDownload(key, null, null) }
        }
      }
      return null
    }

    /** 顶级导航按主机白名单分流;iframe/子资源直接放行(Turnstile 等第三方嵌入必需)。 */
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      if (isDebugBuild) Log.i(TAG, "sOUL main=${request.isForMainFrame} url=${request.url}")
      if (!request.isForMainFrame) return false
      return navigateInternal(request.url)
    }

    /**
     * 服务端 30x 重定向不回调 shouldOverrideUrlLoading:白名单主机(如 github.com
     * release 资产)发出的重定向链会把任意终点直接落进特权 WebView。历史条目更新
     * 是重定向落地后的确定性回调,在此对主文档重过主机闸,违规即弹回站点首页。
     */
    override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
      super.doUpdateVisitedHistory(view, url, isReload)
      val uri = url?.let(Uri::parse) ?: return
      val scheme = uri.scheme?.lowercase(Locale.ROOT)
      val host = uri.host?.lowercase(Locale.ROOT)
      val allowed = scheme == "https" && host != null && host in ShellConfig.INTERNAL_HOSTS
      if (!allowed && !upgradeVerdictSeen) {
        Log.w(TAG, "blocked non-allowlisted main document after redirect: $url")
        web.loadUrl(ShellConfig.BASE_URL)
      }
      // 前进/后退/新导航都会改写历史:重新评估预测性返回回调的注册状态。
      updateBackHandler()
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      lastStartedUrl = url
      // 真实导航已开始:进程死亡恢复的特殊路径结束,回到常规生命周期。
      restoredLaunch = false
      hide(errorOverlay)
    }

    /** 首帧内容可见即撤 loading 遮罩;onPageFinished 只作兜底。 */
    override fun onPageCommitVisible(view: WebView, url: String?) {
      hide(loadingOverlay)
    }

    override fun onPageFinished(view: WebView, url: String) {
      hide(loadingOverlay)
    }

    /** 仅主文档失败才进错误页;子资源失败由页面自身呈现。 */
    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
      if (!request.isForMainFrame) return
      showError(error.description?.toString().orEmpty().ifEmpty { getString(R.string.error_detail_default) })
    }

    /** 安全不变量:证书错误一律取消,绝不 proceed。 */
    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
      handler.cancel()
      val mainFrame = view.url != null && error.url == view.url
      if (mainFrame) {
        showError(getString(R.string.error_ssl))
      } else {
        Log.w(TAG, "subresource TLS failure ignored: ${error.url}")
      }
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
      Log.w(TAG, "webview render process gone (crashed=${detail.didCrash()}); rebuilding")
      runOnUiThread {
        // 全屏视图属于崩溃的渲染进程:先摘掉再重建。
        exitFullscreen()
        rebuildWebView()
        // 与加载门禁同规:升级判定后只显示升级页;恢复目标还要过主机闸
        // (lastStartedUrl 可能是重定向落地的非白名单主机)。
        if (upgradeVerdictSeen) {
          show(upgradeOverlay)
          return@runOnUiThread
        }
        show(loadingOverlay)
        val target = lastStartedUrl ?: pendingInitialUrl
        val uri = Uri.parse(target)
        val allowed = uri.scheme?.lowercase(Locale.ROOT) == "https" &&
          uri.host?.lowercase(Locale.ROOT) in ShellConfig.INTERNAL_HOSTS
        web.loadUrl(if (allowed) target else ShellConfig.BASE_URL)
      }
      return true
    }
  }

  private inner class ShellChromeClient : WebChromeClient() {

    /** HTML5 requestFullscreen(星野页全屏按钮):不实现本回调时 WebView 静默忽略全屏请求。 */
    override fun onShowCustomView(view: View, callback: CustomViewCallback) {
      enterFullscreen(view, callback)
    }

    override fun onHideCustomView() {
      exitFullscreen()
    }

    override fun onShowFileChooser(
      webView: WebView,
      filePathCallback: ValueCallback<Array<Uri>>,
      fileChooserParams: FileChooserParams,
    ): Boolean {
      fileChooserCallback?.let { it.onReceiveValue(null) }
      val intent = buildFileChooserIntent(fileChooserParams.acceptTypes)
      return try {
        startActivityForResult(intent, REQUEST_FILE_CHOOSER)
        fileChooserCallback = filePathCallback
        true
      } catch (e: ActivityNotFoundException) {
        Log.w(TAG, "no file picker available", e)
        filePathCallback.onReceiveValue(null)
        false
      }
    }

    /** 站点无定位需求;显式拒绝,避免任何提示。 */
    override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
      callback?.invoke(origin, false, false)
    }

    /**
     * getUserMedia(扫一扫):只对本站页面、且只请求摄像头时放行;麦克风/其余
     * 资源一律 deny。WebView 的 grant() 以 App 自身持有 CAMERA 运行时权限为前提
     * (API 31+ 起系统强制):未授予时先 requestPermissions,系统对话框回来在
     * onRequestPermissionsResult 里续授——首次扫码弹一次,拒绝则由页面自行提示。
     */
    override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
      val host = request.origin?.host?.lowercase(Locale.ROOT)
      val resources = request.resources ?: emptyArray()
      val videoOnly = resources.isNotEmpty() &&
        resources.all { it == android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE }
      if (host == null || host !in ShellConfig.INTERNAL_HOSTS || !videoOnly) {
        runOnUiThread { if (!destroyed) request.deny() }
        return
      }
      runOnUiThread {
        if (destroyed) return@runOnUiThread
        if (checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) {
          request.grant(request.resources)
        } else {
          pendingCameraRequest = request
          requestPermissions(arrayOf(android.Manifest.permission.CAMERA), REQUEST_CAMERA)
        }
      }
    }
  }

  /**
   * 主导航分流。返回 false = 留在应用内 WebView 加载;true = 已外抛系统。
   * 仅 https + 白名单主机可留在应用内;http(即便同主机)也外抛浏览器。
   */
  private fun navigateInternal(uri: Uri): Boolean {
    val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return true
    val host = uri.host?.lowercase(Locale.ROOT)
    if (scheme == "https" && host != null && host in ShellConfig.INTERNAL_HOSTS) {
      // 安装包/附件直链接给自研下载器(MediaStore):本镜像 WebView 对 .apk URL 连网络
      // 请求都不发出(DownloadListener/shouldInterceptRequest 双失效),只有这里拦得到;
      // 站点 /app 按钮因此保持普通导航链接(不带 download 属性)。return true 吃掉导航。
      if (uri.path?.lowercase(Locale.ROOT)?.endsWith(".apk") == true) {
        startFileDownload(uri.toString(), null, null)
        return true
      }
      return false
    }
    openExternal(uri)
    return true
  }

  private fun openExternal(uri: Uri) {
    try {
      startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (e: ActivityNotFoundException) {
      Toast.makeText(this, R.string.no_external_app, Toast.LENGTH_SHORT).show()
    }
  }

  // ————————————————————————— 文件选择 / 下载 —————————————————————————

  /** 站点用到的 accept 集:image/png|jpeg|webp 与 .pdf/.txt/.docx;未知项退回全类型选择。 */
  private fun buildFileChooserIntent(acceptTypes: Array<String>): Intent {
    val mimeTypes = mutableSetOf<String>()
    var sawUnknownToken = false
    acceptTypes
      .flatMap { it.split(",").map(String::trim).filter(String::isNotEmpty) }
      .forEach { token ->
        when {
          token.startsWith(".") -> when (token.lowercase(Locale.ROOT)) {
            ".png" -> mimeTypes += "image/png"
            ".jpg", ".jpeg" -> mimeTypes += "image/jpeg"
            ".webp" -> mimeTypes += "image/webp"
            ".pdf" -> mimeTypes += "application/pdf"
            ".txt" -> mimeTypes += "text/plain"
            ".docx" -> mimeTypes += "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            else -> sawUnknownToken = true
          }
          token.contains("/") -> mimeTypes += token.lowercase(Locale.ROOT)
          else -> sawUnknownToken = true
        }
      }
    return Intent(Intent.ACTION_GET_CONTENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      if (!sawUnknownToken && mimeTypes.isNotEmpty()) {
        if (mimeTypes.all { it.startsWith("image/") }) {
          type = "image/*"
        } else {
          type = "*/*"
          putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
        }
      } else {
        type = "*/*"
      }
    }
  }

  @Deprecated("Deprecated in Java")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != REQUEST_FILE_CHOOSER) return
    val callback = fileChooserCallback ?: return
    fileChooserCallback = null
    callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
  }

  /** 系统相机权限对话框回来:授权则拒绝旧请求并重载页面——WebView 已知行为是
   *  「授权前发起的取流请求,当次 grant() 仍可能被拒」(首次授权需重启才生效),
   *  重载让页面在权限已持有的状态下重新发起,再点一次立即成功,无需重启 App。 */
  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != REQUEST_CAMERA) return
    val request = pendingCameraRequest
    pendingCameraRequest = null
    if (request == null || destroyed) return
    val granted = grantResults.isNotEmpty() && grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED
    if (granted) {
      runCatching { request.deny() }
      if (this::web.isInitialized) web.reload()
    } else {
      request.deny()
    }
  }

  /**
   * 自研下载器(MediaStore 写公共 Downloads),取代 DownloadManager:
   * 本项目验证用的 API 35 WebView 124 模拟器上,DM 服务端会静默丢弃任务
   * (enqueue 正常返回、服务端零记录),自研路径在任何 ROM 上确定工作。
   * API <29 无 MediaStore.Downloads,回退系统浏览器下载。
   */
  private fun startFileDownload(
    url: String,
    mimeType: String?,
    contentDisposition: String?,
    onDownloaded: ((Uri) -> Unit)? = null,
  ) {
    if (Build.VERSION.SDK_INT < 29) {
      openExternal(Uri.parse(url))
      return
    }
    val activity = this
    Thread {
      val fileName = resolveDownloadFileName(url, contentDisposition, mimeType)
      val resolver = contentResolver
      var target: Uri? = null
      try {
        val values = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType ?: guessMimeType(fileName))
          put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
          ?: throw IOException("MediaStore insert returned null")
        resolver.openOutputStream(target)?.use { out ->
          val connection = URL(url).openConnection() as HttpURLConnection
          try {
            connection.connectTimeout = 10_000
            connection.readTimeout = 30_000
            connection.instanceFollowRedirects = true
            CookieManager.getInstance().getCookie(url)?.let { connection.setRequestProperty("Cookie", it) }
            connection.setRequestProperty("User-Agent", WebSettings.getDefaultUserAgent(activity))
            if (connection.responseCode !in 200..299) throw IOException("HTTP ${connection.responseCode}")
            connection.inputStream.use { input -> input.copyTo(out, DEFAULT_COPY_BUFFER) }
            out.flush()
          } finally {
            connection.disconnect()
          }
        } ?: throw IOException("openOutputStream returned null")
        val downloaded = target
        runOnUiThread {
          // 有回调(应用内更新)时由回调接管反馈;普通下载 toast。
          if (onDownloaded != null) onDownloaded(downloaded)
          else Toast.makeText(activity, R.string.download_done, Toast.LENGTH_SHORT).show()
        }
      } catch (e: Exception) {
        Log.w(TAG, "file download failed: $url", e)
        // 清掉已建而未写完的 MediaStore 行:否则公共 Downloads 里会积累 0 字节/半截文件。
        target?.let { resolver.delete(it, null, null) }
        runOnUiThread { Toast.makeText(activity, R.string.download_failed, Toast.LENGTH_LONG).show() }
      }
    }.start()
  }

  private fun guessMimeType(fileName: String): String = when (fileName.substringAfterLast('.', "").lowercase(Locale.ROOT)) {
    "png" -> "image/png"
    "jpg", "jpeg" -> "image/jpeg"
    "webp" -> "image/webp"
    "pdf" -> "application/pdf"
    "txt" -> "text/plain"
    "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    "apk" -> "application/vnd.android.package-archive"
    else -> "application/octet-stream"
  }

  /** 优先还原 filename*=UTF-8'' 里的原始中文文件名;否则退回 URLUtil 推断。 */
  private fun resolveDownloadFileName(url: String, contentDisposition: String?, mimeType: String?): String {
    contentDisposition?.let { disposition ->
      Regex("filename\\*=UTF-8''([^;]+)", RegexOption.IGNORE_CASE)
        .find(disposition)?.groupValues?.get(1)
        ?.let { encoded ->
          runCatching { URLDecoder.decode(encoded, "UTF-8") }.getOrNull()
            ?.takeIf { it.isNotBlank() && !it.contains('/') && !it.contains('\\') }
            ?.let { return it }
        }
    }
    return URLUtil.guessFileName(url, contentDisposition, mimeType)
  }

  // ————————————————————————— 兼容性门禁 / 载入 —————————————————————————

  /** 冷启动与回前台(节流)拉取 /api/app-shell,决定加载站点还是升级页。 */
  private fun checkShellCompatibility(initial: Boolean) {
    lastCompatCheckAt = SystemClock.elapsedRealtime()
    Thread {
      val manifest = AppShell.fetch(ShellConfig.BASE_URL, COMPAT_TIMEOUT_MS)
      if (destroyed) return@Thread
      runOnUiThread { if (!destroyed) applyCompatibilityVerdict(manifest, initial) }
    }.start()
  }

  private fun applyCompatibilityVerdict(manifest: ShellManifest?, initial: Boolean) {
    latestManifest = manifest
    updateUpdateBannerVisibility()
    val code = versionCode()
    when {
      manifest == null -> {
        // 清单不可达 = 网络问题:首次启动照常加载站点。
        // 但若此前已明确判定不兼容,维持升级页(fail-closed,不用"网络失败"洗掉升级判定)。
        if (upgradeVerdictSeen) {
          exitFullscreen()
          hide(loadingOverlay)
          show(upgradeOverlay)
        } else if (initial) {
          loadInitialUrl()
        } else {
          hide(loadingOverlay)
        }
      }
      manifest.minShellVersionCode > code ||
        (manifest.maxShellVersionCode != null && manifest.maxShellVersionCode < code) -> {
        upgradeVerdictSeen = true
        // 全屏视图会盖住遮罩(fail-closed 不允许升级页下有活页面)。
        exitFullscreen()
        hide(loadingOverlay)
        hide(updateBanner)
        show(upgradeOverlay)
        // 清单带同源下载直链时提供壳内下载;否则仍走「在浏览器中打开」。
        upgradeDownload.visibility =
          if (manifest.androidUpdate?.downloadUrl != null) View.VISIBLE else View.GONE
      }
      else -> {
        upgradeVerdictSeen = false
        hide(upgradeOverlay)
        if (initial) loadInitialUrl() else hide(loadingOverlay)
      }
    }
  }

  private fun loadInitialUrl() {
    if (!this::web.isInitialized) return
    // 进程死亡恢复的导航已在途(restoreState 自动重载当前历史项):
    // 这里再 loadUrl 会把首页叠进刚恢复的历史。恢复的加载若一直没提交
    // (onPageStarted 未触发、web.url 仍为 null),仍以 pendingInitialUrl 兜底。
    if (restoredLaunch && web.url != null) return
    if (web.url == null) {
      restoredLaunch = false
      show(loadingOverlay)
      web.loadUrl(pendingInitialUrl)
    }
  }

  private fun retryLoad() {
    hide(errorOverlay)
    if (web.url == null) {
      loadInitialUrl()
    } else {
      show(loadingOverlay)
      web.reload()
    }
  }

  private fun versionCode(): Int {
    val info = packageManager.getPackageInfo(packageName, 0)
    val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else {
      @Suppress("DEPRECATION") info.versionCode.toLong()
    }
    return code.toInt()
  }

  // ————————————————————————— 应用内更新 —————————————————————————

  /** 「新版可用」横幅:仅当清单报了更高版本、未被划掉、且未处于升级判定时显示。 */
  private fun updateUpdateBannerVisibility() {
    val update = latestManifest?.androidUpdate
    val visible = update != null && update.latestVersionCode > versionCode() &&
      updateBannerDismissedFor != update.latestVersionCode && !upgradeVerdictSeen
    if (visible) {
      updateBannerText.text = getString(R.string.update_banner_text, update!!.latestVersionName)
      show(updateBanner)
    } else {
      hide(updateBanner)
    }
  }

  /**
   * 应用内更新:APK 走自研下载器(带会话 Cookie,服务器/manifest 校验其完整性),
   * 下载完弹安装器。安装受「安装未知应用」门控:未授权时先跳系统授权页,
   * 授权回来在 onResume 续装。
   */
  private fun startApkUpdate(url: String) {
    if (!canInstallPackages()) {
      try {
        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
        Toast.makeText(this, R.string.update_enable_install_hint, Toast.LENGTH_LONG).show()
      } catch (e: ActivityNotFoundException) {
        Log.w(TAG, "no unknown-app-sources settings activity", e)
        Toast.makeText(this, R.string.update_install_unavailable, Toast.LENGTH_LONG).show()
      }
      return
    }
    startFileDownload(url, "application/vnd.android.package-archive", null) { uri -> tryShowInstallPrompt(uri) }
  }

  private fun canInstallPackages(): Boolean =
    Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls()

  private fun tryShowInstallPrompt(uri: Uri) {
    if (!canInstallPackages()) {
      pendingInstallApkUri = uri
      try {
        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
        Toast.makeText(this, R.string.update_install_permission_hint, Toast.LENGTH_LONG).show()
      } catch (e: ActivityNotFoundException) {
        pendingInstallApkUri = null
        Log.w(TAG, "no unknown-app-sources settings activity", e)
        Toast.makeText(this, R.string.update_install_unavailable, Toast.LENGTH_LONG).show()
      }
      return
    }
    launchInstaller(uri)
  }

  private fun launchInstaller(uri: Uri) {
    try {
      startActivity(Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      })
    } catch (e: ActivityNotFoundException) {
      Log.w(TAG, "no package installer activity", e)
      Toast.makeText(this, R.string.update_install_unavailable, Toast.LENGTH_LONG).show()
    }
  }

  // ————————————————————————— 预测性返回(API 33+) —————————————————————————

  /**
   * 按导航状态动态启停系统返回回调:可后退或全屏中 → 注册(本壳接管,
   * 依次退全屏/后退历史);历史根 → 注销,系统接管(finish + 返回桌面动画)。
   */
  private fun updateBackHandler() {
    if (Build.VERSION.SDK_INT < 33) return
    val shouldIntercept = fullscreenView != null ||
      (this::web.isInitialized && web.canGoBack())
    if (shouldIntercept == backInvokerRegistered) return
    if (shouldIntercept) {
      val invoker = backInvoker ?: object : OnBackInvokedCallback {
        override fun onBackInvoked() {
          when {
            fullscreenView != null -> exitFullscreen()
            this@MainActivity::web.isInitialized && web.canGoBack() -> web.goBack()
          }
        }
      }.also { backInvoker = it }
      onBackInvokedDispatcher.registerOnBackInvokedCallback(
        OnBackInvokedDispatcher.PRIORITY_DEFAULT,
        invoker,
      )
      backInvokerRegistered = true
    } else {
      unregisterBackInvoker()
    }
  }

  private fun unregisterBackInvoker() {
    val invoker = backInvoker ?: return
    if (backInvokerRegistered) {
      onBackInvokedDispatcher.unregisterOnBackInvokedCallback(invoker)
      backInvokerRegistered = false
    }
  }

  // ————————————————————————— 全屏自定义视图 —————————————————————————

  /** 全屏视图挂到 window decor 顶层(盖过一切遮罩)并进入沉浸模式。 */
  private fun enterFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
    if (fullscreenView != null) {
      callback.onCustomViewHidden()
      return
    }
    fullscreenView = view
    fullscreenCallback = callback
    (window.decorView as? FrameLayout)?.addView(
      view,
      FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT),
    )
    applyImmersiveMode(true)
    updateBackHandler()
  }

  private fun exitFullscreen() {
    val view = fullscreenView ?: return
    fullscreenView = null
    (view.parent as? FrameLayout)?.removeView(view)
    // 回调属于(可能已崩溃的)WebView:通知隐藏即可,失败不致命。
    fullscreenCallback?.let { runCatching { it.onCustomViewHidden() } }
    fullscreenCallback = null
    applyImmersiveMode(false)
    applySystemBarAppearance()
    updateBackHandler()
  }

  private fun applyImmersiveMode(immersive: Boolean) {
    if (Build.VERSION.SDK_INT >= 30) {
      window.insetsController?.apply {
        if (immersive) {
          systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
          hide(WindowInsets.Type.systemBars())
        } else {
          show(WindowInsets.Type.systemBars())
        }
      }
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = if (immersive) {
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
          View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
          View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
      } else {
        View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
      }
    }
  }

  // ————————————————————————— 系统栏 / 内边距 —————————————————————————

  private fun applySystemBarAppearance() {
    if (Build.VERSION.SDK_INT >= 30) {
      window.insetsController?.setSystemBarsAppearance(
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
      )
    } else {
      // 浅色导航栏由 values-v27 主题属性覆盖;此处只需状态栏(API 26)。
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
    }
  }

  /**
   * Android 15+ 且 targetSdk 35+:系统栏强制 edge-to-edge,这里手动消化
   * systemBars+cutout+ime 内边距;更低版本由系统 decor 消化,不重复加。
   */
  private fun applyWindowInsets() {
    val root = findViewById<View>(R.id.root)
    root.setOnApplyWindowInsetsListener { v, insets ->
      if (Build.VERSION.SDK_INT >= 35) {
        val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
        val ime = insets.getInsets(WindowInsets.Type.ime())
        v.setPadding(bars.left, maxOf(bars.top, ime.top), bars.right, maxOf(bars.bottom, ime.bottom))
      } else {
        v.setPadding(0, 0, 0, 0)
      }
      insets
    }
  }

  // ————————————————————————— 杂项 —————————————————————————

  /** 深链解析:仅 https + 站点主机,其余忽略(交系统默认处理)。 */
  private fun resolveSiteUrl(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_VIEW) return null
    val data = intent.data ?: return null
    if (!data.scheme.equals("https", ignoreCase = true)) return null
    val host = data.host?.lowercase(Locale.ROOT) ?: return null
    if (host !in ShellConfig.SITE_HOSTS) return null
    return data.toString()
  }

  private fun showError(detail: String) {
    exitFullscreen()
    hide(loadingOverlay)
    errorDetail.text = detail
    show(errorOverlay)
  }

  private fun show(view: View) {
    view.visibility = View.VISIBLE
  }

  private fun hide(view: View) {
    view.visibility = View.GONE
  }

  companion object {
    private const val TAG = "ZaochangShell"
    private const val REQUEST_FILE_CHOOSER = 1001
    private const val REQUEST_CAMERA = 1002
    private const val KEY_PENDING_INITIAL_URL = "pendingInitialUrl"
    private const val COMPAT_TIMEOUT_MS = 6_000
    private const val COMPAT_RECHECK_INTERVAL_MS = 5 * 60 * 1000L
    private const val APK_REQUEST_DEDUPE_MS = 5_000L
    private const val DEFAULT_COPY_BUFFER = 64 * 1024
  }
}
