package expo.modules.recorderservice

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RecorderServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecorderService")

    /**
     * Start the camera foreground service. Must be called while the app is
     * visible and after camera permission is granted (Android 14 rules).
     * Returns false when Android refuses it.
     */
    Function("start") { title: String, text: String ->
      val context = appContext.reactContext ?: return@Function false
      if (context.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
        return@Function false
      }
      val intent = Intent(context, RecorderForegroundService::class.java)
        .putExtra(RecorderForegroundService.EXTRA_TITLE, title)
        .putExtra(RecorderForegroundService.EXTRA_TEXT, text)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (error: Exception) {
        Log.w("RecorderService", "Could not start the foreground service", error)
        false
      }
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function Unit
      context.stopService(Intent(context, RecorderForegroundService::class.java))
      Unit
    }

    Function("isRunning") {
      RecorderForegroundService.running
    }
  }
}
