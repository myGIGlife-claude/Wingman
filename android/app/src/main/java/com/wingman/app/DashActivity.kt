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

// Build your own Dashboard widget. One tab per section (Travel, Bars, Cooldowns, ...) to switch items on and off, and a Layout tab to order what is shown.
open class DashActivity : Activity() {
    // The Actions widget editor reuses this screen with buttons only, saved per widget.
    protected open val actions = false
    private val wid get() = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    private val prefKey get() = if (actions) "actions_$wid" else "dash"
    private val catalog get() = Tiles.DASH.filter { !actions || it.button }
    private val state = mutableListOf<Pair<DashDef, Boolean>>()
    private val names = Array(4) { "" }; private val paths = Array(4) { "" }
    private lateinit var col: LinearLayout
    private lateinit var tabs: LinearLayout
    private var tab = "Layout"
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        setResult(RESULT_CANCELED)
        val on = Tiles.dash(Prefs.get(this, prefKey).ifEmpty { if (actions) Tiles.ACTIONS_DEFAULT else Tiles.DASH_DEFAULT }).filter { id -> catalog.any { it.id == id } }
        on.forEach { id -> state.add(catalog.first { it.id == id } to true) }
        catalog.filter { d -> on.none { it == d.id } }.forEach { state.add(it to false) }
        try { JSONArray(Prefs.get(this, "custom")).let { a -> for (i in 0 until minOf(4, a.length())) { names[i] = a.getJSONObject(i).optString("name"); paths[i] = a.getJSONObject(i).optString("path") } } } catch (e: Exception) { /* none yet */ }
        col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(8), dp(16), dp(16)) }
        tabs = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(dp(12), dp(4), dp(12), dp(8)) }
        val head = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(16), dp(16), 0) }
        head.addView(txt(if (actions) "ACTION BUTTONS" else "DASHBOARD WIDGET", AMBER, 24f, true).apply { letterSpacing = 0.1f })
        head.addView(txt(if (actions) "Pick the buttons for this widget and their order. Make the widget one column wide to stack them vertically." else "Pick a section, switch things on, then order them in Layout.", DIM, 13f).apply { setPadding(0, dp(6), 0, dp(6)) })
        // The Save button stays pinned at the bottom so it is always reachable.
        val save = Button(this).apply {
            text = "SAVE"; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); textSize = 14f; letterSpacing = 0.1f
            setTextColor(Color.parseColor("#0E0E0C")); setBackgroundResource(R.drawable.btn_amber); setOnClickListener { save() }
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.parseColor("#0E0E0C"))
            addView(head); addView(HorizontalScrollView(this@DashActivity).apply { isHorizontalScrollBarEnabled = false; addView(tabs) })
            addView(ScrollView(this@DashActivity).apply { addView(col) }, LinearLayout.LayoutParams(-1, 0, 1f))
            addView(save, LinearLayout.LayoutParams(-1, dp(54)).apply { setMargins(dp(16), dp(8), dp(16), dp(12)) })
        }
        setContentView(root); Ui.fitSystemBars(root)
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
        r.addView(Ui.pill(this, enabled) { v -> val i = state.indexOfFirst { it.first === d }; state.removeAt(i); if (v) state.add(d to true) else state.add(i, d to false); draw() })
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

    private fun sections() = (listOf("Layout") + Tiles.GROUPS.filter { g -> catalog.any { Tiles.group(it) == g } }).let { if (actions) listOf("Layout", "Shortcuts") else it }

    private fun chip(label: String, sel: Boolean, onTap: () -> Unit) = TextView(this).apply {
        text = label; typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD); textSize = 13f; letterSpacing = 0.06f; gravity = Gravity.CENTER
        setTextColor(if (sel) Color.parseColor("#0E0E0C") else DIM); setBackgroundResource(if (sel) R.drawable.pill_on else R.drawable.pill_off)
        setPadding(dp(14), 0, dp(14), 0); minHeight = dp(38); setOnClickListener { onTap() }
    }

    private fun draw() {
        val shown = state.indices.filter { state[it].second }
        tabs.removeAllViews()
        sections().forEach { s ->
            val n = if (s == "Layout") shown.size else shown.count { Tiles.group(state[it].first) == s }
            tabs.addView(chip(if (n > 0) "${s.uppercase()} $n" else s.uppercase(), s == tab) { tab = s; draw() }, LinearLayout.LayoutParams(-2, dp(38)).apply { rightMargin = dp(8) })
        }
        col.removeAllViews()
        if (tab == "Layout") {
            col.addView(txt("Shown on the widget, in this order. Live tiles come first, then buttons.", DIM, 12f).apply { setPadding(0, dp(4), 0, dp(10)) })
            shown.forEachIndexed { pos, i ->
                col.addView(row(state[i].first, true,
                    if (pos > 0) { { state.add(shown[pos - 1], state.removeAt(i)); draw() } } else null,
                    if (pos < shown.size - 1) { { state.add(shown[pos + 1], state.removeAt(i)); draw() } } else null))
            }
            if (shown.isEmpty()) col.addView(txt("Nothing yet. Open a section and switch something on.", DIM, 13f))
            return
        }
        val items = state.indices.filter { Tiles.group(state[it].first) == tab }
        items.forEach { i -> col.addView(row(state[i].first, state[i].second, null, null)) }
        if (tab == "Shortcuts") {
            col.addView(txt("YOUR OWN SHORTCUTS", AMBER, 14f, true).apply { setPadding(0, dp(20), 0, dp(4)) })
            col.addView(txt("Give a short name and a Torn page path, for example /bazaar.php or /page.php?sid=slots. Then switch the shortcut ON above. Only torn.com pages work.", DIM, 12f))
            for (i in 0 until 4) {
                val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(6), 0, 0) }
                line.addView(field("Name", names[i]) { names[i] = it }, LinearLayout.LayoutParams(0, -2, 1f))
                line.addView(field("/path.php", paths[i]) { paths[i] = it }, LinearLayout.LayoutParams(0, -2, 2f))
                col.addView(line)
            }
        }
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
