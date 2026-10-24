package com.wingman.app

import android.app.Application
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifier.channels(this)
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "refresh", ExistingPeriodicWorkPolicy.KEEP, PeriodicWorkRequestBuilder<RefreshWorker>(15, TimeUnit.MINUTES).build())
    }
}
