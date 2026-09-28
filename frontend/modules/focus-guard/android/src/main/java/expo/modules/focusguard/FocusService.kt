package expo.modules.focusguard

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/** Foreground service: keeps a live countdown/count-up in the notification shade and ends the session on time. */
class FocusService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val finish = Runnable { complete() }
  private var lastBlocked = 0L
  private val watch = object : Runnable {
    override fun run() {
      if (!FocusState.isBlocking(this@FocusService)) return
      coverBlockedApp()
      handler.postDelayed(this, WATCH_MS)
    }
  }
  private var title = "Focus"

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_PAUSE -> FocusGuardModule.emit("pause")
      ACTION_RESUME -> FocusGuardModule.emit("resume")
      ACTION_STOP -> {
        FocusState.setBlockUntil(this, 0)
        FocusGuardModule.emit("stop")
        shutDown()
      }
      else -> start(intent)
    }
    return START_NOT_STICKY
  }

  private fun start(intent: Intent?) {
    intent ?: return
    title = intent.getStringExtra(EXTRA_TITLE) ?: "Focus"
    val text = intent.getStringExtra(EXTRA_TEXT) ?: ""
    val endAt = intent.getLongExtra(EXTRA_END_AT, 0L)
    val startedAt = intent.getLongExtra(EXTRA_STARTED_AT, System.currentTimeMillis())
    val paused = intent.getBooleanExtra(EXTRA_PAUSED, false)
    ensureChannels(this)

    val builder = NotificationCompat.Builder(this, CHANNEL_TIMER)
      .setSmallIcon(R.drawable.ic_focus)
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setContentIntent(openApp())
    if (paused) {
      builder.setShowWhen(false)
      builder.addAction(0, "Resume", action(ACTION_RESUME))
    } else {
      builder.setShowWhen(true).setUsesChronometer(true)
      if (endAt > 0) builder.setWhen(endAt).setChronometerCountDown(true) else builder.setWhen(startedAt)
      builder.addAction(0, "Pause", action(ACTION_PAUSE))
    }
    builder.addAction(0, "Stop", action(ACTION_STOP))

    val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, builder.build(), type)

    handler.removeCallbacks(finish)
    if (!paused && endAt > 0) handler.postDelayed(finish, (endAt - System.currentTimeMillis()).coerceAtLeast(0))
    handler.removeCallbacks(watch)
    if (FocusState.isBlocking(this) && FocusState.hasUsageAccess(this)) handler.post(watch)
  }

  /** Blocked app in front during focus: cover it with the "Back to focus" screen. */
  private fun coverBlockedApp() {
    val (pkg, at) = runCatching { FocusState.lastForeground(this, System.currentTimeMillis() - 10_000) }.getOrNull() ?: return
    if (at <= lastBlocked || pkg == packageName || pkg !in FocusState.blockedApps(this)) return
    lastBlocked = at
    runCatching {
      startActivity(
        Intent(this, BlockActivity::class.java)
          .putExtra(BlockActivity.EXTRA_PACKAGE, pkg)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      )
    }
  }

  private fun complete() {
    FocusState.setBlockUntil(this, 0)
    val done = NotificationCompat.Builder(this, CHANNEL_DONE)
      .setSmallIcon(R.drawable.ic_focus)
      .setContentTitle("$title complete")
      .setContentText("Open Anvesh to continue")
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setContentIntent(openApp())
      .build()
    getSystemService(NotificationManager::class.java).notify(DONE_ID, done)
    FocusGuardModule.emit("done")
    shutDown()
  }

  private fun shutDown() {
    handler.removeCallbacks(finish)
    handler.removeCallbacks(watch)
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(finish)
    handler.removeCallbacks(watch)
    super.onDestroy()
  }

  private fun action(name: String): PendingIntent =
    PendingIntent.getService(this, name.hashCode(), Intent(this, FocusService::class.java).setAction(name),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  private fun openApp(): PendingIntent? =
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

  companion object {
    const val ACTION_PAUSE = "expo.modules.focusguard.PAUSE"
    const val ACTION_RESUME = "expo.modules.focusguard.RESUME"
    const val ACTION_STOP = "expo.modules.focusguard.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_END_AT = "endAt"
    const val EXTRA_STARTED_AT = "startedAt"
    const val EXTRA_PAUSED = "paused"
    private const val CHANNEL_TIMER = "focus_timer"
    private const val CHANNEL_DONE = "focus_done"
    private const val NOTIFICATION_ID = 4101
    private const val DONE_ID = 4102
    private const val WATCH_MS = 700L

    fun ensureChannels(context: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = context.getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(CHANNEL_TIMER, "Focus timer", NotificationManager.IMPORTANCE_LOW))
      nm.createNotificationChannel(NotificationChannel(CHANNEL_DONE, "Focus finished", NotificationManager.IMPORTANCE_HIGH))
    }
  }
}
