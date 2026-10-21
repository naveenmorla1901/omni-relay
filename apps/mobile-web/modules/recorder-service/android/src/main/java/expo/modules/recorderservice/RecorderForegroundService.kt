package expo.modules.recorderservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log

/**
 * Camera-type foreground service for the Recorder. Android revokes camera
 * access from apps without one as soon as the screen turns off; while this
 * runs, react-native-webrtc keeps capturing and encoding. It also holds a
 * partial wake lock (CPU stays on) and a high-performance Wi-Fi lock
 * (no Wi-Fi power save) so the stream does not stall with the screen off.
 */
class RecorderForegroundService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "ClearRelay Recorder"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Camera is streaming to Admin"
    try {
      val notification = buildNotification(title, text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (error: Exception) {
      Log.w(TAG, "Could not enter the foreground", error)
      running = false
      stopSelf()
      return START_NOT_STICKY
    }
    acquireLocks()
    running = true
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    releaseLocks()
    super.onDestroy()
  }

  /** The user swiped the app away: stop streaming instead of lingering. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun buildNotification(title: String, text: String): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Recorder streaming", NotificationManager.IMPORTANCE_LOW)
      channel.description = "Shown while the Recorder camera streams with the screen off."
      manager.createNotificationChannel(channel)
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launch?.let {
      it.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    builder
      .setContentTitle(title)
      .setContentText(text)
      .setSmallIcon(android.R.drawable.presence_video_online)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_SERVICE)
    if (contentIntent != null) builder.setContentIntent(contentIntent)
    return builder.build()
  }

  private fun acquireLocks() {
    if (wakeLock == null) {
      val power = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ClearRelay:recorder").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
    if (wifiLock == null) {
      val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      @Suppress("DEPRECATION")
      wifiLock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "ClearRelay:recorder").apply {
        setReferenceCounted(false)
        acquire()
      }
    }
  }

  private fun releaseLocks() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wifiLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
    wifiLock = null
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    private const val TAG = "RecorderService"
    private const val CHANNEL_ID = "clearrelay-recorder"
    private const val NOTIFICATION_ID = 1901

    @Volatile
    var running = false
  }
}
