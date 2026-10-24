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
            if (body != null) {
                h.doOutput = true
                h.setRequestProperty("Content-Type", "application/json")
                h.outputStream.use { it.write(body.toByteArray()) }
            }
            if (h.responseCode in 200..299) h.inputStream.bufferedReader().readText() else null
        } catch (e: Exception) { null }
    }

    // Fetch the model, store it and redraw the widget.
    fun refresh(c: Context) {
        val s = call(c, "GET", "/state") ?: return
        if (Model.parse(s) != null) { Prefs.put(c, "model", s); WingmanWidget.updateAll(c) }
    }

    fun register(c: Context, token: String) {
        call(c, "POST", "/register", """{"fcmToken":"$token","platform":"android"}""")
    }
}
