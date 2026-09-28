package expo.modules.focusguard

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
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

    Function("isBlockerEnabled") { FocusState.hasUsageAccess(context) && FocusState.canOverlay(context) }

    // Opens whichever of the two Android permissions is still missing.
    Function("openBlockerSettings") {
      val uri = Uri.parse("package:${context.packageName}")
      val action = when {
        !FocusState.hasUsageAccess(context) -> Settings.ACTION_USAGE_ACCESS_SETTINGS
        !FocusState.canOverlay(context) -> Settings.ACTION_MANAGE_OVERLAY_PERMISSION
        else -> null
      }
      if (action != null) {
        runCatching { context.startActivity(Intent(action, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }.onFailure {
          // Some phones reject the package-specific screen; fall back to the general list.
          context.startActivity(Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
      }
    }

    Function("blockerSetupStep") {
      when {
        !FocusState.hasUsageAccess(context) -> "usage"
        !FocusState.canOverlay(context) -> "overlay"
        else -> "ready"
      }
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
