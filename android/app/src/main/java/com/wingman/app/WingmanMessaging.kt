package com.wingman.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class WingmanMessaging : FirebaseMessagingService() {
    override fun onMessageReceived(m: RemoteMessage) {
        m.data["model"]?.let { json ->
            val facts = Model.parse(json)?.facts ?: return@let
            Prefs.put(this, "model", json); Prefs.put(this, "model_at", (System.currentTimeMillis() / 1000).toString())
            WingmanWidget.updateAll(this)
            // The attack list is too big for a push, so a changed fingerprint means: fetch the full list.
            val h = facts.optString("targetsHash")
            if (h.isNotEmpty() && h != Prefs.get(this, "targets_hash")) Thread { Api.refresh(this) }.start()
        }
        m.data["alert"]?.let { Notifier.alert(this, it, m.data["url"]?.ifEmpty { null }) }
    }

    override fun onNewToken(token: String) {
        Prefs.put(this, "token", token)
        Thread { Api.register(this, token) }.start()
    }
}
