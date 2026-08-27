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
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
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
  private var hasLoadedContent = false
  private var upgradeVerdictSeen = false
  private var lastStartedUrl: String? = null
  private var pendingInitialUrl: String = ShellConfig.BASE_URL
  private var lastCompatCheckAt = 0L

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

    applySystemBarAppearance()
    rebuildWebView()
    applyWindowInsets()
    resolveSiteUrl(intent)?.let { pendingInitialUrl = it }
    checkShellCompatibility(initial = true)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    resolveSiteUrl(intent)?.let { url ->
      if (web.url == null) pendingInitialUrl = url else web.loadUrl(url)
    }
  }

  override fun onResume() {
    super.onResume()
    web.onResume()
    web.resumeTimers()
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

  /** 返回键/返回手势:优先在 WebView 历史中后退,历史为空才退出应用。 */
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    if (web.canGoBack()) web.goBack() else super.onBackPressed()
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
            if (recentApkRequests.size > 32) recentApkRequests.clear()
            shouldEnqueue = true
          }
        }
        if (shouldEnqueue) {
          runOnUiThread { startFileDownload(key, null, null) }
        }
      }
      return null
    }

    /** 顶级导航按主机白名单分流;iframe/子资源直接放行(Turnstile 等第三方嵌入必需)。 */
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      Log.i(TAG, "sOUL main=${request.isForMainFrame} url=${request.url}")
      if (!request.isForMainFrame) return false
      return navigateInternal(request.url)
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      lastStartedUrl = url
      hide(errorOverlay)
    }

    override fun onPageFinished(view: WebView, url: String) {
      hasLoadedContent = true
      hide(loadingOverlay)
    }

    /** 仅主文档失败才进错误页;子资源失败由页面自身呈现。 */
    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
      if (!request.isForMainFrame) return
      hasLoadedContent = false
      showError(error.description?.toString().orEmpty().ifEmpty { getString(R.string.error_detail_default) })
    }

    /** 安全不变量:证书错误一律取消,绝不 proceed。 */
    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
      handler.cancel()
      showError(getString(R.string.error_ssl))
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
      Log.w(TAG, "webview render process gone (crashed=${detail.didCrash()}); rebuilding")
      hasLoadedContent = false
      runOnUiThread {
        rebuildWebView()
        show(loadingOverlay)
        web.loadUrl(lastStartedUrl ?: pendingInitialUrl)
      }
      return true
    }
  }

  private inner class ShellChromeClient : WebChromeClient() {

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

  /**
   * 自研下载器(MediaStore 写公共 Downloads),取代 DownloadManager:
   * 本项目验证用的 API 35 WebView 124 模拟器上,DM 服务端会静默丢弃任务
   * (enqueue 正常返回、服务端零记录),自研路径在任何 ROM 上确定工作。
   * API <29 无 MediaStore.Downloads,回退系统浏览器下载。
   */
  private fun startFileDownload(url: String, mimeType: String?, contentDisposition: String?) {
    if (Build.VERSION.SDK_INT < 29) {
      openExternal(Uri.parse(url))
      return
    }
    val activity = this
    Thread {
      val fileName = resolveDownloadFileName(url, contentDisposition, mimeType)
      try {
        val values = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, mimeType ?: guessMimeType(fileName))
          put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val resolver = contentResolver
        val target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
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
        runOnUiThread { Toast.makeText(activity, R.string.download_done, Toast.LENGTH_SHORT).show() }
      } catch (e: Exception) {
        Log.w(TAG, "file download failed: $url", e)
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
      runOnUiThread { applyCompatibilityVerdict(manifest, initial) }
    }.start()
  }

  private fun applyCompatibilityVerdict(manifest: ShellManifest?, initial: Boolean) {
    val code = versionCode()
    when {
      manifest == null -> {
        // 清单不可达 = 网络问题:首次启动照常加载站点。
        // 但若此前已明确判定不兼容,维持升级页(fail-closed,不用"网络失败"洗掉升级判定)。
        if (upgradeVerdictSeen) {
          show(upgradeOverlay)
        } else if (initial) {
          loadInitialUrl()
        }
      }
      manifest.minShellVersionCode > code ||
        (manifest.maxShellVersionCode != null && manifest.maxShellVersionCode < code) -> {
        upgradeVerdictSeen = true
        show(upgradeOverlay)
      }
      else -> {
        upgradeVerdictSeen = false
        hide(upgradeOverlay)
        if (initial) loadInitialUrl()
      }
    }
  }

  private fun loadInitialUrl() {
    if (web.url == null) {
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
    private const val COMPAT_TIMEOUT_MS = 6_000
    private const val COMPAT_RECHECK_INTERVAL_MS = 5 * 60 * 1000L
    private const val APK_REQUEST_DEDUPE_MS = 5_000L
    private const val DEFAULT_COPY_BUFFER = 64 * 1024
  }
}
