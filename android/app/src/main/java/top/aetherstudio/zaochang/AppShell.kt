package top.aetherstudio.zaochang

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/** 壳配置:应用唯一可信源。与站点 app/api/app-shell/route.ts 的契约一一对应。 */
object ShellConfig {
  /** 唯一可信生产源(HTTPS)。 */
  const val BASE_URL = "https://aetherstudio.top/"

  /**
   * 允许在应用内 WebView 完成「顶级导航」的主机:
   * 站点本体 + OAuth 提供方登录闭环(GitHub / Google)。
   * 其余一切 http(s) 链接(如站内产品的外部主页)交系统浏览器——
   * 非受信页面不得进入特权 WebView。
   */
  val INTERNAL_HOSTS: Set<String> = setOf(
    "aetherstudio.top",
    "www.aetherstudio.top",
    "github.com",
    "accounts.google.com",
  )

  /** 深链(App Links)只接受站点本体,且仅 https。 */
  val SITE_HOSTS: Set<String> = setOf("aetherstudio.top", "www.aetherstudio.top")
}

/** /api/app-shell 兼容性清单。 */
data class ShellManifest(
  val webBuildId: String,
  val minShellVersionCode: Int,
  val maxShellVersionCode: Int?,
  /** android.* 更新信息:版本横幅/升级页「下载新版」用;缺失或形态不对为 null。 */
  val androidUpdate: AndroidUpdateInfo?,
)

data class AndroidUpdateInfo(
  val latestVersionCode: Int,
  val latestVersionName: String,
  val downloadUrl: String?,
)

object AppShell {
  private const val MAX_MANIFEST_BYTES = 64 * 1024

  /**
   * 拉取清单(cache-busting);任何失败(网络/状态码/解析)返回 null,
   * 由调用方按「清单不可达 ≠ 不兼容」策略处理——不可达时继续正常加载站点,
   * 站点自身加载失败由错误重试页兜底。仅经 HTTPS 连接唯一可信源。
   */
  fun fetch(baseUrl: String, timeoutMs: Int): ShellManifest? {
    return try {
      val url = URL("${baseUrl}api/app-shell?t=${System.currentTimeMillis()}")
      val connection = url.openConnection() as HttpURLConnection
      connection.connectTimeout = timeoutMs
      connection.readTimeout = timeoutMs
      connection.useCaches = false
      // 唯一可信源不允许 30x 把清单请求带到其它主机(instanceFollowRedirects=true
      // 意味着"任何能被 aetherstudio.top 重定向到的 HTTPS 主机"都能出清单)。
      connection.instanceFollowRedirects = false
      connection.setRequestProperty("accept", "application/json")
      try {
        if (connection.responseCode != HttpURLConnection.HTTP_OK) return null
        val manifest = JSONObject(readBounded(connection))
        val web = manifest.optJSONObject("web") ?: return null
        val buildId = web.optString("buildId")
        if (buildId.isBlank()) return null
        // minShellVersionCode 是 fail-closed 闸门的输入:缺失/非数值时宁可判"清单不可用"
        // 交由调用方的不可达策略,也不能默认 1 把闸门打开(optInt 的默认值语义反了)。
        val minCode = web.takeIf { it.has("minShellVersionCode") }
          ?.takeIf { it.get("minShellVersionCode") is Int }
          ?.getInt("minShellVersionCode")
          ?: return null
        ShellManifest(
          webBuildId = buildId,
          minShellVersionCode = minCode,
          maxShellVersionCode = if (web.isNull("maxShellVersionCode")) null else web.optInt("maxShellVersionCode"),
          androidUpdate = parseAndroidUpdate(manifest.optJSONObject("android")),
        )
      } finally {
        connection.disconnect()
      }
    } catch (_: Exception) {
      null
    }
  }

  /**
   * android.* 更新信息解析:latestVersionCode 必须是真 Int(不用 optInt 的默认值
   * 语义),latestVersionName 非空;downloadUrl 必须是 https + 站点主机(下载器
   * 只打白名单主机,但在解析层就拒掉,不给恶意清单值触达网络层的机会)。
   * 任何形态不对 → 整体 null(横幅不显示,兼容性门禁不受影响)。
   */
  private fun parseAndroidUpdate(android: JSONObject?): AndroidUpdateInfo? {
    android ?: return null
    val code = android.takeIf { it.has("latestVersionCode") }
      ?.takeIf { it.get("latestVersionCode") is Int }
      ?.getInt("latestVersionCode")
      ?: return null
    val name = android.optString("latestVersionName")
    if (name.isBlank()) return null
    var downloadUrl: String? = null
    val rawUrl = android.optString("downloadUrl")
    if (rawUrl.isNotBlank()) {
      val url = runCatching { URL(rawUrl) }.getOrNull()
      if (url != null && url.protocol == "https" && url.host?.lowercase(Locale.ROOT) in ShellConfig.SITE_HOSTS) {
        downloadUrl = rawUrl
      }
    }
    return AndroidUpdateInfo(latestVersionCode = code, latestVersionName = name, downloadUrl = downloadUrl)
  }

  /** 有界读取;超过上限视为清单异常(截断的 JSON 会解析失败,同样 fail-closed)。 */
  private fun readBounded(connection: HttpURLConnection): String {
    connection.inputStream.use { stream ->
      val buffer = ByteArray(MAX_MANIFEST_BYTES)
      var read = 0
      while (read < buffer.size) {
        val n = stream.read(buffer, read, buffer.size - read)
        if (n < 0) break
        read += n
      }
      if (read == buffer.size && stream.read() != -1) {
        throw IOException("manifest exceeds ${MAX_MANIFEST_BYTES} bytes")
      }
      return String(buffer, 0, read, Charsets.UTF_8)
    }
  }
}
