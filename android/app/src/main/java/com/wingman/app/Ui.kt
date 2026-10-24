package com.wingman.app

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.TextView

object Ui {
    // Newer Android draws apps edge to edge. Pad a screen's root so nothing sits under the status bar, nav bar or camera cutout.
    fun fitSystemBars(v: View) {
        v.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                view.setPadding(b.left, b.top, b.right, b.bottom)
            } else @Suppress("DEPRECATION") view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        v.requestApplyInsets()
    }

    private val INK = Color.parseColor("#0E0E0C")

    // A clear ON / OFF pill: filled amber when on, dim outline when off.
    class Pill(c: Context, on: Boolean, private val onTap: (Boolean) -> Unit) : TextView(c) {
        var on = on
            private set
        init {
            val d = c.resources.displayMetrics.density
            gravity = Gravity.CENTER; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); textSize = 13f; letterSpacing = 0.08f
            minWidth = (60 * d).toInt(); minHeight = (34 * d).toInt(); setPadding((12 * d).toInt(), 0, (12 * d).toInt(), 0)
            paint(); setOnClickListener { set(!this.on); onTap(this.on) }
        }
        fun set(v: Boolean) { on = v; paint() }
        private fun paint() { text = if (on) "ON" else "OFF"; setTextColor(if (on) INK else Color.parseColor("#B0A88F")); setBackgroundResource(if (on) R.drawable.pill_on else R.drawable.pill_off) }
    }

    fun pill(c: Context, on: Boolean, onTap: (Boolean) -> Unit) = Pill(c, on, onTap)
}
