package com.wingman.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

// The focused widgets. Each draws one part of the same model with the shared sections in WingmanWidget.
abstract class KindWidget(private val kind: String) : AppWidgetProvider() {
    override fun onUpdate(c: Context, m: AppWidgetManager, ids: IntArray) {
        ids.forEach { m.updateAppWidget(it, WingmanWidget.build(c, kind, it)) }
        if (kind == "targets") m.notifyAppWidgetViewDataChanged(ids, R.id.tgt_list)
        Thread { Api.refresh(c) }.start()
    }
}

class StatusWidget : KindWidget("status")
class OcWidget : KindWidget("oc")
class TripWidget : KindWidget("trip")
class StockWidget : KindWidget("stock")
class ActionsWidget : KindWidget("actions")
class TargetsWidget : KindWidget("targets")
