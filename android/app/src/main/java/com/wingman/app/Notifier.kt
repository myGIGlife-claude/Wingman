package com.wingman.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

object Notifier {
    const val ALERTS = "alerts"
    const val UPDATES = "updates"

    fun channels(c: Context) {
        val m = c.getSystemService(NotificationManager::class.java)
        m.createNotificationChannel(NotificationChannel(ALERTS, "Run alerts", NotificationManager.IMPORTANCE_HIGH).apply { enableVibration(true) })
        m.createNotificationChannel(NotificationChannel(UPDATES, "Updates", NotificationManager.IMPORTANCE_LOW))
    }

    fun openIntent(c: Context, url: String?, code: Int, before: Long = 0): PendingIntent {
        val i = Intent(c, OpenActivity::class.java).putExtra("url", url ?: "https://www.torn.com/").putExtra("before", before)
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun alert(c: Context, text: String, url: String?) {
        val b = Notification.Builder(c, ALERTS)
            .setSmallIcon(R.drawable.ic_launcher).setContentTitle("Wingman").setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text)).setAutoCancel(true)
        if (url != null) b.setContentIntent(openIntent(c, url, text.hashCode()))
        if (Model.parse(Prefs.get(c, "model"))?.phase == "abroad") {
            val bought = PendingIntent.getBroadcast(c, 1, Intent(c, ActionReceiver::class.java).setAction(ActionReceiver.ACTION_BOUGHT),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            b.addAction(Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_launcher), "Bought ✓", bought).build())
        }
        if (url != null) b.addAction(Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(c, R.drawable.ic_launcher), "Open", openIntent(c, url, 2)).build())
        c.getSystemService(NotificationManager::class.java).notify(text.hashCode(), b.build())
    }
}
