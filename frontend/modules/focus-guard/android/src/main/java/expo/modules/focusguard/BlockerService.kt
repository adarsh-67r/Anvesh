package expo.modules.focusguard

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent

/** Watches which app comes to the front; during focus, a blocked app is covered by BlockActivity. */
class BlockerService : AccessibilityService() {
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    val pkg = event.packageName?.toString() ?: return
    if (pkg == packageName || !FocusState.isBlocking(this) || pkg !in FocusState.blockedApps(this)) return
    startActivity(
      Intent(this, BlockActivity::class.java)
        .putExtra(BlockActivity.EXTRA_PACKAGE, pkg)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    )
  }

  override fun onInterrupt() {}
}
