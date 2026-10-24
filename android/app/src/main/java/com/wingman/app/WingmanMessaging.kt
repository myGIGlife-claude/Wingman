package com.wingman.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class WingmanMessaging : FirebaseMessagingService() {
    override fun onMessageReceived(m: RemoteMessage) {
        m.data["model"]?.let { if (Model.parse(it) != null) { Prefs.put(this, "model", it); Prefs.put(this, "model_at", (System.currentTimeMillis() / 1000).toString()); WingmanWidget.updateAll(this) } }
        m.data["alert"]?.let { Notifier.alert(this, it, m.data["url"]?.ifEmpty { null }) }
    }

    override fun onNewToken(token: String) {
        Prefs.put(this, "token", token)
        Thread { Api.register(this, token) }.start()
    }
}
