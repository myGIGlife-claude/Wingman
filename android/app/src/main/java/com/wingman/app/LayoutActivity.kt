package com.wingman.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.*

// Pick which parts the widget shows and in what order. Also opens when a widget is added.
class LayoutActivity : Activity() {
    private val state = mutableListOf<Pair<TileDef, Boolean>>()
    private lateinit var col: LinearLayout
    private var title = true
    private val btnOn = mutableSetOf<String>()
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setResult(RESULT_CANCELED)
        val on = Tiles.layout(Prefs.get(this, "layout").ifEmpty { Tiles.DEFAULT })
        on.forEach { id -> state.add(Tiles.ALL.first { it.id == id } to true) }
        Tiles.ALL.filter { d -> on.none { it == d.id } }.forEach { state.add(it to false) }
        title = Prefs.get(this, "show_title") != "0"
        btnOn.addAll(Prefs.get(this, "buttons").ifEmpty { Tiles.DEFAULT_BUTTONS }.split(','))
        col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(40), dp(16), dp(40)) }
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0E0E0C")); addView(col) })
        draw()
    }

    private fun txt(t: String, c: Int, size: Float, bold: Boolean = false) = TextView(this).apply {
        text = t; setTextColor(c); textSize = size; typeface = if (bold) Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) else Typeface.MONOSPACE
    }

    private fun group(name: String) = col.addView(txt(name, DIM, 12f, true).apply { letterSpacing = 0.1f; setPadding(0, dp(20), 0, dp(6)) })

    private fun row(label: String, enabled: Boolean, onToggle: (Boolean) -> Unit, up: (() -> Unit)? = null, down: (() -> Unit)? = null, note: String = ""): LinearLayout {
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setBackgroundResource(R.drawable.card_bg); setPadding(dp(14), dp(10), dp(10), dp(10)) }
        r.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) }
        val names = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        names.addView(txt(label, if (enabled) PAPER else DIM, 14f))
        if (note.isNotEmpty()) names.addView(txt(note, AMBER, 11f))
        r.addView(names, LinearLayout.LayoutParams(0, -2, 1f))
        fun arrow(s: String, f: () -> Unit) = Button(this).apply {
            text = s; setTextColor(PAPER); textSize = 14f; setBackgroundResource(R.drawable.btn_ghost); minWidth = 0; minimumWidth = 0
            setPadding(0, 0, 0, 0); setOnClickListener { f() }
        }.also { r.addView(it, LinearLayout.LayoutParams(dp(40), dp(40)).apply { rightMargin = dp(6) }) }
        up?.let { arrow("▲", it) }; down?.let { arrow("▼", it) }
        r.addView(Ui.pill(this, enabled) { onToggle(it) })
        return r
    }

    private fun draw() {
        col.removeAllViews()
        col.addView(txt("WIDGET LAYOUT", AMBER, 24f, true).apply { letterSpacing = 0.12f })
        col.addView(txt("Tap ON or OFF to show or hide a part of the widget. Use ▲ ▼ to move shown parts.", DIM, 13f).apply { setPadding(0, dp(6), 0, 0) })

        val shown = state.indices.filter { state[it].second }
        group("SHOWN (${shown.size})")
        shown.forEachIndexed { pos, i ->
            val (d, _) = state[i]
            col.addView(row(d.title, true, { state[i] = d to false; draw() },
                up = if (pos > 0) { { state.add(shown[pos - 1], state.removeAt(i)); draw() } } else null,
                down = if (pos < shown.size - 1) { { state.add(shown[pos + 1], state.removeAt(i)); draw() } } else null))
        }
        if (shown.isEmpty()) col.addView(txt("Nothing shown yet.", DIM, 13f))
        val hidden = state.indices.filter { !state[it].second }
        group("HIDDEN (${hidden.size})")
        hidden.forEach { i -> val (d, _) = state[i]; col.addView(row(d.title, false, { state[i] = d to true; draw() })) }

        group("QUICK BUTTONS AT HOME")
        Tiles.BUTTONS.forEach { b ->
            col.addView(row(b.label, b.id in btnOn, { if (it) btnOn.add(b.id) else btnOn.remove(b.id); draw() }, note = if (b.id == "fly") "locks near your OC" else ""))
        }
        group("OTHER")
        col.addView(row("Status line on top", title, { title = it; draw() }))
        col.addView(Button(this).apply {
            text = "SAVE"; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); textSize = 14f; letterSpacing = 0.1f
            setTextColor(Color.parseColor("#0E0E0C")); setBackgroundResource(R.drawable.btn_amber); setOnClickListener { save() }
        }, LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(16) })
    }

    private fun save() {
        Prefs.put(this, "layout", state.filter { it.second }.joinToString(",") { it.first.id })
        Prefs.put(this, "show_title", if (title) "1" else "0")
        Prefs.put(this, "buttons", Tiles.BUTTONS.map { it.id }.filter { it in btnOn }.joinToString(","))
        WingmanWidget.updateAll(this)
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        finish()
    }
}
