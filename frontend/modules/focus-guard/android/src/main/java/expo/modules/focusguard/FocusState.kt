package expo.modules.focusguard

import android.content.Context

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
}
