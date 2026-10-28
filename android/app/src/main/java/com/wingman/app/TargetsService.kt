package com.wingman.app

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONObject

// Feeds the scrollable attack list. The list comes from the target data saved by Api.refresh.
class TargetsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext)

    private class Factory(private val c: Context) : RemoteViewsFactory {
        private var items: List<JSONObject> = emptyList()
        override fun onCreate() {}
        override fun onDataSetChanged() { items = WingmanWidget.targetItems(c) }
        override fun onDestroy() {}
        override fun getCount() = items.size
        override fun getViewAt(i: Int): RemoteViews = WingmanWidget.targetRow(c, items[i], System.currentTimeMillis() / 1000)
        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount() = 1
        override fun getItemId(i: Int) = items.getOrNull(i)?.optLong("id") ?: i.toLong()
        override fun hasStableIds() = true
    }
}
