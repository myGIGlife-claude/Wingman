package com.wingman.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Widget/notification buttons that talk to our backend: BOUGHT and refresh.
class ActionReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        val pending = goAsync()
        Thread {
            try {
                if (i.action == ACTION_BOUGHT) Api.call(c, "POST", "/bought")
                Api.refresh(c)
            } finally { pending.finish() }
        }.start()
    }

    companion object {
        const val ACTION_BOUGHT = "com.wingman.app.BOUGHT"
        const val ACTION_REFRESH = "com.wingman.app.REFRESH"
    }
}
