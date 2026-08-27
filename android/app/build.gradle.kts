import java.util.Properties

plugins {
  id("com.android.application")
}

// 发布签名:存在 android/keystore.properties 时启用(格式见 README);
// 不存在则 release 产出未签名 APK(assembleDebug 用调试签名,可直接安装)。
val keystoreProperties = Properties().apply {
  val file = rootProject.file("keystore.properties")
  if (file.exists()) file.inputStream().use { load(it) }
}

android {
  namespace = "top.aetherstudio.zaochang"
  compileSdk = 36

  defaultConfig {
    applicationId = "top.aetherstudio.zaochang"
    minSdk = 26
    targetSdk = 36
    versionCode = 2
    versionName = "1.0.1"
  }

  // Kotlin(built-in)的 jvmTarget 跟随 Java 目标。
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      val storeFilePath = keystoreProperties.getProperty("storeFile")
      if (storeFilePath != null) {
        signingConfig = signingConfigs.create("release") {
          storeFile = rootProject.file(storeFilePath)
          storePassword = keystoreProperties.getProperty("storePassword")
          keyAlias = keystoreProperties.getProperty("keyAlias")
          keyPassword = keystoreProperties.getProperty("keyPassword")
        }
      }
    }
  }
}
