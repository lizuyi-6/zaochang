package top.aetherstudio.zaochang

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Environment
import android.util.Log
import android.widget.Toast
import java.io.File

/**
 * 应用内更新的安装结果回调:系统在安装完成/失败后广播 PACKAGE_ADDED 风格的
 * 结果 Intent 过来(壳用 PackageInstaller 会话提交时传的 IntentSender)。
 * 职责只有两件:把结果写进日志、删掉私有目录里的安装包。
 */
class InstallResultReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
    Log.i(TAG, "install result status=$status message=$message")
    if (status == PackageInstaller.STATUS_FAILURE) {
      Toast.makeText(context, R.string.update_install_failed, Toast.LENGTH_LONG).show()
    }
    // 装完(或装失败)都不留安装包在磁盘上。
    val base = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
    File(File(base, "update"), "zaochang-update.apk").delete()
  }

  private companion object {
    private const val TAG = "ZaochangShell"
  }
}
