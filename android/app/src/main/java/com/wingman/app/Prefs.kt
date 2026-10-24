package com.wingman.app

import android.content.Context

// Backend URL, app secret and the last widget model. No Torn API key lives in the app.
object Prefs {
    private fun sp(c: Context) = c.getSharedPreferences("wingman", Context.MODE_PRIVATE)
    fun get(c: Context, k: String) = sp(c).getString(k, "") ?: ""
    fun put(c: Context, k: String, v: String) = sp(c).edit().putString(k, v).apply()
}
