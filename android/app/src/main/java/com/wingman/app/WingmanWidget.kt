package com.wingman.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews

class WingmanWidget : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) {
        ids.forEach { m.updateAppWidget(it, build(c)) }
        Thread { Api.refresh(c) }.start()
    }

    companion object {
        fun updateAll(c: Context) {
            val m = AppWidgetManager.getInstance(c)
            val ids = m.getAppWidgetIds(ComponentName(c, WingmanWidget::class.java))
            ids.forEach { m.updateAppWidget(it, build(c)) }
        }

        private fun broadcast(c: Context, action: String, code: Int) = PendingIntent.getBroadcast(
            c, code, Intent(c, ActionReceiver::class.java).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        private fun tileView(c: Context, t: Tile, now: Long): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.tile)
            v.setTextViewText(R.id.t_label, t.label)
            v.setTextViewText(R.id.t_sub, t.sub)
            v.setTextColor(R.id.t_text, t.color); v.setTextColor(R.id.t_timer, t.color)
            val left = if (t.timerTo != null) t.timerTo - now else 0
            if (t.timerTo != null && left > 0) {
                v.setViewVisibility(R.id.t_text, View.GONE); v.setViewVisibility(R.id.t_timer, View.VISIBLE)
                v.setChronometerCountDown(R.id.t_timer, true)
                v.setChronometer(R.id.t_timer, SystemClock.elapsedRealtime() + left * 1000, null, true)
            } else {
                v.setViewVisibility(R.id.t_timer, View.GONE); v.setViewVisibility(R.id.t_text, View.VISIBLE)
                v.setTextViewText(R.id.t_text, if (t.timerTo != null) "NOW" else t.text)
            }
            return v
        }

        fun build(c: Context): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.widget)
            val m = Model.parse(Prefs.get(c, "model"))
            v.setOnClickPendingIntent(R.id.refresh, broadcast(c, ActionReceiver.ACTION_REFRESH, 0))
            v.removeAllViews(R.id.rows)
            if (m == null) {
                v.setTextViewText(R.id.title, "WINGMAN")
                v.setViewVisibility(R.id.bought, View.GONE)
                v.setTextViewText(R.id.primary, "SET UP")
                v.setOnClickPendingIntent(R.id.primary, PendingIntent.getActivity(
                    c, 9, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE))
                v.addView(R.id.rows, tileView(c, Tile("OPEN THE APP", "—", sub = "add your backend URL", color = DIM), 0))
                return v
            }
            val now = System.currentTimeMillis() / 1000
            val showTitle = Prefs.get(c, "show_title") != "0"
            v.setViewVisibility(R.id.title, if (showTitle) View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.title, m.title)
            val ids = Tiles.layout(Prefs.get(c, "layout").ifEmpty { Tiles.DEFAULT })
            val tiles = (if (m.facts != null) ids.mapNotNull { Tiles.build(it, m.facts, now) } else emptyList())
                .ifEmpty { listOf(Tile(m.countdownLabel.ifEmpty { m.phase.uppercase() }, timerTo = m.countdownTo, sub = m.sub)) }
            tiles.chunked(2).forEach { pair ->
                val row = RemoteViews(c.packageName, R.layout.row)
                pair.forEach { row.addView(R.id.row, tileView(c, it, now)) }
                v.addView(R.id.rows, row)
            }

            val showActions = Prefs.get(c, "show_actions") != "0"
            v.setViewVisibility(R.id.actions, if (showActions) View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.primary, m.label)
            val (bg, fg) = when (m.style) {
                "amber" -> R.drawable.btn_amber to "#0E0E0C"
                "stop" -> R.drawable.btn_stop to "#0E0E0C"
                else -> R.drawable.btn_ghost to "#908975"
            }
            v.setInt(R.id.primary, "setBackgroundResource", bg)
            v.setTextColor(R.id.primary, Color.parseColor(fg))
            if (m.url != null) v.setOnClickPendingIntent(R.id.primary, Notifier.openIntent(c, m.url, 3))
            else v.setOnClickPendingIntent(R.id.primary, broadcast(c, ActionReceiver.ACTION_REFRESH, 0))
            v.setViewVisibility(R.id.bought, if (m.showBought) View.VISIBLE else View.GONE)
            v.setOnClickPendingIntent(R.id.bought, broadcast(c, ActionReceiver.ACTION_BOUGHT, 1))
            return v
        }
    }
}
