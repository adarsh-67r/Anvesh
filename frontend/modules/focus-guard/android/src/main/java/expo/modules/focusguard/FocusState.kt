package expo.modules.focusguard

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import android.provider.Settings

/** Session state shared by the timer service and the blocker; survives the JS runtime being paused. */
object FocusState {
  private const val PREFS = "anvesh_focus_guard"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun blockedApps(context: Context): Set<String> = prefs(context).getStringSet("apps", emptySet()) ?: emptySet()

  fun setBlockedApps(context: Context, apps: List<String>) {
    prefs(context).edit().putStringSet("apps", apps.toSet()).apply()
  }

  /** Blocking is on until this wall-clock time (ms); Long.MAX_VALUE for a stopwatch, 0 when off. */
  fun blockUntil(context: Context): Long = prefs(context).getLong("until", 0L)

  fun setBlockUntil(context: Context, until: Long) {
    prefs(context).edit().putLong("until", until).apply()
  }

  fun isBlocking(context: Context): Boolean = System.currentTimeMillis() < blockUntil(context)

  fun hasUsageAccess(context: Context): Boolean {
    val ops = context.getSystemService(AppOpsManager::class.java)
    val mode = if (Build.VERSION.SDK_INT >= 29) {
      ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  fun canOverlay(context: Context): Boolean = Settings.canDrawOverlays(context)

  /** Package of the most recent app to come to the front since `since` (ms), with its time. */
  @Suppress("DEPRECATION")
  fun lastForeground(context: Context, since: Long): Pair<String, Long>? {
    val events = context.getSystemService(UsageStatsManager::class.java).queryEvents(since, System.currentTimeMillis())
    val e = UsageEvents.Event()
    var last: Pair<String, Long>? = null
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      if (e.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) last = e.packageName to e.timeStamp
    }
    return last
  }
}
