package top.aetherstudio.zaochang

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

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
      connection.instanceFollowRedirects = true
      connection.setRequestProperty("accept", "application/json")
      try {
        if (connection.responseCode != HttpURLConnection.HTTP_OK) return null
        val web = JSONObject(readBounded(connection)).optJSONObject("web") ?: return null
        val buildId = web.optString("buildId")
        if (buildId.isBlank()) return null
        ShellManifest(
          webBuildId = buildId,
          minShellVersionCode = web.optInt("minShellVersionCode", 1),
          maxShellVersionCode = if (web.isNull("maxShellVersionCode")) null else web.optInt("maxShellVersionCode"),
        )
      } finally {
        connection.disconnect()
      }
    } catch (_: Exception) {
      null
    }
  }

  /** 有界读取,拒绝异常巨大的响应体。 */
  private fun readBounded(connection: HttpURLConnection): String {
    connection.inputStream.use { stream ->
      val buffer = ByteArray(MAX_MANIFEST_BYTES)
      var read = 0
      while (read < buffer.size) {
        val n = stream.read(buffer, read, buffer.size - read)
        if (n < 0) break
        read += n
      }
      return String(buffer, 0, read, Charsets.UTF_8)
    }
  }
}
