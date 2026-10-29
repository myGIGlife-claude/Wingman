package com.wingman.app

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONObject

// Feeds the scrollable attack list. The list comes from the target data saved by Api.refresh.
class TargetsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext, intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID))

    private class Factory(private val c: Context, private val wid: Int) : RemoteViewsFactory {
        private var items: List<JSONObject> = emptyList()
        override fun onCreate() {}
        override fun onDataSetChanged() { items = WingmanWidget.targetItems(c) }
        override fun onDestroy() {}
        override fun getCount() = items.size
        override fun getViewAt(i: Int): RemoteViews = WingmanWidget.targetRow(c, items[i], System.currentTimeMillis() / 1000, wid != AppWidgetManager.INVALID_APPWIDGET_ID && WingmanWidget.widgetWidthDp(c, wid) < WingmanWidget.COMPACT_DP)
        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount() = 2 // the full and the compact row
        override fun getItemId(i: Int) = items.getOrNull(i)?.optLong("id") ?: i.toLong()
        override fun hasStableIds() = true
    }
}
