package expo.modules.focusguard

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FocusGuardModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("FocusGuard")
    Events("onAction")

    OnCreate { instance = this@FocusGuardModule }
    OnDestroy { if (instance === this@FocusGuardModule) instance = null }

    // endAt 0 = count up from startedAt (stopwatch). blockUntil 0 = no blocking.
    Function("startSession") { title: String, text: String, endAt: Double, startedAt: Double, paused: Boolean, blockUntil: Double ->
      FocusState.setBlockUntil(context, blockUntil.toLong())
      val intent = Intent(context, FocusService::class.java)
        .putExtra(FocusService.EXTRA_TITLE, title)
        .putExtra(FocusService.EXTRA_TEXT, text)
        .putExtra(FocusService.EXTRA_END_AT, endAt.toLong())
        .putExtra(FocusService.EXTRA_STARTED_AT, startedAt.toLong())
        .putExtra(FocusService.EXTRA_PAUSED, paused)
      ContextCompat.startForegroundService(context, intent)
    }

    Function("stopSession") {
      FocusState.setBlockUntil(context, 0)
      context.stopService(Intent(context, FocusService::class.java))
    }

    Function("setBlockedApps") { apps: List<String> -> FocusState.setBlockedApps(context, apps) }
    Function("getBlockedApps") { FocusState.blockedApps(context).toList() }

    AsyncFunction("listApps") {
      val pm = context.packageManager
      val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(launcher, 0)
        .map { it.activityInfo.packageName to it.loadLabel(pm).toString() }
        .filter { it.first != context.packageName }
        .distinctBy { it.first }
        .sortedBy { it.second.lowercase() }
        .map { mapOf("package" to it.first, "label" to it.second) }
    }

    Function("isBlockerEnabled") {
      val me = ComponentName(context, BlockerService::class.java).flattenToString()
      val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
      enabled.split(':').any { it.equals(me, ignoreCase = true) }
    }

    Function("openBlockerSettings") {
      context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("hasNotificationPermission") {
      Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    Function("requestNotificationPermission") {
      val activity = appContext.currentActivity
      if (Build.VERSION.SDK_INT >= 33 && activity != null) {
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4103)
      }
    }
  }

  companion object {
    @Volatile private var instance: FocusGuardModule? = null

    fun emit(action: String) {
      instance?.sendEvent("onAction", mapOf("action" to action))
    }
  }
}
