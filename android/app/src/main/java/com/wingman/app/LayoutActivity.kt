package com.wingman.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.widget.*

// Pick which tiles the widget shows and in what order. Also opens when a widget is added.
class LayoutActivity : Activity() {
    private val state = mutableListOf<Pair<TileDef, Boolean>>()
    private lateinit var col: LinearLayout
    private var title = true
    private val btnOn = mutableSetOf<String>()

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setResult(RESULT_CANCELED)
        val on = Tiles.layout(Prefs.get(this, "layout").ifEmpty { Tiles.DEFAULT })
        on.forEach { id -> state.add(Tiles.ALL.first { it.id == id } to true) }
        Tiles.ALL.filter { d -> on.none { it == d.id } }.forEach { state.add(it to false) }
        title = Prefs.get(this, "show_title") != "0"
        btnOn.addAll(Prefs.get(this, "buttons").ifEmpty { Tiles.DEFAULT_BUTTONS }.split(','))
        col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 80, 40, 80) }
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0E0E0C")); addView(col) })
        draw()
    }

    private fun txt(t: String, c: Int, size: Float = 14f) = TextView(this).apply { text = t; setTextColor(c); textSize = size; typeface = Typeface.MONOSPACE }

    private fun draw() {
        col.removeAllViews()
        col.addView(txt("WIDGET LAYOUT", AMBER, 22f))
        col.addView(txt("Tick what to show. Use ▲ ▼ to reorder. Tiles fill two per row; make the widget taller on your home screen to fit more.", DIM, 12f))
        state.forEachIndexed { i, (d, enabled) ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = android.view.Gravity.CENTER_VERTICAL; setPadding(0, 12, 0, 12) }
            row.addView(CheckBox(this).apply { text = d.title; setTextColor(PAPER); typeface = Typeface.MONOSPACE; isChecked = enabled
                setOnCheckedChangeListener { _, v -> state[i] = d to v } }, LinearLayout.LayoutParams(0, -2, 1f))
            fun mv(label: String, to: Int) = row.addView(Button(this).apply { text = label; setOnClickListener { if (to in state.indices) { state.add(to, state.removeAt(i)); draw() } } })
            mv("▲", i - 1); mv("▼", i + 1)
            col.addView(row)
        }
        col.addView(CheckBox(this).apply { text = "Show status line on top"; setTextColor(PAPER); typeface = Typeface.MONOSPACE; isChecked = title; setOnCheckedChangeListener { _, v -> title = v } })
        col.addView(txt("QUICK BUTTONS (at home)", AMBER, 14f).apply { setPadding(0, 28, 0, 4) })
        Tiles.BUTTONS.forEach { b ->
            col.addView(CheckBox(this).apply { text = b.label + if (b.id == "fly") "  (locks near your OC)" else ""; setTextColor(PAPER); typeface = Typeface.MONOSPACE
                isChecked = b.id in btnOn; setOnCheckedChangeListener { _, v -> if (v) btnOn.add(b.id) else btnOn.remove(b.id) } })
        }
        col.addView(Button(this).apply { text = "SAVE"; typeface = Typeface.MONOSPACE; setTextColor(Color.parseColor("#0E0E0C")); setBackgroundResource(R.drawable.btn_amber); setOnClickListener { save() } })
    }

    private fun save() {
        Prefs.put(this, "layout", state.filter { it.second }.joinToString(",") { it.first.id })
        Prefs.put(this, "show_title", if (title) "1" else "0"); Prefs.put(this, "buttons", Tiles.BUTTONS.map { it.id }.filter { it in btnOn }.joinToString(","))
        WingmanWidget.updateAll(this)
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        finish()
    }
}
