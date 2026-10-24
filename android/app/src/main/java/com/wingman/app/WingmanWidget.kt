package com.wingman.app

import android.app.AlarmManager
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
            scheduleRender(c)
        }

        private fun broadcast(c: Context, action: String, code: Int) = PendingIntent.getBroadcast(
            c, code, Intent(c, ActionReceiver::class.java).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        // Colors and the Fly lock depend on the clock, so redraw when the next one flips.
        private fun scheduleRender(c: Context) {
            val f = Model.parse(Prefs.get(c, "model"))?.facts ?: return
            val now = System.currentTimeMillis() / 1000
            val marks = listOfNotNull(
                f.optLong("flyOkUntil", 0).takeIf { it > 0 }?.let { listOf(it - 7200, it) }, 
                f.optLong("ocReadyAt", 0).takeIf { it > 0 }?.let { listOf(it - 1800, it, it - 7200) },
            ).flatten().filter { it > now + 1 }
            val next = marks.minOrNull() ?: return
            try {
                c.getSystemService(AlarmManager::class.java).set(AlarmManager.RTC, next * 1000 + 500, broadcast(c, ActionReceiver.ACTION_RENDER, 7))
            } catch (e: Exception) { /* the 15-minute worker still redraws */ }
        }

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

        private fun button(c: Context, label: String, style: String, tap: PendingIntent): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.btn)
            v.setTextViewText(R.id.b, label)
            val (bg, fg) = when (style) {
                "amber" -> R.drawable.btn_amber to "#0E0E0C"
                "stop" -> R.drawable.btn_stop to "#0E0E0C"
                "go" -> R.drawable.btn_go to "#0E0E0C"
                else -> R.drawable.btn_ghost to "#908975"
            }
            v.setInt(R.id.b, "setBackgroundResource", bg)
            v.setTextColor(R.id.b, Color.parseColor(fg))
            v.setOnClickPendingIntent(R.id.b, tap)
            return v
        }

        private fun addButtons(c: Context, v: RemoteViews, list: List<RemoteViews>) {
            v.removeAllViews(R.id.buttons)
            list.chunked(3).forEach { chunk ->
                val row = RemoteViews(c.packageName, R.layout.btnrow)
                chunk.forEach { row.addView(R.id.brow, it) }
                v.addView(R.id.buttons, row)
            }
        }

        fun build(c: Context): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.widget)
            val m = Model.parse(Prefs.get(c, "model"))
            val refresh = button(c, "⟳", "ghost", broadcast(c, ActionReceiver.ACTION_REFRESH, 0))
            v.removeAllViews(R.id.rows)
            if (m == null) {
                v.setTextViewText(R.id.title, "WINGMAN")
                v.addView(R.id.rows, tileView(c, Tile("OPEN THE APP", "—", sub = "add your backend URL", color = DIM), 0))
                addButtons(c, v, listOf(button(c, "SET UP", "amber", PendingIntent.getActivity(c, 9, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)), refresh))
                return v
            }
            val now = System.currentTimeMillis() / 1000
            val f = m.facts
            v.setViewVisibility(R.id.title, if (Prefs.get(c, "show_title") != "0") View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.title, m.title)

            val ids = Tiles.layout(Prefs.get(c, "layout").ifEmpty { Tiles.DEFAULT })
            val tiles = (if (f != null) ids.mapNotNull { Tiles.build(it, f, now) } else emptyList())
                .ifEmpty { listOf(Tile(m.countdownLabel.ifEmpty { m.phase.uppercase() }, timerTo = m.countdownTo, sub = m.sub)) }
            // Full-width tiles get their own row; the rest pair up.
            val rows = mutableListOf<List<Tile>>(); var pending: Tile? = null
            for (t in tiles) {
                if (t.full) { pending?.let { rows.add(listOf(it)); pending = null }; rows.add(listOf(t)) }
                else if (pending == null) pending = t else { rows.add(listOf(pending!!, t)); pending = null }
            }
            pending?.let { rows.add(listOf(it)) }
            rows.forEach { r ->
                val row = RemoteViews(c.packageName, R.layout.row)
                r.forEach { row.addView(R.id.row, tileView(c, it, now)) }
                v.addView(R.id.rows, row)
            }

            // Buttons: at home the quick buttons (Fly locks near the OC); otherwise the current trip action.
            val btns = mutableListOf<RemoteViews>()
            if (m.phase == "home") {
                val on = Prefs.get(c, "buttons").ifEmpty { Tiles.DEFAULT_BUTTONS }.split(',')
                Tiles.BUTTONS.filter { it.id in on }.forEachIndexed { i, b ->
                    val blocked = b.id == "fly" && f != null && Tiles.flyBlocked(f, now)
                    val before = if (b.id == "fly") f?.optLong("flyOkUntil", 0) ?: 0 else 0
                    btns.add(button(c, if (blocked) "${b.label} ✕" else b.label, if (blocked) "ghost" else "amber", Notifier.openIntent(c, b.url, 20 + i, before)))
                }
            } else {
                val style = if (m.style == "ghost") "ghost" else m.style
                btns.add(button(c, m.label, style, if (m.url != null) Notifier.openIntent(c, m.url, 3) else broadcast(c, ActionReceiver.ACTION_REFRESH, 0)))
                if (m.showBought) btns.add(button(c, "BOUGHT ✓", "go", broadcast(c, ActionReceiver.ACTION_BOUGHT, 1)))
            }
            btns.add(refresh)
            addButtons(c, v, btns)
            return v
        }
    }
}
