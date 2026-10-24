package com.wingman.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Widget/notification buttons that talk to our backend: BOUGHT and refresh.
class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        if (i.action == ACTION_RENDER) { WingmanWidget.updateAll(c); return }
        val pending = goAsync()
        val ui = android.os.Handler(android.os.Looper.getMainLooper())
        val say = { t: String -> ui.post { android.widget.Toast.makeText(c, t, android.widget.Toast.LENGTH_SHORT).show() } }
        say(if (i.action == ACTION_BOUGHT) "Marking bought…" else "Refreshing…")
        Thread {
            try {
                if (i.action == ACTION_BOUGHT) Api.call(c, "POST", "/bought")
                say(if (Api.refresh(c, fresh = true)) "Updated" else "Could not reach Wingman")
            } finally { pending.finish() }
        }.start()
    }

    companion object {
        const val ACTION_BOUGHT = "com.wingman.app.BOUGHT"
        const val ACTION_REFRESH = "com.wingman.app.REFRESH"
        const val ACTION_RENDER = "com.wingman.app.RENDER"
    }
}
