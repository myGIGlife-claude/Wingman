package com.wingman.app

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL

// Blocking calls to our own backend. Call from a background thread.
object Api {
    fun call(c: Context, method: String, path: String, body: String? = null): String? {
        val base = Prefs.get(c, "url").trimEnd('/')
        val key = Prefs.get(c, "secret")
        if (base.isEmpty() || key.isEmpty()) return null
        return try {
            val h = URL(base + path).openConnection() as HttpURLConnection
            h.requestMethod = method
            h.connectTimeout = 15000; h.readTimeout = 25000
            h.setRequestProperty("X-Wingman-Key", key)
            val payload = body ?: if (method == "POST" || method == "PUT") "{}" else null
            if (payload != null) {
                h.doOutput = true
                h.setRequestProperty("Content-Type", "application/json")
                h.outputStream.use { it.write(payload.toByteArray()) }
            }
            if (h.responseCode in 200..299) h.inputStream.bufferedReader().readText() else null
        } catch (e: Exception) { null }
    }

    // Fetch the model, store it and redraw the widget. fresh also pulls new stock data. Returns false when it failed.
    fun refresh(c: Context, fresh: Boolean = false): Boolean {
        val s = call(c, "GET", if (fresh) "/state?fresh=1" else "/state") ?: return false
        if (Model.parse(s) == null) return false
        Model.parse(s)?.facts?.optJSONObject("targets")?.let { Prefs.put(c, "targets", it.toString()); Prefs.put(c, "targets_hash", Model.parse(s)?.facts?.optString("targetsHash").orEmpty()) }
        Prefs.put(c, "model", s); Prefs.put(c, "model_at", (System.currentTimeMillis() / 1000).toString()); WingmanWidget.updateAll(c)
        return true
    }

    fun register(c: Context, token: String) {
        call(c, "POST", "/register", """{"fcmToken":"$token","platform":"android"}""")
    }
}
