package com.wingman.app

import android.app.Activity
import android.os.Bundle

// Invisible hop so widget and notification taps can use the fallback chain in Opener.
class OpenActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        val before = intent.getLongExtra("before", 0L)
        if (before > 0 && System.currentTimeMillis() / 1000 > before) {
            android.widget.Toast.makeText(this, "Too close to your OC to fly. Stay in Torn.", android.widget.Toast.LENGTH_LONG).show()
        } else intent.getStringExtra("url")?.let { Opener.open(this, it) }
        finish()
    }
}
