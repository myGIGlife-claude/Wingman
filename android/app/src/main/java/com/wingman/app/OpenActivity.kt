package com.wingman.app

import android.app.Activity
import android.os.Bundle

// Invisible hop so widget and notification taps can use the fallback chain in Opener.
class OpenActivity : Activity() {
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        intent.getStringExtra("url")?.let { Opener.open(this, it) }
        finish()
    }
}
