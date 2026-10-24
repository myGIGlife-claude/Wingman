package com.wingman.app

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

// 15-minute fallback in case a push is missed (Samsung kills background work).
class RefreshWorker(c: Context, p: WorkerParameters) : Worker(c, p) {
    override fun doWork(): Result { Api.refresh(applicationContext); return Result.success() }
}
