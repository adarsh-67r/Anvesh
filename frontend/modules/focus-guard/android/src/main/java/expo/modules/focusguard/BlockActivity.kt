package expo.modules.focusguard

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Full-screen "Back to focus" page shown over a blocked app. */
class BlockActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val pkg = intent.getStringExtra(EXTRA_PACKAGE)
    val appName = pkg?.let {
      runCatching { packageManager.getApplicationLabel(packageManager.getApplicationInfo(it, 0)).toString() }.getOrNull()
    } ?: "This app"

    fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()
    fun label(value: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
      text = value
      textSize = size
      setTextColor(color)
      gravity = Gravity.CENTER
      if (bold) setTypeface(typeface, Typeface.BOLD)
      setPadding(0, 0, 0, dp(12))
    }

    val button = Button(this).apply {
      text = "Return to Anvesh"
      isAllCaps = false
      textSize = 16f
      setTextColor(Color.parseColor("#4F46E5"))
      background = GradientDrawable().apply { setColor(Color.WHITE); cornerRadius = dp(28).toFloat() }
      setPadding(dp(28), dp(14), dp(28), dp(14))
      setOnClickListener { returnToApp() }
    }

    setContentView(LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#4F46E5"))
      setPadding(dp(32), dp(32), dp(32), dp(32))
      addView(label("Back to focus", 30f, Color.WHITE, bold = true))
      addView(label("$appName is paused until your focus session ends.", 16f, Color.parseColor("#E0E7FF")))
      addView(label("You can end the session early from Anvesh.", 14f, Color.parseColor("#C7D2FE")))
      addView(button, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(16) })
    })
  }

  private fun returnToApp() {
    packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    finish()
  }

  @Deprecated("Back returns to studying rather than to the blocked app")
  override fun onBackPressed() = returnToApp()

  companion object {
    const val EXTRA_PACKAGE = "package"
  }
}
