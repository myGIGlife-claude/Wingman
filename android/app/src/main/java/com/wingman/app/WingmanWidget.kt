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

        fun build(c: Context): RemoteViews {
            val v = RemoteViews(c.packageName, R.layout.widget)
            val m = Model.parse(Prefs.get(c, "model"))
            v.setOnClickPendingIntent(R.id.refresh, broadcast(c, ActionReceiver.ACTION_REFRESH, 0))
            if (m == null) {
                v.setTextViewText(R.id.title, "WINGMAN")
                v.setTextViewText(R.id.sub, "Open the app and add your backend URL")
                v.setViewVisibility(R.id.countdown, View.GONE)
                v.setViewVisibility(R.id.bought, View.GONE)
                v.setTextViewText(R.id.primary, "SET UP")
                v.setOnClickPendingIntent(R.id.primary, PendingIntent.getActivity(
                    c, 9, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE))
                return v
            }
            v.setTextViewText(R.id.title, m.title)
            v.setTextViewText(R.id.sub, m.sub)
            val to = m.countdownTo
            if (to != null) {
                val left = to - System.currentTimeMillis() / 1000
                v.setViewVisibility(R.id.countdown, View.VISIBLE)
                v.setChronometerCountDown(R.id.countdown, true)
                v.setChronometer(R.id.countdown, SystemClock.elapsedRealtime() + left * 1000, null, left > 0)
            } else v.setViewVisibility(R.id.countdown, View.GONE)

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
