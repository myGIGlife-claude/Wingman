package com.wingman.app

import android.content.Context
import android.content.Intent
import android.net.Uri

// Opens a Torn page for the player. Torn PDA first, then PDA's main screen, then the browser.
object Opener {
    private const val PDA = "com.manuito.tornpda"

    fun open(c: Context, url: String) {
        val view = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val tryList = listOf(
            Intent(view).setPackage(PDA),
            c.packageManager.getLaunchIntentForPackage(PDA),
            view,
        )
        for (i in tryList) {
            if (i == null) continue
            try { c.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return } catch (e: Exception) { /* next */ }
        }
    }
}
