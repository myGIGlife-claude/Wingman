package com.wingman.app

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.widget.TextView

object Ui {
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
