// 造场安卓壳:远程 WebView(方案 B)。变更纪律见 android/README.md。
// Kotlin 编译走 AGP 9 内置支持(built-in Kotlin),不应用外部 KGP——
// KGP 2.2.x 与 AGP 9 的扩展模型不兼容(内部 cast 旧 BaseExtension)。
plugins {
  id("com.android.application") version "9.2.0" apply false
}
