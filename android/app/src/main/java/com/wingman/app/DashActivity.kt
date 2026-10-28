package com.wingman.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject

// Build your own Dashboard widget: choose live tiles and shortcut buttons, order them, and add your own Torn page shortcuts.
open class DashActivity : Activity() {
    // The Actions widget editor reuses this screen with buttons only, saved per widget.
    protected open val actions = false
    private val wid get() = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    private val prefKey get() = if (actions) "actions_$wid" else "dash"
    private val catalog get() = Tiles.DASH.filter { !actions || it.button }
    private val state = mutableListOf<Pair<DashDef, Boolean>>()
    private val names = Array(4) { "" }; private val paths = Array(4) { "" }
    private lateinit var col: LinearLayout
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setResult(RESULT_CANCELED)
        val on = Tiles.dash(Prefs.get(this, prefKey).ifEmpty { if (actions) Tiles.ACTIONS_DEFAULT else Tiles.DASH_DEFAULT }).filter { id -> catalog.any { it.id == id } }
        on.forEach { id -> state.add(catalog.first { it.id == id } to true) }
        catalog.filter { d -> on.none { it == d.id } }.forEach { state.add(it to false) }
        try { JSONArray(Prefs.get(this, "custom")).let { a -> for (i in 0 until minOf(4, a.length())) { names[i] = a.getJSONObject(i).optString("name"); paths[i] = a.getJSONObject(i).optString("path") } } } catch (e: Exception) { /* none yet */ }
        col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), dp(24)) }
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.parseColor("#0E0E0C")); addView(col); Ui.fitSystemBars(this) })
        draw()
    }

    private fun txt(t: String, c: Int, size: Float, bold: Boolean = false) = TextView(this).apply {
        text = t; setTextColor(c); textSize = size; typeface = if (bold) Typeface.create(Typeface.MONOSPACE, Typeface.BOLD) else Typeface.MONOSPACE
    }

    private fun title(d: DashDef): String {
        val i = d.id.removePrefix("c").toIntOrNull()?.minus(1)
        return if (d.id.startsWith("c") && i != null && names[i].isNotEmpty()) "Shortcut: ${names[i]}" else d.title
    }

    private fun row(d: DashDef, enabled: Boolean, up: (() -> Unit)?, down: (() -> Unit)?): LinearLayout {
        val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setBackgroundResource(R.drawable.card_bg); setPadding(dp(14), dp(10), dp(10), dp(10)) }
        r.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) }
        val kind = if (d.button) "BUTTON" else "LIVE TILE"
        val t = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        t.addView(txt(title(d), if (enabled) PAPER else DIM, 14f)); t.addView(txt(kind, DIM, 11f))
        r.addView(t, LinearLayout.LayoutParams(0, -2, 1f))
        fun arrow(s: String, f: () -> Unit) = Button(this).apply {
            text = s; setTextColor(PAPER); textSize = 14f; setBackgroundResource(R.drawable.btn_ghost); minWidth = 0; minimumWidth = 0; setPadding(0, 0, 0, 0); setOnClickListener { f() }
        }.also { r.addView(it, LinearLayout.LayoutParams(dp(40), dp(40)).apply { rightMargin = dp(6) }) }
        up?.let { arrow("▲", it) }; down?.let { arrow("▼", it) }
        r.addView(Ui.pill(this, enabled) { v -> val i = state.indexOfFirst { it.first === d }; state[i] = d to v; draw() })
        return r
    }

    private fun field(hint: String, value: String, onText: (String) -> Unit) = EditText(this).apply {
        setHint(hint); setText(value); setTextColor(PAPER); setHintTextColor(DIM); typeface = Typeface.MONOSPACE; setSingleLine(); textSize = 14f
        addTextChangedListener(object : android.text.TextWatcher {
            override fun afterTextChanged(s: android.text.Editable?) { onText(s.toString()) }
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })
    }

    private fun draw() {
        col.removeAllViews()
        col.addView(txt(if (actions) "ACTION BUTTONS" else "DASHBOARD WIDGET", AMBER, 24f, true).apply { letterSpacing = 0.1f })
        col.addView(txt(if (actions) "Pick the buttons for this widget and their order. Tap ON or OFF; use ▲ ▼ to move. Make the widget one column wide to stack them vertically." else "Pick what appears. Live tiles show first, then the buttons, each in the order below. Tap ON or OFF; use ▲ ▼ to move.", DIM, 13f).apply { setPadding(0, dp(6), 0, 0) })
        val shown = state.indices.filter { state[it].second }
        col.addView(txt("SHOWN (${shown.size})", DIM, 12f, true).apply { letterSpacing = 0.1f; setPadding(0, dp(20), 0, dp(6)) })
        shown.forEachIndexed { pos, i ->
            col.addView(row(state[i].first, true,
                if (pos > 0) { { state.add(shown[pos - 1], state.removeAt(i)); draw() } } else null,
                if (pos < shown.size - 1) { { state.add(shown[pos + 1], state.removeAt(i)); draw() } } else null))
        }
        val hidden = state.indices.filter { !state[it].second }
        col.addView(txt("HIDDEN (${hidden.size})", DIM, 12f, true).apply { letterSpacing = 0.1f; setPadding(0, dp(20), 0, dp(6)) })
        hidden.forEach { i -> col.addView(row(state[i].first, false, null, null)) }

        col.addView(txt("YOUR OWN SHORTCUTS", AMBER, 14f, true).apply { setPadding(0, dp(24), 0, dp(4)) })
        col.addView(txt("Give a short name and a Torn page path, for example /bazaar.php or /page.php?sid=slots. Then switch the shortcut ON above. Only torn.com pages work.", DIM, 12f))
        for (i in 0 until 4) {
            val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(6), 0, 0) }
            line.addView(field("Name", names[i]) { names[i] = it }, LinearLayout.LayoutParams(0, -2, 1f))
            line.addView(field("/path.php", paths[i]) { paths[i] = it }, LinearLayout.LayoutParams(0, -2, 2f))
            col.addView(line)
        }
        col.addView(Button(this).apply {
            text = "SAVE"; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); textSize = 14f; letterSpacing = 0.1f
            setTextColor(Color.parseColor("#0E0E0C")); setBackgroundResource(R.drawable.btn_amber); setOnClickListener { save() }
        }, LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(16) })
    }

    private fun save() {
        val custom = JSONArray().also { a -> for (i in 0 until 4) a.put(JSONObject().put("name", names[i].trim()).put("path", paths[i].trim().let { if (it.startsWith("/")) it else if (it.isEmpty()) "" else "/$it" })) }
        Prefs.put(this, "custom", custom.toString())
        Prefs.put(this, prefKey, state.filter { it.second }.joinToString(",") { it.first.id })
        WingmanWidget.updateAll(this)
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid))
        finish()
    }
}
